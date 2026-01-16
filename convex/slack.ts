import { v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { norbotAgent } from "./agents/taskExtractor";

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
      .withIndex("by_slack_team_id", (q) => q.eq("slackTeamId", args.slackTeamId))
      .first();
  },
});

export const getChannelMapping = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    slackChannelId: v.string(),
  },
  handler: async (ctx, args) => {
    // Query by workspace first, then filter by channel for proper multi-tenant isolation
    return await ctx.db
      .query("channelMappings")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .filter((q) => q.eq(q.field("slackChannelId"), args.slackChannelId))
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
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("workspaces")
      .withIndex("by_slack_team_id", (q) => q.eq("slackTeamId", args.slackTeamId))
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        slackTeamName: args.slackTeamName,
        slackBotToken: args.slackBotToken,
        slackBotUserId: args.slackBotUserId,
        updatedAt: now,
      });

      // Add user as member if provided and not already a member
      if (args.userId) {
        const existingMembership = await ctx.db
          .query("workspaceMembers")
          .withIndex("by_workspace_and_user", (q) =>
            q.eq("workspaceId", existing._id).eq("userId", args.userId!)
          )
          .first();

        if (!existingMembership) {
          await ctx.db.insert("workspaceMembers", {
            workspaceId: existing._id,
            userId: args.userId,
            role: "admin",
            joinedAt: now,
          });
        }
      }

      return existing._id;
    }

    // Create new workspace
    const slug = args.slackTeamName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const workspaceId = await ctx.db.insert("workspaces", {
      name: args.slackTeamName,
      slug: `${slug}-${args.slackTeamId.slice(-4)}`,
      slackTeamId: args.slackTeamId,
      slackTeamName: args.slackTeamName,
      slackBotToken: args.slackBotToken,
      slackBotUserId: args.slackBotUserId,
      settings: {
        aiExtractionEnabled: true,
      },
      createdAt: now,
      updatedAt: now,
    });

    // Add user as admin member if provided
    if (args.userId) {
      await ctx.db.insert("workspaceMembers", {
        workspaceId,
        userId: args.userId,
        role: "admin",
        joinedAt: now,
      });
    }

    return workspaceId;
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
    files: v.optional(
      v.array(
        v.object({
          id: v.string(),
          name: v.string(),
          mimetype: v.string(),
          size: v.number(),
          url_private: v.string(),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    // Deduplication: Check if we already processed this event
    const alreadyProcessed = await ctx.runQuery(internal.slack.isEventProcessed, {
      eventTs: args.ts,
    });
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
    const workspace = await ctx.runQuery(internal.slack.getWorkspaceBySlackTeam, {
      slackTeamId: args.teamId,
    });

    if (!workspace) {
      console.error("No workspace found for Slack team:", args.teamId);
      return;
    }

    // Get channel mapping for repository/project context
    const channelMapping = await ctx.runQuery(internal.slack.getChannelMapping, {
      workspaceId: workspace._id,
      slackChannelId: args.channelId,
    });

    // Fetch repository details if channel has a linked repository
    let linkedRepository: { name: string; fullName: string } | null = null;
    if (channelMapping?.repositoryId) {
      const repo = await ctx.runQuery(internal.github.getRepository, {
        repositoryId: channelMapping.repositoryId,
      });
      if (repo) {
        linkedRepository = { name: repo.name, fullName: repo.fullName };
      }
    }

    // Get workspace projects for bot context
    const workspaceProjects = await ctx.runQuery(internal.projects.getWorkspaceContext, {
      workspaceId: workspace._id,
    });

    // Get channel's default project if set
    let channelDefaultProject: { name: string; shortCode: string } | null = null;
    if (channelMapping?.projectId) {
      const project = workspaceProjects.find(p => p.id === channelMapping.projectId);
      if (project) {
        channelDefaultProject = { name: project.name, shortCode: project.shortCode };
      }
    }

    // Clean message text (remove bot mention but keep user mentions for assignment)
    const cleanText = args.text
      .replace(new RegExp(`<@${workspace.slackBotUserId}>`, "gi"), "")
      .trim();

    if (!cleanText) {
      await sendSlackMessage({
        token: workspace.slackBotToken ?? "",
        channelId: args.channelId,
        threadTs: args.threadTs,
        text: "How can I help? Try:\n• `@norbot summarize` - See task summary\n• `@norbot mark FIX-123 as done` - Update status\n• `@norbot assign FIX-123 to @user` - Assign task\n• Or describe a bug/task to create one",
      });
      return;
    }

    // Download any attached files from Slack
    let attachments: Array<{
      storageId: string;
      filename: string;
      mimeType: string;
      size: number;
      slackFileId: string;
    }> = [];

    if (args.files && args.files.length > 0) {
      try {
        attachments = await ctx.runAction(internal.slack.downloadSlackFiles, {
          workspaceId: workspace._id,
          files: args.files,
        });
        console.log(`Downloaded ${attachments.length} files from Slack`);
      } catch (error) {
        console.error("Failed to download Slack files:", error);
      }
    }

    // Fetch thread context if we're replying in a thread
    let threadContext = "";
    if (args.threadTs !== args.ts) {
      // We're in a thread - fetch previous messages for context
      const threadMessages = await fetchThreadReplies(
        workspace.slackBotToken ?? "",
        args.channelId,
        args.threadTs
      );
      threadContext = formatThreadForContext(threadMessages, args.ts);
      if (threadContext) {
        console.log(
          `Fetched ${threadMessages.length} thread messages for context`
        );
      }
    }

    // Use the norbot agent to handle everything
    try {
      // Check AI usage limits
      const usageCheck = await ctx.runQuery(internal.ai.checkUsageInternal, {
        workspaceId: workspace._id,
      });

      if (!usageCheck.allowed) {
        await sendSlackMessage({
          token: workspace.slackBotToken ?? "",
          channelId: args.channelId,
          threadTs: args.threadTs,
          text: "Your workspace has reached its monthly AI usage limit. Please upgrade your plan or wait for the limit to reset.",
        });
        return;
      }

      const { threadId } = await norbotAgent.createThread(ctx, {});

      // Build attachments info for context
      const attachmentsInfo =
        attachments.length > 0
          ? `\n- attachments: ${JSON.stringify(attachments)}`
          : "";

      // Build repository context for the agent
      const repoInfo = linkedRepository
        ? `\n- linkedRepository: ${linkedRepository.fullName} (Tasks from this channel are associated with this GitHub repository)`
        : "";

      // Build project context for the agent
      const projectsInfo = workspaceProjects.length > 0
        ? `\n\nAvailable projects:\n${workspaceProjects.map(p =>
            `- ${p.name} (${p.shortCode}): keywords [${p.keywords.join(", ")}]${p.repos.length > 0 ? `, repos: ${p.repos.join(", ")}` : ""}`
          ).join("\n")}`
        : "\n\nNo projects configured yet. Tasks will use generic FIX-xxx IDs.";

      let channelProjectInfo = "";
      if (channelDefaultProject) {
        const isStrict = channelMapping?.settings?.strictProjectMode;
        const strictInstruction = isStrict
          ? " - STRICT MODE: You MUST use this project. Ignore any other project names mentioned in the text."
          : " - Use this project for tasks from this channel unless another is explicitly mentioned";
        
        channelProjectInfo = `\n- channelDefaultProject: ${channelDefaultProject.name} (${channelDefaultProject.shortCode})${strictInstruction}`;
      } else {
        channelProjectInfo = "\n- channelDefaultProject: none - Use keyword matching or ask which project";
      }

      // Build source context for the agent
      const sourceContext = {
        type: "slack",
        workspaceId: workspace._id,
        channelId: args.channelId,
        channelName: channelMapping?.slackChannelName,
        userId: args.userId,
        messageTs: args.ts,
        threadTs: args.threadTs,
      };

      // Build context for the agent with all required parameters for tools
      const contextInfo = `Context (use these values when calling tools):
- source: ${JSON.stringify(sourceContext)}
- channelName: ${channelMapping?.slackChannelName || "unknown"}${channelProjectInfo}${repoInfo}${attachmentsInfo}${projectsInfo}${threadContext}

User message: ${cleanText}

Original text for task creation: ${cleanText}`;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await norbotAgent.generateText(ctx, { threadId }, {
        messages: [{ role: "user" as const, content: contextInfo }],
        maxSteps: 5,
      } as any);

      // Increment AI usage after successful call
      await ctx.runMutation(internal.ai.incrementUsageInternal, {
        workspaceId: workspace._id,
      });

      // Send the agent's response directly
      // The agent handles everything: greetings, summaries, status updates, assignments, task creation
      const responseText =
        result.text ||
        "I didn't quite understand that. Could you provide more details?\n• What were you trying to do?\n• What happened instead?\n• Any error messages?";

      await sendSlackMessage({
        token: workspace.slackBotToken ?? "",
        channelId: args.channelId,
        threadTs: args.threadTs,
        text: responseText,
      });

      // Save conversation for thread continuity (so we can respond to follow-ups)
      await ctx.runMutation(internal.slack.upsertAgentConversation, {
        workspaceId: workspace._id,
        slackChannelId: args.channelId,
        slackThreadTs: args.threadTs,
        agentThreadId: threadId,
        status: "active",
      });
    } catch (error) {
      console.error("Agent error:", error);
      await sendSlackMessage({
        token: workspace.slackBotToken ?? "",
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

    // Check for active agent conversation first
    const conversation = await ctx.runQuery(internal.slack.getAgentConversation, {
      workspaceId: workspace._id,
      slackChannelId: args.channelId,
      slackThreadTs: args.threadTs,
    });

    if (conversation && conversation.status === "active") {
      // Continue the agent conversation
      try {
        // Check AI usage limits
        const usageCheck = await ctx.runQuery(internal.ai.checkUsageInternal, {
          workspaceId: workspace._id,
        });

        if (!usageCheck.allowed) {
          await sendSlackMessage({
            token: workspace.slackBotToken ?? "",
            channelId: args.channelId,
            threadTs: args.threadTs,
            text: "Your workspace has reached its monthly AI usage limit.",
          });
          return;
        }

        // Get channel mapping for context
        const channelMapping = await ctx.runQuery(
          internal.slack.getChannelMapping,
          { workspaceId: workspace._id, slackChannelId: args.channelId }
        );

        // Build source context for the agent
        const sourceContext = {
          type: "slack",
          workspaceId: workspace._id,
          channelId: args.channelId,
          channelName: channelMapping?.slackChannelName,
          userId: args.userId,
          messageTs: args.ts,
          threadTs: args.threadTs,
        };

        // Build context for follow-up
        const contextInfo = `Context (use these values when calling tools):
- source: ${JSON.stringify(sourceContext)}
- channelName: ${channelMapping?.slackChannelName || "unknown"}

User follow-up message: ${args.text}`;

        // Continue on the existing agent thread
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await norbotAgent.generateText(
          ctx,
          { threadId: conversation.agentThreadId },
          {
            messages: [{ role: "user" as const, content: contextInfo }],
            maxSteps: 5,
          } as any
        );

        // Increment AI usage
        await ctx.runMutation(internal.ai.incrementUsageInternal, {
          workspaceId: workspace._id,
        });

        const responseText =
          result.text || "I'm not sure how to help with that. Could you clarify?";

        await sendSlackMessage({
          token: workspace.slackBotToken ?? "",
          channelId: args.channelId,
          threadTs: args.threadTs,
          text: responseText,
        });

        // Update conversation timestamp
        await ctx.runMutation(internal.slack.upsertAgentConversation, {
          workspaceId: workspace._id,
          slackChannelId: args.channelId,
          slackThreadTs: args.threadTs,
          agentThreadId: conversation.agentThreadId,
          status: "active",
        });
      } catch (error) {
        console.error("Error continuing conversation:", error);
        await sendSlackMessage({
          token: workspace.slackBotToken ?? "",
          channelId: args.channelId,
          threadTs: args.threadTs,
          text: "Sorry, I encountered an error. Please try again or @mention me directly.",
        });
      }
      return;
    }

    // Fall back to existing behavior: add message to task if one exists
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
// GITHUB PR UPDATES (called by webhook)
// ===========================================

export const postPRUpdate = internalAction({
  args: {
    displayId: v.string(),
    prNumber: v.number(),
    prUrl: v.string(),
    prTitle: v.string(),
    action: v.union(v.literal("opened"), v.literal("merged")),
  },
  handler: async (ctx, args) => {
    // Find task by display ID to get its Slack thread
    const task = await ctx.runQuery(internal.github.getTaskByDisplayId, {
      displayId: args.displayId,
    });

    if (!task?.source?.slackChannelId || !task?.source?.slackThreadTs) {
      console.log("No Slack thread found for task:", args.displayId);
      return;
    }

    // Get workspace to retrieve the bot token
    const workspace = await ctx.runQuery(api.workspaces.getById, { id: task.workspaceId });
    if (!workspace?.slackBotToken) {
      console.error("No Slack bot token for workspace:", task.workspaceId);
      return;
    }

    let message: string;
    if (args.action === "opened") {
      message = `🎉 *Claude opened PR #${args.prNumber}*: ${args.prTitle}\n→ ${args.prUrl}`;
    } else {
      message = `✅ *PR #${args.prNumber} merged!* ${args.displayId} is now complete.`;
    }

    await sendSlackMessage({
      token: workspace.slackBotToken,
      channelId: task.source.slackChannelId,
      threadTs: task.source.slackThreadTs,
      text: message,
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
  return (
    text
      // Convert **bold** to *bold* (must be done before handling single *)
      .replace(/\*\*(.+?)\*\*/g, "*$1*")
      // Convert markdown bullets at start of line to Slack bullets
      .replace(/^\*\s+/gm, "• ")
      .replace(/^-\s+/gm, "• ")
  );
}

async function sendSlackMessage(params: {
  token: string;
  channelId: string;
  threadTs?: string;
  text: string;
  blocks?: unknown[];
}) {
  const { token } = params;
  if (!token) {
    console.error("Slack bot token not provided");
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
      icon_emoji: ":robot_face:",
    }),
  });

  const data = await response.json();
  if (!data.ok) {
    console.error("Slack API error:", data.error);
  }
  return data;
}

// Fetch all replies in a thread from Slack
interface SlackThreadMessage {
  ts: string;
  user: string;
  text: string;
  bot_id?: string;
}

async function fetchThreadReplies(
  token: string,
  channelId: string,
  threadTs: string
): Promise<SlackThreadMessage[]> {
  if (!token) {
    console.error("Slack bot token not provided for thread fetch");
    return [];
  }

  const response = await fetch(
    `https://slack.com/api/conversations.replies?channel=${channelId}&ts=${threadTs}&limit=50`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  const data = await response.json();
  if (!data.ok) {
    console.error("Slack API error fetching thread:", data.error);
    return [];
  }

  return data.messages || [];
}

// Format thread messages as context for the agent
function formatThreadForContext(
  messages: SlackThreadMessage[],
  currentTs: string
): string {
  // Filter out the current message and bot messages, take last 15
  const relevantMessages = messages
    .filter((m) => m.ts !== currentTs && !m.bot_id)
    .slice(-15);

  if (relevantMessages.length === 0) {
    return "";
  }

  const formatted = relevantMessages
    .map((m) => `<@${m.user}>: ${m.text}`)
    .join("\n");

  // Cap at ~2000 chars to avoid token bloat
  const truncated =
    formatted.length > 2000 ? formatted.slice(-2000) + "\n[...truncated]" : formatted;

  return `\n\nThread context (previous messages in this thread):\n${truncated}`;
}

// ===========================================
// ONBOARDING: CHANNEL FUNCTIONS
// ===========================================

export const listBotChannels = internalAction({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args): Promise<SlackChannel[]> => {
    // Get workspace to retrieve the bot token
    const workspace = await ctx.runQuery(api.workspaces.getById, { id: args.workspaceId });
    if (!workspace?.slackBotToken) {
      throw new Error("No Slack bot token configured for this workspace");
    }

    // Fetch all channels (public and private that bot has access to)
    const response = await fetch(
      "https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=200",
      {
        headers: {
          Authorization: `Bearer ${workspace.slackBotToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    const data = await response.json();
    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error}`);
    }

    // Filter to channels where bot is a member
    return data.channels
      .filter((ch: SlackApiChannel) => ch.is_member)
      .map((ch: SlackApiChannel) => ({
        id: ch.id,
        name: ch.name,
        isPrivate: ch.is_private,
        numMembers: ch.num_members,
        topic: ch.topic?.value || "",
      }));
  },
});

// Public action to fetch available Slack channels for the UI
export const getAvailableChannels = action({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args): Promise<SlackChannel[]> => {
    // Verify workspace exists and has bot token
    const workspace = await ctx.runQuery(api.workspaces.getById, { id: args.workspaceId });
    if (!workspace?.slackBotToken) {
      throw new Error("No Slack bot token configured for this workspace");
    }

    // Fetch channels from Slack API using workspace-specific token
    const response = await fetch(
      "https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=200",
      {
        headers: {
          Authorization: `Bearer ${workspace.slackBotToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    const data = await response.json();
    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error}`);
    }

    // Filter to channels where bot is a member
    return data.channels
      .filter((ch: SlackApiChannel) => ch.is_member)
      .map((ch: SlackApiChannel) => ({
        id: ch.id,
        name: ch.name,
        isPrivate: ch.is_private,
        numMembers: ch.num_members,
        topic: ch.topic?.value || "",
      }));
  },
});

export const configureChannels = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    channels: v.array(
      v.object({
        slackChannelId: v.string(),
        slackChannelName: v.string(),
        settings: v.object({
          autoExtractTasks: v.boolean(),
          mentionRequired: v.boolean(),
        }),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const created: string[] = [];

    for (const channel of args.channels) {
      // Check if mapping already exists
      const existing = await ctx.db
        .query("channelMappings")
        .withIndex("by_slack_channel", (q) =>
          q.eq("slackChannelId", channel.slackChannelId)
        )
        .first();

      if (existing) {
        // Update existing mapping
        await ctx.db.patch(existing._id, {
          slackChannelName: channel.slackChannelName,
          settings: {
            ...existing.settings,
            autoExtractTasks: channel.settings.autoExtractTasks,
            mentionRequired: channel.settings.mentionRequired,
          },
          updatedAt: now,
        });
      } else {
        // Create new mapping
        const id = await ctx.db.insert("channelMappings", {
          workspaceId: args.workspaceId,
          slackChannelId: channel.slackChannelId,
          slackChannelName: channel.slackChannelName,
          settings: {
            autoExtractTasks: channel.settings.autoExtractTasks,
            mentionRequired: channel.settings.mentionRequired,
          },
          isActive: true,
          createdAt: now,
          updatedAt: now,
        });
        created.push(id);
      }
    }

    return created;
  },
});

// ===========================================
// BOT CHANNEL JOIN/LEAVE HANDLERS
// ===========================================

export const handleBotJoinedChannel = internalAction({
  args: {
    teamId: v.string(),
    channelId: v.string(),
  },
  handler: async (ctx, args) => {
    // Get workspace by Slack team ID
    const workspace = await ctx.runQuery(internal.slack.getWorkspaceBySlackTeam, {
      slackTeamId: args.teamId,
    });

    if (!workspace) {
      console.error("No workspace found for Slack team:", args.teamId);
      return;
    }

    // Check if channel mapping already exists
    const existingMapping = await ctx.runQuery(internal.slack.getChannelMapping, {
      workspaceId: workspace._id,
      slackChannelId: args.channelId,
    });

    if (existingMapping) {
      // If it exists but is inactive, reactivate it
      if (!existingMapping.isActive) {
        await ctx.runMutation(internal.slack.updateChannelMappingStatus, {
          channelMappingId: existingMapping._id,
          isActive: true,
        });
      }
      return;
    }

    // Fetch channel info from Slack API
    const channelInfo = await fetchChannelInfo(
      workspace.slackBotToken ?? "",
      args.channelId
    );

    if (!channelInfo) {
      console.error("Failed to fetch channel info for:", args.channelId);
      return;
    }

    // Create new channel mapping
    await ctx.runMutation(internal.slack.createChannelMapping, {
      workspaceId: workspace._id,
      slackChannelId: args.channelId,
      slackChannelName: channelInfo.name,
    });

    console.log(`Channel mapping created for ${channelInfo.name} in workspace ${workspace.name}`);
  },
});

export const handleBotLeftChannel = internalAction({
  args: {
    teamId: v.string(),
    channelId: v.string(),
  },
  handler: async (ctx, args) => {
    // Get workspace by Slack team ID
    const workspace = await ctx.runQuery(internal.slack.getWorkspaceBySlackTeam, {
      slackTeamId: args.teamId,
    });

    if (!workspace) {
      console.error("No workspace found for Slack team:", args.teamId);
      return;
    }

    // Find channel mapping
    const channelMapping = await ctx.runQuery(internal.slack.getChannelMapping, {
      workspaceId: workspace._id,
      slackChannelId: args.channelId,
    });

    if (channelMapping) {
      // Mark as inactive instead of deleting
      await ctx.runMutation(internal.slack.updateChannelMappingStatus, {
        channelMappingId: channelMapping._id,
        isActive: false,
      });
      console.log(`Channel mapping deactivated for channel ${args.channelId}`);
    }
  },
});

// Helper function to fetch channel info from Slack
async function fetchChannelInfo(
  token: string,
  channelId: string
): Promise<{ name: string; isPrivate: boolean } | null> {
  try {
    const response = await fetch(
      `https://slack.com/api/conversations.info?channel=${channelId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    const data = await response.json();
    if (!data.ok) {
      console.error("Slack API error:", data.error);
      return null;
    }

    return {
      name: data.channel.name,
      isPrivate: data.channel.is_private,
    };
  } catch (error) {
    console.error("Failed to fetch channel info:", error);
    return null;
  }
}

// Internal mutation to create channel mapping
export const createChannelMapping = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    slackChannelId: v.string(),
    slackChannelName: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    return await ctx.db.insert("channelMappings", {
      workspaceId: args.workspaceId,
      slackChannelId: args.slackChannelId,
      slackChannelName: args.slackChannelName,
      // repositoryId is not set - user will configure this later
      settings: {
        autoExtractTasks: true,
        mentionRequired: true,
      },
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Internal mutation to update channel mapping status
export const updateChannelMappingStatus = internalMutation({
  args: {
    channelMappingId: v.id("channelMappings"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.channelMappingId, {
      isActive: args.isActive,
      updatedAt: Date.now(),
    });
  },
});

// ===========================================
// FILE ATTACHMENTS
// ===========================================

export const downloadSlackFile = internalAction({
  args: {
    url: v.string(),
    filename: v.string(),
    mimeType: v.string(),
    slackBotToken: v.string(), // Workspace-specific token
  },
  handler: async (ctx, args) => {
    // Download file from Slack (requires Bearer token)
    const response = await fetch(args.url, {
      headers: {
        Authorization: `Bearer ${args.slackBotToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }

    const blob = await response.blob();

    // Store in Convex file storage
    const storageId = await ctx.storage.store(blob);

    return storageId;
  },
});

export const downloadSlackFiles = internalAction({
  args: {
    workspaceId: v.id("workspaces"),
    files: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        mimetype: v.string(),
        size: v.number(),
        url_private: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Get workspace token for downloading files
    const workspace = await ctx.runQuery(api.workspaces.getById, { id: args.workspaceId });
    if (!workspace?.slackBotToken) {
      throw new Error("No Slack bot token configured for this workspace");
    }

    const results: Array<{
      storageId: string;
      filename: string;
      mimeType: string;
      size: number;
      slackFileId: string;
    }> = [];

    for (const file of args.files) {
      try {
        const storageId = await ctx.runAction(internal.slack.downloadSlackFile, {
          url: file.url_private,
          filename: file.name,
          mimeType: file.mimetype,
          slackBotToken: workspace.slackBotToken,
        });

        results.push({
          storageId: storageId as string,
          filename: file.name,
          mimeType: file.mimetype,
          size: file.size,
          slackFileId: file.id,
        });
      } catch (error) {
        console.error(`Failed to download file ${file.name}:`, error);
        // Continue with other files
      }
    }

    return results;
  },
});

// ===========================================
// AGENT CONVERSATIONS (for thread continuity)
// ===========================================

export const getAgentConversation = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    slackChannelId: v.string(),
    slackThreadTs: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentConversations")
      .withIndex("by_thread", (q) =>
        q
          .eq("workspaceId", args.workspaceId)
          .eq("slackChannelId", args.slackChannelId)
          .eq("slackThreadTs", args.slackThreadTs)
      )
      .first();
  },
});

export const upsertAgentConversation = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    slackChannelId: v.string(),
    slackThreadTs: v.string(),
    agentThreadId: v.string(),
    status: v.union(v.literal("active"), v.literal("completed")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if conversation exists
    const existing = await ctx.db
      .query("agentConversations")
      .withIndex("by_thread", (q) =>
        q
          .eq("workspaceId", args.workspaceId)
          .eq("slackChannelId", args.slackChannelId)
          .eq("slackThreadTs", args.slackThreadTs)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        agentThreadId: args.agentThreadId,
        status: args.status,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("agentConversations", {
      workspaceId: args.workspaceId,
      slackChannelId: args.slackChannelId,
      slackThreadTs: args.slackThreadTs,
      agentThreadId: args.agentThreadId,
      status: args.status,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// ===========================================
// SLACK ASSISTANTS API
// ===========================================

export const handleAssistantThreadStarted = internalAction({
  args: {
    teamId: v.string(),
    channelId: v.string(),
    threadTs: v.string(),
    userId: v.string(),
    context: v.optional(
      v.object({
        channel_id: v.optional(v.string()),
        team_id: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const workspace = await ctx.runQuery(internal.slack.getWorkspaceBySlackTeam, {
      slackTeamId: args.teamId,
    });

    if (!workspace) {
      console.error("No workspace found for Slack team:", args.teamId);
      return;
    }

    // Set suggested prompts for the assistant
    const response = await fetch(
      "https://slack.com/api/assistant.threads.setSuggestedPrompts",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${workspace.slackBotToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          channel_id: args.channelId,
          thread_ts: args.threadTs,
          prompts: [
            { title: "My tasks", message: "Show my current tasks" },
            { title: "Create task", message: "I need to create a new task" },
            {
              title: "Extract tasks",
              message: "Extract tasks from recent channel messages",
            },
            { title: "Task status", message: "What's the status of my tasks?" },
          ],
        }),
      }
    );

    const data = await response.json();
    if (!data.ok) {
      console.error("Failed to set suggested prompts:", data.error);
    }
  },
});

export const handleAssistantContextChanged = internalAction({
  args: {
    teamId: v.string(),
    channelId: v.string(),
    threadTs: v.string(),
    userId: v.string(),
    context: v.optional(
      v.object({
        channel_id: v.optional(v.string()),
        team_id: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const workspace = await ctx.runQuery(internal.slack.getWorkspaceBySlackTeam, {
      slackTeamId: args.teamId,
    });

    if (!workspace) {
      console.error("No workspace found for Slack team:", args.teamId);
      return;
    }

    // Update prompts based on the new channel context
    const contextChannelId = args.context?.channel_id;

    // Get channel name if we have a context channel
    let channelName = "";
    if (contextChannelId && workspace.slackBotToken) {
      const channelInfo = await fetchChannelInfo(
        workspace.slackBotToken,
        contextChannelId
      );
      if (channelInfo) {
        channelName = channelInfo.name;
      }
    }

    const prompts = contextChannelId
      ? [
          {
            title: "Extract tasks here",
            message: `Extract tasks from #${channelName || contextChannelId}`,
          },
          { title: "My tasks", message: "Show my current tasks" },
          {
            title: "Create task",
            message: `Create a new task for #${channelName || contextChannelId}`,
          },
          {
            title: "Channel backlog",
            message: `Show tasks from #${channelName || contextChannelId}`,
          },
        ]
      : [
          { title: "My tasks", message: "Show my current tasks" },
          { title: "Create task", message: "I need to create a new task" },
          { title: "All tasks", message: "Show all tasks in my workspace" },
          { title: "Help", message: "What can you help me with?" },
        ];

    const response = await fetch(
      "https://slack.com/api/assistant.threads.setSuggestedPrompts",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${workspace.slackBotToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          channel_id: args.channelId,
          thread_ts: args.threadTs,
          prompts,
        }),
      }
    );

    const data = await response.json();
    if (!data.ok) {
      console.error("Failed to update suggested prompts:", data.error);
    }
  },
});

export const handleAssistantMessage = internalAction({
  args: {
    teamId: v.string(),
    channelId: v.string(),
    userId: v.string(),
    text: v.string(),
    ts: v.string(),
    threadTs: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const workspace = await ctx.runQuery(internal.slack.getWorkspaceBySlackTeam, {
      slackTeamId: args.teamId,
    });

    if (!workspace) {
      console.error("No workspace found for Slack team:", args.teamId);
      return;
    }

    const threadTs = args.threadTs || args.ts;

    // Set loading status
    await fetch("https://slack.com/api/assistant.threads.setStatus", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${workspace.slackBotToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel_id: args.channelId,
        thread_ts: threadTs,
        status: "Thinking...",
      }),
    });

    // Process the message - reuse existing task extraction logic
    // For now, provide a simple response based on the message content
    const lowerText = args.text.toLowerCase();
    let responseText = "";

    if (lowerText.includes("my tasks") || lowerText.includes("current tasks")) {
      // TODO: Query user's tasks and format response
      responseText =
        "To see your tasks, visit the Norbot dashboard. I'm working on showing tasks directly here!";
    } else if (lowerText.includes("create task") || lowerText.includes("new task")) {
      responseText =
        "To create a task, @mention me in a channel with your task description, and I'll extract and prioritize it automatically.";
    } else if (lowerText.includes("extract tasks")) {
      responseText =
        "To extract tasks from channel discussions, go to a channel and @mention me with the messages you want analyzed.";
    } else if (lowerText.includes("status")) {
      responseText =
        "Task status tracking is available on the Norbot dashboard. I'll add status updates here soon!";
    } else if (lowerText.includes("help")) {
      responseText = `Here's what I can help you with:

• *Extract tasks* - @mention me in a channel to extract tasks from messages
• *Create tasks* - Describe work that needs to be done
• *Track progress* - Check the dashboard for task status
• *Prioritize* - I automatically prioritize tasks based on urgency and impact

Try @mentioning me in a channel to get started!`;
    } else {
      // Default - treat as potential task description
      responseText = `I received your message. To create a task from this, @mention me in a channel where your team can see it.

For task management, try:
• "Show my tasks"
• "Create a task"
• "Help"`;
    }

    // Send the response (this clears the loading status)
    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${workspace.slackBotToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: args.channelId,
        thread_ts: threadTs,
        text: responseText,
      }),
    });
  },
});

// ===========================================
// TYPES
// ===========================================

interface SlackApiChannel {
  id: string;
  name: string;
  is_private: boolean;
  is_member: boolean;
  num_members: number;
  topic?: { value: string };
}

export interface SlackChannel {
  id: string;
  name: string;
  isPrivate: boolean;
  numMembers: number;
  topic: string;
}
