import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ===========================================
// QUERIES
// ===========================================

export const list = query({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("repositories")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
  },
});

export const getById = query({
  args: { id: v.id("repositories") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getByGithubId = query({
  args: { githubId: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("repositories")
      .withIndex("by_github_id", (q) => q.eq("githubId", args.githubId))
      .first();
  },
});

// ===========================================
// MUTATIONS
// ===========================================

export const create = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.string(),
    fullName: v.string(),
    cloneUrl: v.string(),
    defaultBranch: v.string(),
    githubId: v.number(),
    githubNodeId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if already exists
    const existing = await ctx.db
      .query("repositories")
      .withIndex("by_github_id", (q) => q.eq("githubId", args.githubId))
      .first();

    if (existing) {
      throw new Error("Repository already linked");
    }

    return await ctx.db.insert("repositories", {
      workspaceId: args.workspaceId,
      name: args.name,
      fullName: args.fullName,
      cloneUrl: args.cloneUrl,
      defaultBranch: args.defaultBranch,
      githubId: args.githubId,
      githubNodeId: args.githubNodeId,
      settings: {
        claudeCodeEnabled: true,
        autoCreateBranches: true,
      },
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("repositories"),
    settings: v.optional(
      v.object({
        claudeCodeEnabled: v.boolean(),
        branchPrefix: v.optional(v.string()),
        autoCreateBranches: v.boolean(),
      })
    ),
    defaultBranch: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const repo = await ctx.db.get(args.id);
    if (!repo) throw new Error("Repository not found");

    await ctx.db.patch(args.id, {
      ...(args.settings ? { settings: args.settings } : {}),
      ...(args.defaultBranch ? { defaultBranch: args.defaultBranch } : {}),
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("repositories") },
  handler: async (ctx, args) => {
    const repo = await ctx.db.get(args.id);
    if (!repo) throw new Error("Repository not found");

    // Soft delete
    await ctx.db.patch(args.id, {
      isActive: false,
      updatedAt: Date.now(),
    });
  },
});

export const sync = mutation({
  args: {
    id: v.id("repositories"),
    defaultBranch: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const repo = await ctx.db.get(args.id);
    if (!repo) throw new Error("Repository not found");

    await ctx.db.patch(args.id, {
      ...(args.defaultBranch ? { defaultBranch: args.defaultBranch } : {}),
      lastSyncedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});
