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

    const workspaces = await Promise.all(memberships.map((m) => ctx.db.get(m.workspaceId)));

    return workspaces.filter(Boolean).map((ws, i) => ({
      ...ws,
      role: memberships[i].role,
    }));
  },
});

export const getMembers = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const memberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();

    const members = await Promise.all(
      memberships.map(async (m) => {
        const user = await ctx.db.get(m.userId);
        return user
          ? {
              membershipId: m._id,
              userId: m.userId,
              role: m.role,
              joinedAt: m.joinedAt,
              name: user.name,
              email: user.email,
              avatarUrl: user.avatarUrl,
              githubUsername: user.githubUsername,
            }
          : null;
      })
    );

    return members.filter((m): m is NonNullable<typeof m> => m !== null);
  },
});

export const getUserMembership = query({
  args: {
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_and_user", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", args.userId)
      )
      .first();
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
          v.union(v.literal("critical"), v.literal("high"), v.literal("medium"), v.literal("low"))
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

export const updateMemberRole = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
    role: v.union(v.literal("admin"), v.literal("member"), v.literal("viewer")),
  },
  handler: async (ctx, args) => {
    const membership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_and_user", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", args.userId)
      )
      .first();

    if (!membership) {
      throw new Error("Membership not found");
    }

    await ctx.db.patch(membership._id, { role: args.role });
  },
});

export const deleteWorkspace = mutation({
  args: { id: v.id("workspaces") },
  handler: async (ctx, args) => {
    const workspace = await ctx.db.get(args.id);
    if (!workspace) {
      throw new Error("Workspace not found");
    }

    // Delete all workspace members
    const members = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.id))
      .collect();
    for (const member of members) {
      await ctx.db.delete(member._id);
    }

    // Delete all tasks
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.id))
      .collect();
    for (const task of tasks) {
      await ctx.db.delete(task._id);
    }

    // Delete all repositories
    const repos = await ctx.db
      .query("repositories")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.id))
      .collect();
    for (const repo of repos) {
      await ctx.db.delete(repo._id);
    }

    // Delete all channel mappings
    const channels = await ctx.db
      .query("channelMappings")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.id))
      .collect();
    for (const channel of channels) {
      await ctx.db.delete(channel._id);
    }

    // Delete workspace counter
    const counter = await ctx.db
      .query("workspaceCounters")
      .withIndex("by_workspace_and_type", (q) =>
        q.eq("workspaceId", args.id).eq("counterType", "task_number")
      )
      .first();
    if (counter) {
      await ctx.db.delete(counter._id);
    }

    // Finally delete the workspace
    await ctx.db.delete(args.id);
  },
});

// ===========================================
// USAGE TRACKING
// ===========================================

const DEFAULT_AI_LIMIT = 2000; // Monthly limit per workspace
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

export const checkAiUsage = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const workspace = await ctx.db.get(args.workspaceId);
    if (!workspace) return { allowed: false, reason: "workspace_not_found" };

    const now = Date.now();
    const usage = workspace.usage ?? {
      aiCallsThisMonth: 0,
      aiCallsLimit: DEFAULT_AI_LIMIT,
      lastResetAt: now,
    };

    // Reset if month has passed
    const shouldReset = now - usage.lastResetAt > MONTH_MS;
    const currentCalls = shouldReset ? 0 : usage.aiCallsThisMonth;
    const limit = usage.aiCallsLimit || DEFAULT_AI_LIMIT;

    // 0 = unlimited
    if (limit === 0) {
      return { allowed: true, remaining: Infinity, used: currentCalls };
    }

    const remaining = Math.max(0, limit - currentCalls);
    return {
      allowed: remaining > 0,
      remaining,
      used: currentCalls,
      limit,
      resetsAt: usage.lastResetAt + MONTH_MS,
    };
  },
});

export const incrementAiUsage = mutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const workspace = await ctx.db.get(args.workspaceId);
    if (!workspace) return { success: false };

    const now = Date.now();
    const usage = workspace.usage ?? {
      aiCallsThisMonth: 0,
      aiCallsLimit: DEFAULT_AI_LIMIT,
      lastResetAt: now,
    };

    // Reset if month has passed
    const shouldReset = now - usage.lastResetAt > MONTH_MS;

    await ctx.db.patch(args.workspaceId, {
      usage: {
        aiCallsThisMonth: shouldReset ? 1 : usage.aiCallsThisMonth + 1,
        aiCallsLimit: usage.aiCallsLimit || DEFAULT_AI_LIMIT,
        lastResetAt: shouldReset ? now : usage.lastResetAt,
      },
      updatedAt: now,
    });

    return { success: true };
  },
});

export const setAiLimit = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    limit: v.number(), // 0 = unlimited
  },
  handler: async (ctx, args) => {
    const workspace = await ctx.db.get(args.workspaceId);
    if (!workspace) return;

    const now = Date.now();
    const usage = workspace.usage ?? {
      aiCallsThisMonth: 0,
      aiCallsLimit: DEFAULT_AI_LIMIT,
      lastResetAt: now,
    };

    await ctx.db.patch(args.workspaceId, {
      usage: {
        ...usage,
        aiCallsLimit: args.limit,
      },
      updatedAt: now,
    });
  },
});
