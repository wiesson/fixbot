import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function generateToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

// ===========================================
// QUERIES
// ===========================================

export const getByToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const invitation = await ctx.db
      .query("workspaceInvitations")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!invitation) return null;

    // Get workspace and inviter details
    const workspace = await ctx.db.get(invitation.workspaceId);
    const invitedBy = await ctx.db.get(invitation.invitedById);

    return {
      ...invitation,
      workspace: workspace
        ? { _id: workspace._id, name: workspace.name, slug: workspace.slug }
        : null,
      invitedBy: invitedBy
        ? { _id: invitedBy._id, name: invitedBy.name, avatarUrl: invitedBy.avatarUrl }
        : null,
    };
  },
});

export const getPendingForWorkspace = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const invitations = await ctx.db
      .query("workspaceInvitations")
      .withIndex("by_workspace_and_status", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("status", "pending")
      )
      .collect();

    // Get inviter details
    const withInviters = await Promise.all(
      invitations.map(async (inv) => {
        const invitedBy = await ctx.db.get(inv.invitedById);
        return {
          ...inv,
          invitedBy: invitedBy
            ? { _id: invitedBy._id, name: invitedBy.name, avatarUrl: invitedBy.avatarUrl }
            : null,
        };
      })
    );

    return withInviters;
  },
});

export const getForGithubUsername = query({
  args: { githubUsername: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("workspaceInvitations")
      .withIndex("by_github_username", (q) => q.eq("githubUsername", args.githubUsername.toLowerCase()))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();
  },
});

// ===========================================
// MUTATIONS
// ===========================================

export const create = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    githubUsername: v.string(),
    role: v.union(v.literal("admin"), v.literal("member"), v.literal("viewer")),
    invitedById: v.id("users"),
  },
  handler: async (ctx, args) => {
    const normalizedUsername = args.githubUsername.toLowerCase();
    const now = Date.now();

    // Check if user already exists
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_github_username", (q) => q.eq("githubUsername", normalizedUsername))
      .first();

    if (existingUser) {
      // Check if already a member
      const existingMembership = await ctx.db
        .query("workspaceMembers")
        .withIndex("by_workspace_and_user", (q) =>
          q.eq("workspaceId", args.workspaceId).eq("userId", existingUser._id)
        )
        .first();

      if (existingMembership) {
        throw new Error("User is already a member of this workspace");
      }

      // Add user directly to workspace
      await ctx.db.insert("workspaceMembers", {
        workspaceId: args.workspaceId,
        userId: existingUser._id,
        role: args.role,
        joinedAt: now,
        invitedById: args.invitedById,
      });

      return { type: "added_directly" as const, userId: existingUser._id };
    }

    // Check for existing pending invitation
    const existingInvitation = await ctx.db
      .query("workspaceInvitations")
      .withIndex("by_github_username", (q) => q.eq("githubUsername", normalizedUsername))
      .filter((q) =>
        q.and(
          q.eq(q.field("workspaceId"), args.workspaceId),
          q.eq(q.field("status"), "pending")
        )
      )
      .first();

    if (existingInvitation) {
      throw new Error("An invitation for this user is already pending");
    }

    // Create new invitation
    const token = generateToken();
    const invitationId = await ctx.db.insert("workspaceInvitations", {
      workspaceId: args.workspaceId,
      githubUsername: normalizedUsername,
      role: args.role,
      invitedById: args.invitedById,
      token,
      expiresAt: now + SEVEN_DAYS_MS,
      status: "pending",
      createdAt: now,
    });

    return { type: "invitation_created" as const, invitationId, token };
  },
});

export const accept = mutation({
  args: {
    token: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const invitation = await ctx.db
      .query("workspaceInvitations")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!invitation) {
      throw new Error("Invitation not found");
    }

    if (invitation.status !== "pending") {
      throw new Error(`Invitation has already been ${invitation.status}`);
    }

    if (invitation.expiresAt < Date.now()) {
      await ctx.db.patch(invitation._id, { status: "expired" });
      throw new Error("Invitation has expired");
    }

    // Verify the accepting user matches the invited GitHub username
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    if (user.githubUsername.toLowerCase() !== invitation.githubUsername.toLowerCase()) {
      throw new Error("This invitation was sent to a different GitHub user");
    }

    // Check if already a member
    const existingMembership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_and_user", (q) =>
        q.eq("workspaceId", invitation.workspaceId).eq("userId", args.userId)
      )
      .first();

    if (existingMembership) {
      // Mark invitation as accepted but don't add again
      await ctx.db.patch(invitation._id, {
        status: "accepted",
        acceptedAt: Date.now(),
        acceptedByUserId: args.userId,
      });
      return { alreadyMember: true, workspaceId: invitation.workspaceId };
    }

    const now = Date.now();

    // Add user to workspace
    await ctx.db.insert("workspaceMembers", {
      workspaceId: invitation.workspaceId,
      userId: args.userId,
      role: invitation.role,
      joinedAt: now,
      invitedById: invitation.invitedById,
    });

    // Mark invitation as accepted
    await ctx.db.patch(invitation._id, {
      status: "accepted",
      acceptedAt: now,
      acceptedByUserId: args.userId,
    });

    return { alreadyMember: false, workspaceId: invitation.workspaceId };
  },
});

export const acceptByGithubUsername = mutation({
  args: {
    githubUsername: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const normalizedUsername = args.githubUsername.toLowerCase();
    const now = Date.now();

    // Find all pending invitations for this GitHub username
    const pendingInvitations = await ctx.db
      .query("workspaceInvitations")
      .withIndex("by_github_username", (q) => q.eq("githubUsername", normalizedUsername))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();

    const results: { workspaceId: string; accepted: boolean; expired: boolean }[] = [];

    for (const invitation of pendingInvitations) {
      if (invitation.expiresAt < now) {
        await ctx.db.patch(invitation._id, { status: "expired" });
        results.push({ workspaceId: invitation.workspaceId as string, accepted: false, expired: true });
        continue;
      }

      // Check if already a member
      const existingMembership = await ctx.db
        .query("workspaceMembers")
        .withIndex("by_workspace_and_user", (q) =>
          q.eq("workspaceId", invitation.workspaceId).eq("userId", args.userId)
        )
        .first();

      if (!existingMembership) {
        // Add user to workspace
        await ctx.db.insert("workspaceMembers", {
          workspaceId: invitation.workspaceId,
          userId: args.userId,
          role: invitation.role,
          joinedAt: now,
          invitedById: invitation.invitedById,
        });
      }

      // Mark invitation as accepted
      await ctx.db.patch(invitation._id, {
        status: "accepted",
        acceptedAt: now,
        acceptedByUserId: args.userId,
      });

      results.push({ workspaceId: invitation.workspaceId as string, accepted: true, expired: false });
    }

    return results;
  },
});

export const cancel = mutation({
  args: { invitationId: v.id("workspaceInvitations") },
  handler: async (ctx, args) => {
    const invitation = await ctx.db.get(args.invitationId);
    if (!invitation) {
      throw new Error("Invitation not found");
    }

    if (invitation.status !== "pending") {
      throw new Error(`Cannot cancel invitation that is ${invitation.status}`);
    }

    await ctx.db.patch(args.invitationId, { status: "cancelled" });
  },
});
