import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { taskExtractorAgent } from "./agents/taskExtractor";

// ===========================================
// TYPES
// ===========================================

interface CodeContext {
  filePaths?: string[];
  errorMessage?: string;
  stackTrace?: string;
  codeSnippet?: string;
}

interface TaskExtraction {
  title: string;
  description: string;
  priority: "critical" | "high" | "medium" | "low";
  taskType: "bug" | "feature" | "improvement" | "task" | "question";
  confidence: number;
  codeContext?: CodeContext;
  usedAi: boolean;
}

// ===========================================
// AI TASK EXTRACTION
// ===========================================

export const extractTask = internalAction({
  args: {
    text: v.string(),
    channelContext: v.optional(v.string()),
    workspaceId: v.optional(v.id("workspaces")),
  },
  handler: async (ctx, args): Promise<TaskExtraction> => {
    // Check usage limits if workspaceId provided
    if (args.workspaceId) {
      const usage = await ctx.runQuery(internal.ai.checkUsageInternal, {
        workspaceId: args.workspaceId,
      });

      if (!usage.allowed) {
        console.log(`AI limit reached for workspace ${args.workspaceId}, using fallback`);
        return { ...fallbackExtraction(args.text), usedAi: false };
      }
    }

    try {
      // Create a thread for this extraction
      const { threadId } = await taskExtractorAgent.createThread(ctx, {});

      // Add channel context to prompt if available
      const channelInfo = args.channelContext ? `\nChannel: #${args.channelContext}` : "";

      // Build the prompt
      const promptText = `Extract task information from this Slack message and respond with ONLY a JSON object (no markdown, no explanation):
${channelInfo}
Message: ${args.text}

Required JSON format:
{
  "title": "Brief task title (max 80 chars, start with verb)",
  "description": "Fuller description",
  "priority": "critical|high|medium|low",
  "taskType": "bug|feature|improvement|task|question",
  "confidence": 0.0-1.0,
  "codeContext": { "filePaths": [], "errorMessage": "" } // optional
}`;

      // Use generateText with the new API
      // Note: Type assertion needed due to AI SDK 5 vs 6 type mismatch
      const result = await taskExtractorAgent.generateText(ctx, { threadId }, {
        messages: [{ role: "user" as const, content: promptText }],
      } as Parameters<typeof taskExtractorAgent.generateText>[2]);

      // Parse the JSON response
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error("No JSON found in response:", result.text);
        return { ...fallbackExtraction(args.text), usedAi: false };
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Increment usage after successful AI call
      if (args.workspaceId) {
        await ctx.runMutation(internal.ai.incrementUsageInternal, {
          workspaceId: args.workspaceId,
        });
      }

      return {
        title: parsed.title?.slice(0, 80) || args.text.slice(0, 80),
        description: parsed.description || args.text,
        priority: validatePriority(parsed.priority),
        taskType: validateTaskType(parsed.taskType),
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.7,
        codeContext: parsed.codeContext,
        usedAi: true,
      };
    } catch (error) {
      console.error("AI extraction error:", error);
      return { ...fallbackExtraction(args.text), usedAi: false };
    }
  },
});

// ===========================================
// FALLBACK EXTRACTION (no AI)
// ===========================================

function fallbackExtraction(text: string): TaskExtraction {
  const lowerText = text.toLowerCase();

  // Detect priority
  let priority: TaskExtraction["priority"] = "medium";
  if (
    lowerText.includes("urgent") ||
    lowerText.includes("asap") ||
    lowerText.includes("critical") ||
    lowerText.includes("production down")
  ) {
    priority = "critical";
  } else if (lowerText.includes("important") || lowerText.includes("blocking")) {
    priority = "high";
  } else if (lowerText.includes("minor") || lowerText.includes("nice to have")) {
    priority = "low";
  }

  // Detect type
  let taskType: TaskExtraction["taskType"] = "task";
  if (
    lowerText.includes("bug") ||
    lowerText.includes("broken") ||
    lowerText.includes("not working") ||
    lowerText.includes("error") ||
    lowerText.includes("crash") ||
    lowerText.includes("fails")
  ) {
    taskType = "bug";
  } else if (
    lowerText.includes("feature") ||
    lowerText.includes("add ") ||
    lowerText.includes("new ")
  ) {
    taskType = "feature";
  } else if (
    lowerText.includes("improve") ||
    lowerText.includes("enhance") ||
    lowerText.includes("update")
  ) {
    taskType = "improvement";
  } else if (lowerText.includes("?") || lowerText.includes("how") || lowerText.includes("why")) {
    taskType = "question";
  }

  // Extract file paths
  const filePathRegex = /(?:^|[\s(])([.\w/-]+\.[a-z]{1,4})(?:[\s):]|$)/gi;
  const filePaths: string[] = [];
  let match;
  while ((match = filePathRegex.exec(text)) !== null) {
    if (
      match[1].includes("/") ||
      match[1].endsWith(".ts") ||
      match[1].endsWith(".tsx") ||
      match[1].endsWith(".js")
    ) {
      filePaths.push(match[1]);
    }
  }

  // Create title (first sentence or first 80 chars)
  let title = text.split(/[.!?\n]/)[0].trim();
  if (title.length > 80) {
    title = title.slice(0, 77) + "...";
  }

  return {
    title,
    description: text,
    priority,
    taskType,
    confidence: 0.5,
    usedAi: false,
    ...(filePaths.length > 0 ? { codeContext: { filePaths } } : {}),
  };
}

// ===========================================
// VALIDATORS
// ===========================================

function validatePriority(value: unknown): "critical" | "high" | "medium" | "low" {
  const valid = ["critical", "high", "medium", "low"];
  if (typeof value === "string" && valid.includes(value)) {
    return value as "critical" | "high" | "medium" | "low";
  }
  return "medium";
}

function validateTaskType(value: unknown): "bug" | "feature" | "improvement" | "task" | "question" {
  const valid = ["bug", "feature", "improvement", "task", "question"];
  if (typeof value === "string" && valid.includes(value)) {
    return value as "bug" | "feature" | "improvement" | "task" | "question";
  }
  return "task";
}

// ===========================================
// USAGE TRACKING (internal functions)
// ===========================================

import { internalQuery, internalMutation } from "./_generated/server";

const DEFAULT_AI_LIMIT = 2000;
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

export const checkUsageInternal = internalQuery({
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

    const shouldReset = now - usage.lastResetAt > MONTH_MS;
    const currentCalls = shouldReset ? 0 : usage.aiCallsThisMonth;
    const limit = usage.aiCallsLimit || DEFAULT_AI_LIMIT;

    if (limit === 0) return { allowed: true };

    return { allowed: currentCalls < limit };
  },
});

export const incrementUsageInternal = internalMutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const workspace = await ctx.db.get(args.workspaceId);
    if (!workspace) return;

    const now = Date.now();
    const usage = workspace.usage ?? {
      aiCallsThisMonth: 0,
      aiCallsLimit: DEFAULT_AI_LIMIT,
      lastResetAt: now,
    };

    const shouldReset = now - usage.lastResetAt > MONTH_MS;

    await ctx.db.patch(args.workspaceId, {
      usage: {
        aiCallsThisMonth: shouldReset ? 1 : usage.aiCallsThisMonth + 1,
        aiCallsLimit: usage.aiCallsLimit || DEFAULT_AI_LIMIT,
        lastResetAt: shouldReset ? now : usage.lastResetAt,
      },
      updatedAt: now,
    });
  },
});
