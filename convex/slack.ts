import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { fixbotAgent } from "./agents/taskExtractor";

// ===========================================
// EVENT DEDUPLICATION
// ===========================================

export const isEventProcessed = internalQuery({
  args: { eventTs: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("processedSlackEvents")
      .withIndex("by_event_ts", (q) => q.eq("eventTs", args.eventTs))
      .first();
    return !!existing;
  },
});

export const markEventProcessed = internalMutation({
  args: { eventTs: v.string(), eventType: v.string() },
  handler: async (ctx, args) => {
    // Double-check to prevent race conditions
    const existing = await ctx.db
      .query("processedSlackEvents")
      .withIndex("by_event_ts", (q) => q.eq("eventTs", args.eventTs))
      .first();
    if (existing) return false;

    await ctx.db.insert("processedSlackEvents", {
      eventTs: args.eventTs,
      eventType: args.eventType,
      processedAt: Date.now(),
    });
    return true;
  },
});

// ===========================================
// INTERNAL QUERIES
// ===========================================

export const getWorkspaceBySlackTeam = internalQuery({
  args: { slackTeamId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("workspaces")
      .withIndex("by_slack_team_id", (q) =>
        q.eq("slackTeamId", args.slackTeamId)
      )
      .first();
  },
});

export const getChannelMapping = internalQuery({
  args: { slackChannelId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("channelMappings")
      .withIndex("by_slack_channel", (q) =>
        q.eq("slackChannelId", args.slackChannelId)
      )
      .first();
  },
});

export const getTaskBySlackThread = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    slackChannelId: v.string(),
    slackThreadTs: v.string(),
  },
  handler: async (ctx, args) => {
    // Find task by source slack thread
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .filter((q) =>
        q.and(
          q.eq(q.field("source.slackChannelId"), args.slackChannelId),
          q.eq(q.field("source.slackThreadTs"), args.slackThreadTs)
        )
      )
      .first();
    return tasks;
  },
});

export const getUserBySlackId = internalQuery({
  args: { slackUserId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_slack_user_id", (q) => q.eq("slackUserId", args.slackUserId))
      .first();
  },
});

// ===========================================
// INTERNAL MUTATIONS
// ===========================================

export const createOrUpdateWorkspace = internalMutation({
  args: {
    slackTeamId: v.string(),
    slackTeamName: v.string(),
    slackBotToken: v.string(),
    slackBotUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("workspaces")
      .withIndex("by_slack_team_id", (q) =>
        q.eq("slackTeamId", args.slackTeamId)
      )
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        slackTeamName: args.slackTeamName,
        slackBotUserId: args.slackBotUserId,
        updatedAt: now,
      });
      return existing._id;
    }

    // Create new workspace
    const slug = args.slackTeamName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    return await ctx.db.insert("workspaces", {
      name: args.slackTeamName,
      slug: `${slug}-${args.slackTeamId.slice(-4)}`,
      slackTeamId: args.slackTeamId,
      slackTeamName: args.slackTeamName,
      slackBotUserId: args.slackBotUserId,
      settings: {
        aiExtractionEnabled: true,
      },
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const createTaskFromSlack = internalMutation({
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
    slackChannelId: v.string(),
    slackChannelName: v.optional(v.string()),
    slackMessageTs: v.string(),
    slackThreadTs: v.string(),
    slackUserId: v.string(),
    aiExtraction: v.optional(
      v.object({
        extractedAt: v.number(),
        model: v.string(),
        confidence: v.number(),
        originalText: v.string(),
      })
    ),
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
  },
  handler: async (ctx, args) => {
    const now = Date.now();

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

    // Get workspace for prefix
    const workspace = await ctx.db.get(args.workspaceId);
    const prefix = workspace?.slug.toUpperCase().slice(0, 3) || "TSK";
    const displayId = `${prefix}-${taskNumber}`;

    // Find user by Slack ID
    const user = await ctx.db
      .query("users")
      .withIndex("by_slack_user_id", (q) => q.eq("slackUserId", args.slackUserId))
      .first();

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
      source: {
        type: "slack",
        slackChannelId: args.slackChannelId,
        slackChannelName: args.slackChannelName,
        slackMessageTs: args.slackMessageTs,
        slackThreadTs: args.slackThreadTs,
      },
      codeContext: args.codeContext,
      aiExtraction: args.aiExtraction,
      labels: [],
      createdById: user?._id,
      createdAt: now,
      updatedAt: now,
    });

    // Log activity
    await ctx.db.insert("taskActivity", {
      taskId,
      userId: user?._id,
      activityType: "created",
      metadata: { source: "slack" },
      createdAt: now,
    });

    return { taskId, displayId };
  },
});

export const addMessageToTask = internalMutation({
  args: {
    taskId: v.id("tasks"),
    content: v.string(),
    slackUserId: v.string(),
    slackMessageTs: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_slack_user_id", (q) => q.eq("slackUserId", args.slackUserId))
      .first();

    await ctx.db.insert("messages", {
      taskId: args.taskId,
      authorId: user?._id,
      content: args.content,
      contentType: "text",
      slackMessageTs: args.slackMessageTs,
      isEdited: false,
      createdAt: Date.now(),
    });
  },
});

export const updateTaskStatus = internalMutation({
  args: {
    taskId: v.string(),
    status: v.string(),
    slackUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db
      .query("tasks")
      .filter((q) => q.eq(q.field("displayId"), args.taskId))
      .first();

    if (!task) return;

    const user = await ctx.db
      .query("users")
      .withIndex("by_slack_user_id", (q) => q.eq("slackUserId", args.slackUserId))
      .first();

    const now = Date.now();
    const oldStatus = task.status;

    await ctx.db.patch(task._id, {
      status: args.status as typeof task.status,
      updatedAt: now,
      ...(args.status === "done" ? { completedAt: now } : {}),
    });

    await ctx.db.insert("taskActivity", {
      taskId: task._id,
      userId: user?._id,
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

// ===========================================
// INTERNAL ACTIONS (with external API calls)
// ===========================================

export const handleAppMention = internalAction({
  args: {
    teamId: v.string(),
    channelId: v.string(),
    userId: v.string(),
    text: v.string(),
    ts: v.string(),
    threadTs: v.string(),
  },
  handler: async (ctx, args) => {
    // Deduplication: Check if we already processed this event
    const alreadyProcessed = await ctx.runQuery(
      internal.slack.isEventProcessed,
      { eventTs: args.ts }
    );
    if (alreadyProcessed) {
      console.log("Event already processed, skipping:", args.ts);
      return;
    }

    // Mark as processed immediately to prevent race conditions
    const marked = await ctx.runMutation(internal.slack.markEventProcessed, {
      eventTs: args.ts,
      eventType: "app_mention",
    });
    if (!marked) {
      console.log("Event being processed by another instance, skipping:", args.ts);
      return;
    }

    // Get workspace
    const workspace = await ctx.runQuery(
      internal.slack.getWorkspaceBySlackTeam,
      {
        slackTeamId: args.teamId,
      }
    );

    if (!workspace) {
      console.error("No workspace found for Slack team:", args.teamId);
      return;
    }

    // Get channel mapping for repository context
    const channelMapping = await ctx.runQuery(
      internal.slack.getChannelMapping,
      {
        slackChannelId: args.channelId,
      }
    );

    // Clean message text (remove bot mention but keep user mentions for assignment)
    const cleanText = args.text
      .replace(new RegExp(`<@${workspace.slackBotUserId}>`, "gi"), "")
      .trim();

    if (!cleanText) {
      await sendSlackMessage({
        channelId: args.channelId,
        threadTs: args.threadTs,
        text: "How can I help? Try:\n• `@fixbot summarize` - See task summary\n• `@fixbot mark FIX-123 as done` - Update status\n• `@fixbot assign FIX-123 to @user` - Assign task\n• Or describe a bug/task to create one",
      });
      return;
    }

    // Use the fixbot agent to handle everything
    try {
      const { threadId } = await fixbotAgent.createThread(ctx, {});

      // Build context for the agent with all required parameters for tools
      const contextInfo = `Context (use these values when calling tools):
- workspaceId: ${workspace._id}
- slackChannelId: ${args.channelId}
- slackUserId: ${args.userId}
- slackMessageTs: ${args.ts}
- slackThreadTs: ${args.threadTs}
- channelName: ${channelMapping?.slackChannelName || "unknown"}

User message: ${cleanText}

Original text for task creation: ${cleanText}`;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await fixbotAgent.generateText(ctx, { threadId }, {
        messages: [{ role: "user" as const, content: contextInfo }],
        maxSteps: 5,
      } as any);

      // Send the agent's response directly
      // The agent handles everything: greetings, summaries, status updates, assignments, task creation
      const responseText =
        result.text ||
        "I didn't quite understand that. Could you provide more details?\n• What were you trying to do?\n• What happened instead?\n• Any error messages?";

      await sendSlackMessage({
        channelId: args.channelId,
        threadTs: args.threadTs,
        text: responseText,
      });
    } catch (error) {
      console.error("Agent error:", error);
      await sendSlackMessage({
        channelId: args.channelId,
        threadTs: args.threadTs,
        text: "Sorry, I encountered an error processing your request. Please try again.",
      });
    }
  },
});

// Note: Task creation is now handled by the agent's createTask tool

export const handleThreadReply = internalAction({
  args: {
    teamId: v.string(),
    channelId: v.string(),
    userId: v.string(),
    text: v.string(),
    ts: v.string(),
    threadTs: v.string(),
  },
  handler: async (ctx, args) => {
    // Get workspace
    const workspace = await ctx.runQuery(internal.slack.getWorkspaceBySlackTeam, {
      slackTeamId: args.teamId,
    });

    if (!workspace) return;

    // Find task by thread
    const task = await ctx.runQuery(internal.slack.getTaskBySlackThread, {
      workspaceId: workspace._id,
      slackChannelId: args.channelId,
      slackThreadTs: args.threadTs,
    });

    if (!task) return;

    // Add message to task
    await ctx.runMutation(internal.slack.addMessageToTask, {
      taskId: task._id,
      content: args.text,
      slackUserId: args.userId,
      slackMessageTs: args.ts,
    });
  },
});

// ===========================================
// SLACK API HELPER
// ===========================================

/**
 * Convert Markdown formatting to Slack's mrkdwn format
 * - **bold** → *bold*
 * - *italic* or _italic_ stays the same (Slack uses _italic_)
 * - Markdown bullets (* or -) → •
 */
function markdownToSlackMrkdwn(text: string): string {
  return text
    // Convert **bold** to *bold* (must be done before handling single *)
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    // Convert markdown bullets at start of line to Slack bullets
    .replace(/^\*\s+/gm, "• ")
    .replace(/^-\s+/gm, "• ");
}

async function sendSlackMessage(params: {
  channelId: string;
  threadTs?: string;
  text: string;
  blocks?: unknown[];
}) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    console.error("SLACK_BOT_TOKEN not configured");
    return;
  }

  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      channel: params.channelId,
      thread_ts: params.threadTs,
      text: markdownToSlackMrkdwn(params.text),
      blocks: params.blocks,
    }),
  });

  const data = await response.json();
  if (!data.ok) {
    console.error("Slack API error:", data.error);
  }
  return data;
}
