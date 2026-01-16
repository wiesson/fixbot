import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";

// ===========================================
// SHARED TYPES
// ===========================================

export const SourceContextSchema = z.object({
  type: z.enum(["slack", "web", "api"]),
  workspaceId: z.string(),
  // Slack specific
  channelId: z.string().optional(),
  channelName: z.string().optional(),
  userId: z.string(), // Slack User ID or User ID
  messageTs: z.string().optional(),
  threadTs: z.string().optional(),
  // Web specific
  pageUrl: z.string().optional(),
});

export type SourceContext = z.infer<typeof SourceContextSchema>;

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
  displayId?: string;
  title?: string;
  priority?: string;
  taskType?: string;
  error?: string;
}

interface CreateProjectResult {
  success: boolean;
  projectId?: string;
  shortCode?: string;
  name?: string;
  domain?: string;
  error?: string;
}

interface ListProjectsResult {
  projects: Array<{
    id: string;
    shortCode: string;
    name: string;
    domain?: string;
    description?: string;
  }>;
}

interface FindProjectResult {
  project: { id: string; shortCode: string; name: string } | null;
  matchType?: string;
  availableProjects?: Array<{ shortCode: string; name: string }>;
}

// ===========================================
// SUMMARIZE TASKS TOOL
// ===========================================

export const summarizeTasksTool = createTool({
  description:
    "Get a summary of active tasks. Returns task counts grouped by status and priority. Use this when the user asks for a summary, status, or overview of tasks.",
  args: z.object({
    source: SourceContextSchema,
  }),
  handler: async (ctx, args): Promise<TaskSummaryResult> => {
    let repositoryId: Id<"repositories"> | undefined;

    // If coming from Slack, check if channel has a mapped repo
    if (args.source.type === "slack" && args.source.channelId) {
      const channelMapping = await ctx.runQuery(internal.tools.getChannelMappingById, {
        workspaceId: args.source.workspaceId as Id<"workspaces">,
        slackChannelId: args.source.channelId,
      });
      repositoryId = channelMapping?.repositoryId;
    }

    // Query tasks for this workspace/repository
    const summary = await ctx.runQuery(internal.tools.getTasksForSummary, {
      workspaceId: args.source.workspaceId as Id<"workspaces">,
      repositoryId,
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
      .enum(["backlog", "todo", "in_progress", "in_review", "done", "cancelled"])
      .describe("The new status for the task"),
    source: SourceContextSchema,
  }),
  handler: async (ctx, args): Promise<StatusUpdateResult> => {
    // Determine userId based on source (assumes Slack userId for now, ideally maps to internal ID)
    const slackUserId = args.source.type === "slack" ? args.source.userId : ""; 
    
    // Note: If source is 'web', we might have an internal ID directly.
    // For now, adhering to existing `updateTaskStatusByDisplayId` which expects SlackUserId or should be updated to receive generic ID.
    // This assumes the mutation handles lookup.
    
    const result = await ctx.runMutation(internal.tools.updateTaskStatusByDisplayId, {
      displayId: args.displayId.toUpperCase(),
      newStatus: args.newStatus,
      slackUserId: slackUserId, // TODO: Update mutation to support non-Slack ID updates
    });
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
    assigneeId: z
      .string()
      .describe("The ID to assign the task to (e.g., Slack ID U12345ABC)"),
    source: SourceContextSchema,
  }),
  handler: async (ctx, args): Promise<AssignmentResult> => {
    const slackUserId = args.source.type === "slack" ? args.source.userId : "";

    const result = await ctx.runMutation(internal.tools.assignTaskByDisplayId, {
      displayId: args.displayId.toUpperCase(),
      assigneeSlackId: args.assigneeId, 
      actorSlackUserId: slackUserId,
    });
    return result;
  },
});

// ===========================================
// CREATE TASK TOOL
// ===========================================

export const createTaskTool = createTool({
  description:
    "Create a new task from a bug report or feature request. ONLY use this when the user describes actual work to be done. If a project was detected or specified, include the projectId.",
  args: z.object({
    title: z.string().describe("A clear, actionable task title (start with a verb, max 80 chars)"),
    description: z.string().describe("Fuller description of the task with context"),
    priority: z
      .enum(["critical", "high", "medium", "low"])
      .describe(
        "Task priority: critical (production down), high (urgent), medium (normal), low (nice to have)"
      ),
    taskType: z
      .enum(["bug", "feature", "improvement", "task", "question"])
      .describe("Type of task: bug, feature, improvement, task, or question"),
    projectId: z
      .string()
      .optional()
      .describe(
        "Optional project ID for project-specific task numbering (e.g., TM-1 instead of FIX-1)"
      ),
    source: SourceContextSchema,
    originalText: z.string().describe("The original user message"),
    url: z
      .string()
      .optional()
      .describe(
        "URL where the bug or issue occurs. Required for bug and improvement task types if detected in the message."
      ),
    attachments: z
      .array(
        z.object({
          storageId: z.string(),
          filename: z.string(),
          mimeType: z.string(),
          size: z.number(),
          slackFileId: z.string(),
        })
      )
      .optional()
      .describe("File attachments (if available)"),
  }),
  handler: async (ctx, args): Promise<CreateTaskResult> => {
    // Map generic source to args expected by mutation
    // We need to update the mutation to handle missing Slack args or use separate args
    
    const slackChannelId = args.source.channelId || "";
    const slackUserId = args.source.userId || "";
    const slackMessageTs = args.source.messageTs || "";
    const slackThreadTs = args.source.threadTs || "";

    const result = await ctx.runMutation(internal.tools.createTask, {
      workspaceId: args.source.workspaceId as Id<"workspaces">,
      projectId: args.projectId ? (args.projectId as Id<"projects">) : undefined,
      title: args.title,
      description: args.description,
      priority: args.priority,
      taskType: args.taskType,
      // Pass these even if empty - the mutation handles them or we will decouple later
      slackChannelId,
      slackUserId,
      slackMessageTs,
      slackThreadTs,
      originalText: args.originalText,
      url: args.url,
      attachments: args.attachments?.map((a) => ({
        ...a,
        storageId: a.storageId as Id<"_storage">,
      })),
    });
    return result;
  },
});

// ===========================================
// CREATE PROJECT TOOL
// ===========================================

export const createProjectTool = createTool({
  description:
    "Create a new project for organizing tasks. Use when user says 'add project', 'create project', or similar. Projects have a short code (used in task IDs like TM-123), a name, and optional domain for auto-detection.",
  args: z.object({
    shortCode: z
      .string()
      .describe(
        "2-5 character uppercase code for the project (e.g., 'TM', 'ACME'). Used in task IDs."
      ),
    name: z.string().describe("Full name of the project (e.g., 'TakeMemories')"),
    domain: z
      .string()
      .optional()
      .describe("Optional domain for auto-detection (e.g., 'takememories.com')"),
    description: z.string().optional().describe("Optional description of the project"),
    source: SourceContextSchema,
  }),
  handler: async (ctx, args): Promise<CreateProjectResult> => {
    const result = await ctx.runMutation(internal.tools.createProject, {
      workspaceId: args.source.workspaceId as Id<"workspaces">,
      shortCode: args.shortCode,
      name: args.name,
      domain: args.domain,
      description: args.description,
    });
    return result;
  },
});

// ===========================================
// LIST PROJECTS TOOL
// ===========================================

export const listProjectsTool = createTool({
  description:
    "List all active projects in the workspace. Use when user asks to 'list projects', 'show projects', 'what projects do we have', etc.",
  args: z.object({
    source: SourceContextSchema,
  }),
  handler: async (ctx, args): Promise<ListProjectsResult> => {
    const projects = await ctx.runQuery(internal.tools.listProjects, {
      workspaceId: args.source.workspaceId as Id<"workspaces">,
    });
    return { projects };
  },
});

// ===========================================
// FIND PROJECT TOOL
// ===========================================

export const findProjectTool = createTool({
  description:
    "Try to detect which project a message is about by matching domain, short code, or name. Use this BEFORE creating a task to auto-detect the project from the user's message.",
  args: z.object({
    source: SourceContextSchema,
    searchText: z.string().describe("The message text to search for project references"),
  }),
  handler: async (ctx, args): Promise<FindProjectResult> => {
    const result = await ctx.runQuery(internal.tools.findProjectByMatch, {
      workspaceId: args.source.workspaceId as Id<"workspaces">,
      searchText: args.searchText,
    });
    return result;
  },
});

// ===========================================
// SEND TO GITHUB TOOL
// ===========================================

interface SendToGitHubResult {
  success: boolean;
  issueNumber?: number;
  issueUrl?: string;
  repositoryName?: string;
  error?: string;
}

export const sendToGitHubTool = createTool({
  description:
    "Create a GitHub issue from a task and @mention Claude to automatically fix it. Use when user says 'fix TM-42', 'send to GitHub', 'claude fix this'. Requires the task's project to have a linked repository.",
  args: z.object({
    displayId: z.string().describe("The task display ID (e.g., TM-42, FIX-123)"),
    source: SourceContextSchema,
  }),
  handler: async (ctx, args): Promise<SendToGitHubResult> => {
    // Find task by display ID
    const task = await ctx.runQuery(internal.github.getTaskByDisplayId, {
      displayId: args.displayId,
    });

    if (!task) {
      return { success: false, error: `Task ${args.displayId} not found` };
    }

    // Determine user ID
    let slackUserId = "";
    if (args.source.type === "slack") {
      slackUserId = args.source.userId;
    } else {
       return { success: false, error: "Web-based GitHub linking not yet implemented" };
    }

    // Find user by Slack ID
    const user = await ctx.runQuery(internal.tools.getUserBySlackId, {
      slackUserId: slackUserId,
    });

    if (!user) {
      return { success: false, error: "User not found. Please link your GitHub account first." };
    }

    // Create GitHub issue
    const result = await ctx.runAction(internal.github.createIssue, {
      taskId: task._id,
      userId: user._id,
    });

    return result;
  },
});

// ===========================================
// LINK REPOSITORY TOOL
// ===========================================

interface LinkRepoResult {
  success: boolean;
  repositoryId?: string;
  fullName?: string;
  linkedToProject?: boolean;
  error?: string;
}

export const linkRepoTool = createTool({
  description:
    "Link a GitHub repository to a project or workspace. Use when user says 'add repo', 'connect repo', 'link repo'. Format: github.com/owner/repo",
  args: z.object({
    repoUrl: z.string().describe("GitHub repo URL (e.g., github.com/owner/repo)"),
    projectId: z.string().optional().describe("Optional project ID to link the repo to"),
    source: SourceContextSchema,
  }),
  handler: async (ctx, args): Promise<LinkRepoResult> => {
    let slackUserId = "";
    if (args.source.type === "slack") {
        slackUserId = args.source.userId;
    } else {
        // TODO: Handle Web user identity
        return { success: false, error: "Only Slack supported for now" };
    }

    // Find user by Slack ID
    const user = await ctx.runQuery(internal.tools.getUserBySlackId, {
      slackUserId: slackUserId,
    });

    if (!user) {
      return { success: false, error: "User not found. Please link your GitHub account first." };
    }

    const result = await ctx.runAction(internal.github.linkRepositoryToProject, {
      repoUrl: args.repoUrl,
      workspaceId: args.source.workspaceId as Id<"workspaces">,
      projectId: args.projectId ? (args.projectId as Id<"projects">) : undefined,
      userId: user._id,
    });

    return result;
  },
});

// ===========================================
// LIST REPOSITORIES TOOL
// ===========================================

interface ListReposResult {
  repositories: Array<{
    id: string;
    name: string;
    fullName: string;
    defaultBranch: string;
  }>;
}

export const listReposTool = createTool({
  description: "List all repositories linked to the workspace. Use when user asks 'show repos', 'list repositories'.",
  args: z.object({
    source: SourceContextSchema,
  }),
  handler: async (ctx, args): Promise<ListReposResult> => {
    const repositories = await ctx.runQuery(internal.github.listRepositoriesForWorkspace, {
      workspaceId: args.source.workspaceId as Id<"workspaces">,
    });
    return { repositories };
  },
});
