import { v } from "convex/values";
import { internalAction } from "./_generated/server";
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
}

// ===========================================
// AI TASK EXTRACTION
// ===========================================

export const extractTask = internalAction({
  args: {
    text: v.string(),
    channelContext: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<TaskExtraction> => {
    try {
      // Create a thread for this extraction
      const { threadId } = await taskExtractorAgent.createThread(ctx, {});

      // Add channel context to prompt if available
      const channelInfo = args.channelContext
        ? `\nChannel: #${args.channelContext}`
        : "";

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
      const result = await taskExtractorAgent.generateText(
        ctx,
        { threadId },
        { messages: [{ role: "user" as const, content: promptText }] } as Parameters<typeof taskExtractorAgent.generateText>[2]
      );

      // Parse the JSON response
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error("No JSON found in response:", result.text);
        return fallbackExtraction(args.text);
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        title: parsed.title?.slice(0, 80) || args.text.slice(0, 80),
        description: parsed.description || args.text,
        priority: validatePriority(parsed.priority),
        taskType: validateTaskType(parsed.taskType),
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.7,
        codeContext: parsed.codeContext,
      };
    } catch (error) {
      console.error("AI extraction error:", error);
      return fallbackExtraction(args.text);
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
  } else if (
    lowerText.includes("important") ||
    lowerText.includes("blocking")
  ) {
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
  } else if (
    lowerText.includes("?") ||
    lowerText.includes("how") ||
    lowerText.includes("why")
  ) {
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
    ...(filePaths.length > 0 ? { codeContext: { filePaths } } : {}),
  };
}

// ===========================================
// VALIDATORS
// ===========================================

function validatePriority(
  value: unknown
): "critical" | "high" | "medium" | "low" {
  const valid = ["critical", "high", "medium", "low"];
  if (typeof value === "string" && valid.includes(value)) {
    return value as "critical" | "high" | "medium" | "low";
  }
  return "medium";
}

function validateTaskType(
  value: unknown
): "bug" | "feature" | "improvement" | "task" | "question" {
  const valid = ["bug", "feature", "improvement", "task", "question"];
  if (typeof value === "string" && valid.includes(value)) {
    return value as "bug" | "feature" | "improvement" | "task" | "question";
  }
  return "task";
}
