import { v } from "convex/values";
import { action, mutation } from "./_generated/server";
import { norbotAgent } from "./agents/taskExtractor";
import { Id } from "./_generated/dataModel";

// ===========================================
// WEB CHAT ACTION
// ===========================================

export const chat = action({
  args: {
    message: v.string(),
    pageUrl: v.optional(v.string()),
    attachmentIds: v.optional(v.array(v.string())), // Storage IDs
    threadId: v.optional(v.string()), // For conversational continuity
  },
  handler: async (ctx, args) => {
    // 1. Get User Identity
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    // 2. Construct Source Context
    // Note: We use the `subject` as userId. In a real app, you might map this to your internal user ID.
    const sourceContext = {
      type: "web" as const,
      workspaceId: "TODO_DEFAULT_WORKSPACE", // In a real multi-tenant app, pass this from frontend
      userId: identity.subject,
      pageUrl: args.pageUrl,
    };

    // 3. Prepare Attachments for Agent
    // The Agent expects attachments with metadata. Since we just have IDs here, we might need to mock the metadata 
    // or fetch it. For now, we'll pass a simplified structure if the tool supports it, 
    // or rely on the agent to handle basic storage IDs.
    // Looking at `createTaskTool`, it expects generic `attachments` object. 
    // We will pass them as part of the prompt context or adapt the tool to lookup metadata.
    // For simplicity in this demo, we'll pass them in context.

    let attachmentContext = "";
    if (args.attachmentIds && args.attachmentIds.length > 0) {
      // We pass the IDs so the agent knows they exist.
      // The `createTaskTool` will receive them if we pass them to the tool call.
      // BUT: The `createTask` mutation expects metadata (filename, etc). 
      // For this MVP, we will assume the User provides text description of images or we skip metadata.
      // Ideally, the frontend sends metadata along with IDs.
      attachmentContext = `\n[User uploaded ${args.attachmentIds.length} files: ${args.attachmentIds.join(", ")}]`;
    }

    // 4. Invoke Agent
    const contextInfo = `Context (use these values when calling tools):
- source: ${JSON.stringify(sourceContext)}
- channelName: web-chat
${attachmentContext}

User message: ${args.message}`;

    // Create thread if needed
    let threadId = args.threadId;
    if (!threadId) {
      const thread = await norbotAgent.createThread(ctx, {});
      threadId = thread.threadId;
    }

    // Call Agent
    const result = await norbotAgent.generateText(ctx, { threadId }, {
      messages: [{ role: "user", content: contextInfo }],
      maxSteps: 5,
    } as any); // Type assertion to bypass strict checking issue

    return {
      text: result.text,
      threadId: threadId,
    };
  },
});

// ===========================================
// FILE UPLOAD
// ===========================================

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});
