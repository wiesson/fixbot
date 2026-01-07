import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";

// ===========================================
// RESULT TYPES
// ===========================================

interface TaskSummaryResult {
  total: number;
  activeCount: number;
  byStatus: Record<
    string,
    {
      count: number;
      tasks: { displayId: string; title: string; priority: string }[];
    }
  >;
  byPriority: Record<string, number>;
}

interface StatusUpdateResult {
  success: boolean;
  error?: string;
  task?: {
    displayId: string;
    title: string;
    oldStatus: string;
    newStatus: string;
  };
}

interface AssignmentResult {
  success: boolean;
  error?: string;
  task?: { displayId: string; title: string };
  assignee?: { name: string; slackUsername?: string };
}

interface CreateTaskResult {
  success: boolean;
  displayId: string;
  title: string;
  priority: string;
  taskType: string;
}

// ===========================================
// SUMMARIZE TASKS TOOL
// ===========================================

export const summarizeTasksTool = createTool({
  description:
    "Get a summary of active tasks for a Slack channel. Returns task counts grouped by status and priority. Use this when the user asks for a summary, status, or overview of tasks.",
  args: z.object({
    workspaceId: z.string().describe("The workspace ID"),
    slackChannelId: z
      .string()
      .describe("The Slack channel ID to get tasks for"),
  }),
  handler: async (ctx, args): Promise<TaskSummaryResult> => {
    // Get channel mapping to find repository
    const channelMapping = await ctx.runQuery(
      internal.tools.getChannelMappingById,
      { slackChannelId: args.slackChannelId }
    );

    // Query tasks for this workspace/repository
    const summary = await ctx.runQuery(internal.tools.getTasksForSummary, {
      workspaceId: args.workspaceId as Id<"workspaces">,
      repositoryId: channelMapping?.repositoryId,
    });

    return summary;
  },
});

// ===========================================
// UPDATE TASK STATUS TOOL
// ===========================================

export const updateTaskStatusTool = createTool({
  description:
    "Update the status of a task by its display ID (e.g., FIX-123). Use this when the user wants to mark a task as done, in progress, todo, etc. Valid statuses: backlog, todo, in_progress, in_review, done, cancelled.",
  args: z.object({
    displayId: z.string().describe("The task display ID (e.g., FIX-123, TSK-45)"),
    newStatus: z
      .enum([
        "backlog",
        "todo",
        "in_progress",
        "in_review",
        "done",
        "cancelled",
      ])
      .describe("The new status for the task"),
    slackUserId: z.string().describe("The Slack user ID making the change"),
  }),
  handler: async (ctx, args): Promise<StatusUpdateResult> => {
    const result = await ctx.runMutation(
      internal.tools.updateTaskStatusByDisplayId,
      {
        displayId: args.displayId.toUpperCase(),
        newStatus: args.newStatus,
        slackUserId: args.slackUserId,
      }
    );
    return result;
  },
});

// ===========================================
// ASSIGN TASK TOOL
// ===========================================

export const assignTaskTool = createTool({
  description:
    "Assign a task to a user. Extract the Slack user ID from mentions like <@U12345ABC>. Use this when the user wants to assign a task to someone.",
  args: z.object({
    displayId: z.string().describe("The task display ID (e.g., FIX-123, TSK-45)"),
    assigneeSlackId: z
      .string()
      .describe(
        "The Slack user ID to assign the task to (e.g., U12345ABC, without the <@ and >)"
      ),
    actorSlackUserId: z
      .string()
      .describe("The Slack user ID of the person making the assignment"),
  }),
  handler: async (ctx, args): Promise<AssignmentResult> => {
    const result = await ctx.runMutation(
      internal.tools.assignTaskByDisplayId,
      {
        displayId: args.displayId.toUpperCase(),
        assigneeSlackId: args.assigneeSlackId,
        actorSlackUserId: args.actorSlackUserId,
      }
    );
    return result;
  },
});

// ===========================================
// CREATE TASK TOOL
// ===========================================

export const createTaskTool = createTool({
  description:
    "Create a new task from a bug report or feature request. ONLY use this when the user describes actual work to be done - a bug, feature request, or task. Do NOT use for greetings, questions about capabilities, or general conversation.",
  args: z.object({
    title: z
      .string()
      .describe("A clear, actionable task title (start with a verb, max 80 chars)"),
    description: z
      .string()
      .describe("Fuller description of the task with context"),
    priority: z
      .enum(["critical", "high", "medium", "low"])
      .describe("Task priority: critical (production down), high (urgent), medium (normal), low (nice to have)"),
    taskType: z
      .enum(["bug", "feature", "improvement", "task", "question"])
      .describe("Type of task: bug, feature, improvement, task, or question"),
    workspaceId: z.string().describe("The workspace ID"),
    slackChannelId: z.string().describe("The Slack channel ID"),
    slackUserId: z.string().describe("The Slack user ID who reported this"),
    slackMessageTs: z.string().describe("The Slack message timestamp"),
    slackThreadTs: z.string().describe("The Slack thread timestamp"),
    originalText: z.string().describe("The original user message"),
  }),
  handler: async (ctx, args): Promise<CreateTaskResult> => {
    const result = await ctx.runMutation(internal.tools.createTask, {
      workspaceId: args.workspaceId as Id<"workspaces">,
      title: args.title,
      description: args.description,
      priority: args.priority,
      taskType: args.taskType,
      slackChannelId: args.slackChannelId,
      slackUserId: args.slackUserId,
      slackMessageTs: args.slackMessageTs,
      slackThreadTs: args.slackThreadTs,
      originalText: args.originalText,
    });
    return result;
  },
});
