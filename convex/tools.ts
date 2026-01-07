import { v } from "convex/values";
import { internalQuery, internalMutation } from "./_generated/server";

// ===========================================
// INTERNAL QUERIES FOR AI TOOLS
// ===========================================

export const getTasksForSummary = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    repositoryId: v.optional(v.id("repositories")),
  },
  handler: async (ctx, args) => {
    let tasks;

    if (args.repositoryId) {
      tasks = await ctx.db
        .query("tasks")
        .withIndex("by_repository", (q) => q.eq("repositoryId", args.repositoryId))
        .filter((q) => q.neq(q.field("status"), "cancelled"))
        .collect();
    } else {
      tasks = await ctx.db
        .query("tasks")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .filter((q) => q.neq(q.field("status"), "cancelled"))
        .collect();
    }

    // Group by status
    const byStatus = {
      backlog: tasks.filter((t) => t.status === "backlog"),
      todo: tasks.filter((t) => t.status === "todo"),
      in_progress: tasks.filter((t) => t.status === "in_progress"),
      in_review: tasks.filter((t) => t.status === "in_review"),
      done: tasks.filter((t) => t.status === "done"),
    };

    // Count by priority
    const byPriority = {
      critical: tasks.filter((t) => t.priority === "critical").length,
      high: tasks.filter((t) => t.priority === "high").length,
      medium: tasks.filter((t) => t.priority === "medium").length,
      low: tasks.filter((t) => t.priority === "low").length,
    };

    // Get active (non-done) tasks
    const activeTasks = tasks.filter((t) => t.status !== "done");

    return {
      total: tasks.length,
      activeCount: activeTasks.length,
      byStatus: {
        backlog: {
          count: byStatus.backlog.length,
          tasks: byStatus.backlog.slice(0, 5).map((t) => ({
            displayId: t.displayId,
            title: t.title,
            priority: t.priority,
          })),
        },
        todo: {
          count: byStatus.todo.length,
          tasks: byStatus.todo.slice(0, 5).map((t) => ({
            displayId: t.displayId,
            title: t.title,
            priority: t.priority,
          })),
        },
        in_progress: {
          count: byStatus.in_progress.length,
          tasks: byStatus.in_progress.slice(0, 5).map((t) => ({
            displayId: t.displayId,
            title: t.title,
            priority: t.priority,
          })),
        },
        in_review: {
          count: byStatus.in_review.length,
          tasks: byStatus.in_review.slice(0, 5).map((t) => ({
            displayId: t.displayId,
            title: t.title,
            priority: t.priority,
          })),
        },
        done: {
          count: byStatus.done.length,
          tasks: byStatus.done.slice(0, 3).map((t) => ({
            displayId: t.displayId,
            title: t.title,
            priority: t.priority,
          })),
        },
      },
      byPriority,
    };
  },
});

export const getChannelMappingById = internalQuery({
  args: {
    slackChannelId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("channelMappings")
      .withIndex("by_slack_channel", (q) =>
        q.eq("slackChannelId", args.slackChannelId)
      )
      .first();
  },
});

// ===========================================
// INTERNAL MUTATIONS FOR AI TOOLS
// ===========================================

export const updateTaskStatusByDisplayId = internalMutation({
  args: {
    displayId: v.string(),
    newStatus: v.union(
      v.literal("backlog"),
      v.literal("todo"),
      v.literal("in_progress"),
      v.literal("in_review"),
      v.literal("done"),
      v.literal("cancelled")
    ),
    slackUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db
      .query("tasks")
      .withIndex("by_display_id", (q) => q.eq("displayId", args.displayId))
      .first();

    if (!task) {
      return { success: false, error: `Task ${args.displayId} not found` };
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_slack_user_id", (q) => q.eq("slackUserId", args.slackUserId))
      .first();

    const now = Date.now();
    const oldStatus = task.status;

    await ctx.db.patch(task._id, {
      status: args.newStatus,
      updatedAt: now,
      ...(args.newStatus === "done" ? { completedAt: now } : {}),
    });

    await ctx.db.insert("taskActivity", {
      taskId: task._id,
      userId: user?._id,
      activityType: "status_changed",
      changes: {
        field: "status",
        oldValue: oldStatus,
        newValue: args.newStatus,
      },
      createdAt: now,
    });

    return {
      success: true,
      task: {
        displayId: task.displayId,
        title: task.title,
        oldStatus,
        newStatus: args.newStatus,
      },
    };
  },
});

export const assignTaskByDisplayId = internalMutation({
  args: {
    displayId: v.string(),
    assigneeSlackId: v.string(),
    actorSlackUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db
      .query("tasks")
      .withIndex("by_display_id", (q) => q.eq("displayId", args.displayId))
      .first();

    if (!task) {
      return { success: false, error: `Task ${args.displayId} not found` };
    }

    const assignee = await ctx.db
      .query("users")
      .withIndex("by_slack_user_id", (q) =>
        q.eq("slackUserId", args.assigneeSlackId)
      )
      .first();

    if (!assignee) {
      return {
        success: false,
        error: `User not found. They may need to link their Slack account first.`,
      };
    }

    const actor = await ctx.db
      .query("users")
      .withIndex("by_slack_user_id", (q) =>
        q.eq("slackUserId", args.actorSlackUserId)
      )
      .first();

    const now = Date.now();
    const oldAssigneeId = task.assigneeId;

    await ctx.db.patch(task._id, {
      assigneeId: assignee._id,
      updatedAt: now,
    });

    await ctx.db.insert("taskActivity", {
      taskId: task._id,
      userId: actor?._id,
      activityType: "assigned",
      changes: {
        field: "assigneeId",
        oldValue: oldAssigneeId?.toString(),
        newValue: assignee._id.toString(),
      },
      createdAt: now,
    });

    return {
      success: true,
      task: {
        displayId: task.displayId,
        title: task.title,
      },
      assignee: {
        name: assignee.name,
        slackUsername: assignee.slackUsername,
      },
    };
  },
});

// ===========================================
// CREATE TASK (for agent tool)
// ===========================================

export const createTask = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    title: v.string(),
    description: v.string(),
    priority: v.union(
      v.literal("critical"),
      v.literal("high"),
      v.literal("medium"),
      v.literal("low")
    ),
    taskType: v.union(
      v.literal("bug"),
      v.literal("feature"),
      v.literal("improvement"),
      v.literal("task"),
      v.literal("question")
    ),
    slackChannelId: v.string(),
    slackUserId: v.string(),
    slackMessageTs: v.string(),
    slackThreadTs: v.string(),
    originalText: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Get channel mapping for repository
    const channelMapping = await ctx.db
      .query("channelMappings")
      .withIndex("by_slack_channel", (q) =>
        q.eq("slackChannelId", args.slackChannelId)
      )
      .first();

    // Get or create task counter
    const counter = await ctx.db
      .query("workspaceCounters")
      .withIndex("by_workspace_and_type", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("counterType", "task_number")
      )
      .first();

    let taskNumber: number;
    if (counter) {
      taskNumber = counter.currentValue + 1;
      await ctx.db.patch(counter._id, { currentValue: taskNumber });
    } else {
      taskNumber = 1;
      await ctx.db.insert("workspaceCounters", {
        workspaceId: args.workspaceId,
        counterType: "task_number",
        currentValue: 1,
      });
    }

    const displayId = `FIX-${taskNumber}`;

    // Get user if exists
    const user = await ctx.db
      .query("users")
      .withIndex("by_slack_user_id", (q) => q.eq("slackUserId", args.slackUserId))
      .first();

    const taskId = await ctx.db.insert("tasks", {
      workspaceId: args.workspaceId,
      repositoryId: channelMapping?.repositoryId,
      taskNumber,
      displayId,
      title: args.title,
      description: args.description,
      status: "backlog",
      priority: args.priority,
      taskType: args.taskType,
      createdById: user?._id,
      source: {
        type: "slack",
        slackChannelId: args.slackChannelId,
        slackChannelName: channelMapping?.slackChannelName,
        slackMessageTs: args.slackMessageTs,
        slackThreadTs: args.slackThreadTs,
      },
      aiExtraction: {
        extractedAt: now,
        model: "gemini-3-pro-preview",
        confidence: 0.9,
        originalText: args.originalText,
      },
      labels: [],
      createdAt: now,
      updatedAt: now,
    });

    // Log activity
    await ctx.db.insert("taskActivity", {
      taskId,
      userId: user?._id,
      activityType: "created",
      createdAt: now,
    });

    return {
      success: true,
      displayId,
      title: args.title,
      priority: args.priority,
      taskType: args.taskType,
    };
  },
});
