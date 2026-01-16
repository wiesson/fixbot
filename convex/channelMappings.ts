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
    const mappings = await ctx.db
      .query("channelMappings")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    // Enrich with project and repository info
    const enriched = await Promise.all(
      mappings.map(async (mapping) => {
        const project = mapping.projectId ? await ctx.db.get(mapping.projectId) : null;
        const repo = mapping.repositoryId ? await ctx.db.get(mapping.repositoryId) : null;
        return {
          ...mapping,
          project: project ? { id: project._id, name: project.name, shortCode: project.shortCode } : null,
          repository: repo ? { name: repo.name, fullName: repo.fullName } : null,
        };
      })
    );

    return enriched;
  },
});

export const getByChannel = query({
  args: { slackChannelId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("channelMappings")
      .withIndex("by_slack_channel", (q) => q.eq("slackChannelId", args.slackChannelId))
      .first();
  },
});

// ===========================================
// MUTATIONS
// ===========================================

export const create = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    slackChannelId: v.string(),
    slackChannelName: v.string(),
    projectId: v.optional(v.id("projects")),
    repositoryId: v.optional(v.id("repositories")),
    settings: v.optional(
      v.object({
        autoExtractTasks: v.boolean(),
        mentionRequired: v.boolean(),
        defaultPriority: v.optional(v.string()),
        strictProjectMode: v.optional(v.boolean()),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Check if mapping already exists
    const existing = await ctx.db
      .query("channelMappings")
      .withIndex("by_slack_channel", (q) => q.eq("slackChannelId", args.slackChannelId))
      .first();

    if (existing) {
      throw new Error("Channel mapping already exists");
    }

    const now = Date.now();

    return await ctx.db.insert("channelMappings", {
      workspaceId: args.workspaceId,
      slackChannelId: args.slackChannelId,
      slackChannelName: args.slackChannelName,
      projectId: args.projectId,
      repositoryId: args.repositoryId,
      settings: args.settings ?? {
        autoExtractTasks: true,
        mentionRequired: true,
        strictProjectMode: false,
      },
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("channelMappings"),
    projectId: v.optional(v.id("projects")),
    repositoryId: v.optional(v.id("repositories")),
    settings: v.optional(
      v.object({
        autoExtractTasks: v.boolean(),
        mentionRequired: v.boolean(),
        defaultPriority: v.optional(v.string()),
        strictProjectMode: v.optional(v.boolean()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const mapping = await ctx.db.get(args.id);
    if (!mapping) throw new Error("Channel mapping not found");

    await ctx.db.patch(args.id, {
      ...(args.projectId !== undefined ? { projectId: args.projectId } : {}),
      ...(args.repositoryId !== undefined ? { repositoryId: args.repositoryId } : {}),
      ...(args.settings ? { settings: args.settings } : {}),
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("channelMappings") },
  handler: async (ctx, args) => {
    const mapping = await ctx.db.get(args.id);
    if (!mapping) throw new Error("Channel mapping not found");

    // Soft delete
    await ctx.db.patch(args.id, {
      isActive: false,
      updatedAt: Date.now(),
    });
  },
});

// Bulk update channels from Slack
export const syncChannels = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    channels: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    for (const channel of args.channels) {
      const existing = await ctx.db
        .query("channelMappings")
        .withIndex("by_slack_channel", (q) => q.eq("slackChannelId", channel.id))
        .first();

      if (existing) {
        // Update channel name if changed
        if (existing.slackChannelName !== channel.name) {
          await ctx.db.patch(existing._id, {
            slackChannelName: channel.name,
            updatedAt: now,
          });
        }
      }
      // Don't auto-create mappings - let users explicitly configure them
    }
  },
});
