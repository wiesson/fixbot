import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ===========================================
// QUERIES
// ===========================================

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("workspaces").collect();
  },
});

export const getById = query({
  args: { id: v.id("workspaces") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
  },
});

export const getBySlackTeamId = query({
  args: { slackTeamId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("workspaces")
      .withIndex("by_slack_team_id", (q) => q.eq("slackTeamId", args.slackTeamId))
      .first();
  },
});

export const getForUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const memberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const workspaces = await Promise.all(
      memberships.map((m) => ctx.db.get(m.workspaceId))
    );

    return workspaces.filter(Boolean).map((ws, i) => ({
      ...ws,
      role: memberships[i].role,
    }));
  },
});

// ===========================================
// MUTATIONS
// ===========================================

export const create = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
    slackTeamId: v.string(),
    slackTeamName: v.string(),
    slackBotUserId: v.optional(v.string()),
    createdByUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if slug is unique
    const existing = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (existing) {
      throw new Error("Workspace with this slug already exists");
    }

    const workspaceId = await ctx.db.insert("workspaces", {
      name: args.name,
      slug: args.slug,
      slackTeamId: args.slackTeamId,
      slackTeamName: args.slackTeamName,
      slackBotUserId: args.slackBotUserId,
      settings: {
        aiExtractionEnabled: true,
      },
      createdAt: now,
      updatedAt: now,
    });

    // Add creator as admin if provided
    if (args.createdByUserId) {
      await ctx.db.insert("workspaceMembers", {
        workspaceId,
        userId: args.createdByUserId,
        role: "admin",
        joinedAt: now,
      });
    }

    return workspaceId;
  },
});

export const update = mutation({
  args: {
    id: v.id("workspaces"),
    name: v.optional(v.string()),
    settings: v.optional(
      v.object({
        defaultTaskPriority: v.optional(
          v.union(
            v.literal("critical"),
            v.literal("high"),
            v.literal("medium"),
            v.literal("low")
          )
        ),
        aiExtractionEnabled: v.boolean(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const workspace = await ctx.db.get(args.id);
    if (!workspace) throw new Error("Workspace not found");

    await ctx.db.patch(args.id, {
      ...(args.name ? { name: args.name } : {}),
      ...(args.settings ? { settings: args.settings } : {}),
      updatedAt: Date.now(),
    });
  },
});

export const addMember = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
    role: v.union(v.literal("admin"), v.literal("member"), v.literal("viewer")),
    invitedById: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    // Check if already a member
    const existing = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_and_user", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", args.userId)
      )
      .first();

    if (existing) {
      throw new Error("User is already a member of this workspace");
    }

    await ctx.db.insert("workspaceMembers", {
      workspaceId: args.workspaceId,
      userId: args.userId,
      role: args.role,
      joinedAt: Date.now(),
      invitedById: args.invitedById,
    });
  },
});

export const removeMember = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const membership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_and_user", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", args.userId)
      )
      .first();

    if (membership) {
      await ctx.db.delete(membership._id);
    }
  },
});
