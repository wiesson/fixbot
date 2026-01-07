import { v } from "convex/values";
import { internalQuery, internalMutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";

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
    projectId: v.optional(v.id("projects")), // Optional project for TM-123 style IDs
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

    // Determine display ID prefix and counter
    let displayId: string;
    let taskNumber: number;

    if (args.projectId) {
      // Project-specific counter (TM-1, TM-2, etc.)
      const project = await ctx.db.get(args.projectId);
      if (!project) {
        return { success: false, error: "Project not found" };
      }

      const counter = await ctx.db
        .query("projectCounters")
        .withIndex("by_project_and_type", (q) =>
          q.eq("projectId", args.projectId!).eq("counterType", "task_number")
        )
        .first();

      if (counter) {
        taskNumber = counter.currentValue + 1;
        await ctx.db.patch(counter._id, { currentValue: taskNumber });
      } else {
        taskNumber = 1;
        await ctx.db.insert("projectCounters", {
          projectId: args.projectId,
          counterType: "task_number",
          currentValue: 1,
        });
      }

      displayId = `${project.shortCode}-${taskNumber}`;
    } else {
      // Workspace-level counter (FIX-1, FIX-2, etc.)
      const counter = await ctx.db
        .query("workspaceCounters")
        .withIndex("by_workspace_and_type", (q) =>
          q.eq("workspaceId", args.workspaceId).eq("counterType", "task_number")
        )
        .first();

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

      displayId = `FIX-${taskNumber}`;
    }

    // Get user if exists
    const user = await ctx.db
      .query("users")
      .withIndex("by_slack_user_id", (q) => q.eq("slackUserId", args.slackUserId))
      .first();

    const taskId = await ctx.db.insert("tasks", {
      workspaceId: args.workspaceId,
      repositoryId: channelMapping?.repositoryId,
      projectId: args.projectId,
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

// ===========================================
// PROJECT MANAGEMENT
// ===========================================

export const createProject = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    shortCode: v.string(),
    name: v.string(),
    domain: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Normalize shortCode to uppercase
    const shortCode = args.shortCode.toUpperCase();

    // Check if shortCode already exists in this workspace
    const existing = await ctx.db
      .query("projects")
      .withIndex("by_workspace_and_code", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("shortCode", shortCode)
      )
      .first();

    if (existing) {
      return {
        success: false,
        error: `Project with code ${shortCode} already exists`,
      };
    }

    const now = Date.now();
    const projectId = await ctx.db.insert("projects", {
      workspaceId: args.workspaceId,
      shortCode,
      name: args.name,
      domain: args.domain,
      description: args.description,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    return {
      success: true,
      projectId,
      shortCode,
      name: args.name,
      domain: args.domain,
    };
  },
});

export const listProjects = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    return projects.map((p) => ({
      id: p._id,
      shortCode: p.shortCode,
      name: p.name,
      domain: p.domain,
      description: p.description,
    }));
  },
});

export const findProjectByMatch = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    searchText: v.string(),
  },
  handler: async (ctx, args) => {
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    const searchLower = args.searchText.toLowerCase();

    // Try to match by:
    // 1. [CODE] or CODE: prefix
    const codeMatch = args.searchText.match(/^\[([A-Z0-9]+)\]|^([A-Z0-9]+):/i);
    if (codeMatch) {
      const code = (codeMatch[1] || codeMatch[2]).toUpperCase();
      const project = projects.find((p) => p.shortCode === code);
      if (project) {
        return { project: { id: project._id, shortCode: project.shortCode, name: project.name }, matchType: "shortCode" };
      }
    }

    // 2. Domain match
    for (const project of projects) {
      if (project.domain && searchLower.includes(project.domain.toLowerCase())) {
        return { project: { id: project._id, shortCode: project.shortCode, name: project.name }, matchType: "domain" };
      }
    }

    // 3. Name match (case-insensitive)
    for (const project of projects) {
      if (searchLower.includes(project.name.toLowerCase())) {
        return { project: { id: project._id, shortCode: project.shortCode, name: project.name }, matchType: "name" };
      }
    }

    // No match found
    return { project: null, availableProjects: projects.map((p) => ({ shortCode: p.shortCode, name: p.name })) };
  },
});
