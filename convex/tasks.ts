import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ===========================================
// QUERIES
// ===========================================

export const list = query({
  args: {
    workspaceId: v.id("workspaces"),
    status: v.optional(v.string()),
    repositoryId: v.optional(v.id("repositories")),
  },
  handler: async (ctx, args) => {
    let q = ctx.db
      .query("tasks")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId));

    const tasks = await q.collect();

    // Filter by status and repo if provided
    let filtered = tasks;
    if (args.status) {
      filtered = filtered.filter((t) => t.status === args.status);
    }
    if (args.repositoryId) {
      filtered = filtered.filter((t) => t.repositoryId === args.repositoryId);
    }

    return filtered;
  },
});

export const getById = query({
  args: { id: v.id("tasks") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getByDisplayId = query({
  args: { displayId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tasks")
      .withIndex("by_display_id", (q) => q.eq("displayId", args.displayId))
      .first();
  },
});

export const getKanban = query({
  args: {
    workspaceId: v.id("workspaces"),
    repositoryId: v.optional(v.id("repositories")),
  },
  handler: async (ctx, args) => {
    let tasks;

    if (args.repositoryId) {
      tasks = await ctx.db
        .query("tasks")
        .withIndex("by_repository", (q) =>
          q.eq("repositoryId", args.repositoryId)
        )
        .filter((q) => q.neq(q.field("status"), "cancelled"))
        .collect();
    } else {
      tasks = await ctx.db
        .query("tasks")
        .withIndex("by_workspace", (q) =>
          q.eq("workspaceId", args.workspaceId)
        )
        .filter((q) => q.neq(q.field("status"), "cancelled"))
        .collect();
    }

    // Group by status
    const columns = {
      backlog: tasks.filter((t) => t.status === "backlog"),
      todo: tasks.filter((t) => t.status === "todo"),
      in_progress: tasks.filter((t) => t.status === "in_progress"),
      in_review: tasks.filter((t) => t.status === "in_review"),
      done: tasks.filter((t) => t.status === "done"),
    };

    return {
      columns,
      stats: {
        total: tasks.length,
        byPriority: {
          critical: tasks.filter((t) => t.priority === "critical").length,
          high: tasks.filter((t) => t.priority === "high").length,
          medium: tasks.filter((t) => t.priority === "medium").length,
          low: tasks.filter((t) => t.priority === "low").length,
        },
      },
    };
  },
});

// For Claude Code integration
export const getForClaudeCode = query({
  args: {
    repositoryId: v.id("repositories"),
  },
  handler: async (ctx, args) => {
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_repository", (q) => q.eq("repositoryId", args.repositoryId))
      .filter((q) =>
        q.and(
          q.or(
            q.eq(q.field("status"), "todo"),
            q.eq(q.field("status"), "in_progress")
          ),
          q.neq(q.field("codeContext"), undefined)
        )
      )
      .take(10);

    // Filter out already processed tasks
    return tasks.filter(
      (t) =>
        !t.claudeCodeExecution ||
        t.claudeCodeExecution.status === "pending"
    );
  },
});

// ===========================================
// MUTATIONS
// ===========================================

export const create = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    repositoryId: v.optional(v.id("repositories")),
    title: v.string(),
    description: v.optional(v.string()),
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
    source: v.object({
      type: v.union(
        v.literal("slack"),
        v.literal("manual"),
        v.literal("github"),
        v.literal("api")
      ),
      slackChannelId: v.optional(v.string()),
      slackChannelName: v.optional(v.string()),
      slackMessageTs: v.optional(v.string()),
      slackThreadTs: v.optional(v.string()),
      slackPermalink: v.optional(v.string()),
      githubIssueNumber: v.optional(v.number()),
      githubIssueUrl: v.optional(v.string()),
    }),
    codeContext: v.optional(
      v.object({
        filePaths: v.optional(v.array(v.string())),
        errorMessage: v.optional(v.string()),
        stackTrace: v.optional(v.string()),
        codeSnippet: v.optional(v.string()),
        suggestedFix: v.optional(v.string()),
        branch: v.optional(v.string()),
        commitSha: v.optional(v.string()),
      })
    ),
    aiExtraction: v.optional(
      v.object({
        extractedAt: v.number(),
        model: v.string(),
        confidence: v.number(),
        originalText: v.string(),
      })
    ),
    labels: v.optional(v.array(v.string())),
    assigneeId: v.optional(v.id("users")),
    createdById: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Get or create counter for task numbering
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

    // Get workspace for prefix
    const workspace = await ctx.db.get(args.workspaceId);
    const prefix = workspace?.slug.toUpperCase().slice(0, 3) || "TSK";
    const displayId = `${prefix}-${taskNumber}`;

    const taskId = await ctx.db.insert("tasks", {
      workspaceId: args.workspaceId,
      repositoryId: args.repositoryId,
      taskNumber,
      displayId,
      title: args.title,
      description: args.description,
      status: "backlog",
      priority: args.priority,
      taskType: args.taskType,
      source: args.source,
      codeContext: args.codeContext,
      aiExtraction: args.aiExtraction,
      labels: args.labels ?? [],
      assigneeId: args.assigneeId,
      createdById: args.createdById,
      createdAt: now,
      updatedAt: now,
    });

    // Log activity
    await ctx.db.insert("taskActivity", {
      taskId,
      userId: args.createdById,
      activityType: "created",
      createdAt: now,
    });

    return { taskId, displayId };
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("tasks"),
    status: v.union(
      v.literal("backlog"),
      v.literal("todo"),
      v.literal("in_progress"),
      v.literal("in_review"),
      v.literal("done"),
      v.literal("cancelled")
    ),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task) throw new Error("Task not found");

    const now = Date.now();
    const oldStatus = task.status;

    await ctx.db.patch(args.id, {
      status: args.status,
      updatedAt: now,
      ...(args.status === "done" ? { completedAt: now } : {}),
    });

    await ctx.db.insert("taskActivity", {
      taskId: args.id,
      userId: args.userId,
      activityType: "status_changed",
      changes: {
        field: "status",
        oldValue: oldStatus,
        newValue: args.status,
      },
      createdAt: now,
    });
  },
});

export const updateClaudeCodeExecution = mutation({
  args: {
    taskId: v.id("tasks"),
    execution: v.object({
      status: v.union(
        v.literal("pending"),
        v.literal("running"),
        v.literal("completed"),
        v.literal("failed")
      ),
      pullRequestUrl: v.optional(v.string()),
      branchName: v.optional(v.string()),
      commitSha: v.optional(v.string()),
      errorMessage: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");

    const now = Date.now();

    await ctx.db.patch(args.taskId, {
      claudeCodeExecution: {
        ...task.claudeCodeExecution,
        ...args.execution,
        ...(args.execution.status === "running" ? { startedAt: now } : {}),
        ...(args.execution.status === "completed" ||
        args.execution.status === "failed"
          ? { completedAt: now }
          : {}),
      },
      ...(args.execution.pullRequestUrl ? { status: "in_review" as const } : {}),
      updatedAt: now,
    });

    await ctx.db.insert("taskActivity", {
      taskId: args.taskId,
      activityType:
        args.execution.status === "completed"
          ? "claude_code_completed"
          : "claude_code_started",
      metadata: args.execution,
      createdAt: now,
    });
  },
});

export const assign = mutation({
  args: {
    taskId: v.id("tasks"),
    assigneeId: v.optional(v.id("users")),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");

    const now = Date.now();
    const oldAssignee = task.assigneeId;

    await ctx.db.patch(args.taskId, {
      assigneeId: args.assigneeId,
      updatedAt: now,
    });

    await ctx.db.insert("taskActivity", {
      taskId: args.taskId,
      userId: args.userId,
      activityType: args.assigneeId ? "assigned" : "unassigned",
      changes: {
        field: "assigneeId",
        oldValue: oldAssignee?.toString(),
        newValue: args.assigneeId?.toString(),
      },
      createdAt: now,
    });
  },
});
