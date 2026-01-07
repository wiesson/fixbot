import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ===========================================
// QUERIES
// ===========================================

export const getById = query({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getByGithubId = query({
  args: { githubId: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_github_id", (q) => q.eq("githubId", args.githubId))
      .first();
  },
});

export const getByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
  },
});

export const getBySessionToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!session || session.expiresAt < Date.now()) {
      return null;
    }

    return await ctx.db.get(session.userId);
  },
});

export const me = query({
  args: { sessionToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (!args.sessionToken) return null;

    const token = args.sessionToken;
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();

    if (!session || session.expiresAt < Date.now()) {
      return null;
    }

    const user = await ctx.db.get(session.userId);
    if (!user) return null;

    // Get user's workspaces
    const memberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const workspaces = await Promise.all(
      memberships.map(async (m) => {
        const ws = await ctx.db.get(m.workspaceId);
        return ws ? { ...ws, role: m.role } : null;
      })
    );

    return {
      ...user,
      workspaces: workspaces.filter(Boolean),
    };
  },
});

// ===========================================
// MUTATIONS
// ===========================================

export const upsertFromGithub = mutation({
  args: {
    githubId: v.number(),
    githubUsername: v.string(),
    email: v.string(),
    name: v.string(),
    avatarUrl: v.optional(v.string()),
    githubAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if user exists
    const existing = await ctx.db
      .query("users")
      .withIndex("by_github_id", (q) => q.eq("githubId", args.githubId))
      .first();

    if (existing) {
      // Update existing user
      await ctx.db.patch(existing._id, {
        githubUsername: args.githubUsername,
        email: args.email,
        name: args.name,
        avatarUrl: args.avatarUrl,
        githubAccessToken: args.githubAccessToken,
        lastSeenAt: now,
        updatedAt: now,
      });
      return existing._id;
    }

    // Create new user
    return await ctx.db.insert("users", {
      githubId: args.githubId,
      githubUsername: args.githubUsername,
      email: args.email,
      name: args.name,
      avatarUrl: args.avatarUrl,
      githubAccessToken: args.githubAccessToken,
      preferences: {
        notifications: {
          slackDM: true,
          email: false,
        },
      },
      isActive: true,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const createSession = mutation({
  args: {
    userId: v.id("users"),
    token: v.string(),
    expiresInMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const expiresAt = now + (args.expiresInMs ?? 7 * 24 * 60 * 60 * 1000); // 7 days default

    // Delete existing sessions for this user (single session)
    const existingSessions = await ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    for (const session of existingSessions) {
      await ctx.db.delete(session._id);
    }

    // Create new session
    return await ctx.db.insert("sessions", {
      userId: args.userId,
      token: args.token,
      expiresAt,
      createdAt: now,
    });
  },
});

export const deleteSession = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (session) {
      await ctx.db.delete(session._id);
    }
  },
});

export const linkSlack = mutation({
  args: {
    userId: v.id("users"),
    slackUserId: v.string(),
    slackUsername: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      slackUserId: args.slackUserId,
      slackUsername: args.slackUsername,
      updatedAt: Date.now(),
    });
  },
});

export const updatePreferences = mutation({
  args: {
    userId: v.id("users"),
    preferences: v.object({
      defaultWorkspaceId: v.optional(v.id("workspaces")),
      notifications: v.object({
        slackDM: v.boolean(),
        email: v.boolean(),
      }),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      preferences: args.preferences,
      updatedAt: Date.now(),
    });
  },
});
