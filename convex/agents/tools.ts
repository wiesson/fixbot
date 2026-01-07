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
    "Get a summary of active tasks for a Slack channel. Returns task counts grouped by status and priority. Use this when the user asks for a summary, status, or overview of tasks.",
  args: z.object({
    workspaceId: z.string().describe("The workspace ID"),
    slackChannelId: z.string().describe("The Slack channel ID to get tasks for"),
  }),
  handler: async (ctx, args): Promise<TaskSummaryResult> => {
    // Get channel mapping to find repository
    const channelMapping = await ctx.runQuery(internal.tools.getChannelMappingById, {
      slackChannelId: args.slackChannelId,
    });

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
      .enum(["backlog", "todo", "in_progress", "in_review", "done", "cancelled"])
      .describe("The new status for the task"),
    slackUserId: z.string().describe("The Slack user ID making the change"),
  }),
  handler: async (ctx, args): Promise<StatusUpdateResult> => {
    const result = await ctx.runMutation(internal.tools.updateTaskStatusByDisplayId, {
      displayId: args.displayId.toUpperCase(),
      newStatus: args.newStatus,
      slackUserId: args.slackUserId,
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
    assigneeSlackId: z
      .string()
      .describe("The Slack user ID to assign the task to (e.g., U12345ABC, without the <@ and >)"),
    actorSlackUserId: z.string().describe("The Slack user ID of the person making the assignment"),
  }),
  handler: async (ctx, args): Promise<AssignmentResult> => {
    const result = await ctx.runMutation(internal.tools.assignTaskByDisplayId, {
      displayId: args.displayId.toUpperCase(),
      assigneeSlackId: args.assigneeSlackId,
      actorSlackUserId: args.actorSlackUserId,
    });
    return result;
  },
});

// ===========================================
// CREATE TASK TOOL
// ===========================================

export const createTaskTool = createTool({
  description:
    "Create a new task from a bug report or feature request. ONLY use this when the user describes actual work to be done - a bug, feature request, or task. Do NOT use for greetings, questions about capabilities, or general conversation. If a project was detected or specified, include the projectId.",
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
    workspaceId: z.string().describe("The workspace ID"),
    slackChannelId: z.string().describe("The Slack channel ID"),
    slackUserId: z.string().describe("The Slack user ID who reported this"),
    slackMessageTs: z.string().describe("The Slack message timestamp"),
    slackThreadTs: z.string().describe("The Slack thread timestamp"),
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
      .describe("File attachments from the Slack message (already downloaded to Convex storage)"),
  }),
  handler: async (ctx, args): Promise<CreateTaskResult> => {
    const result = await ctx.runMutation(internal.tools.createTask, {
      workspaceId: args.workspaceId as Id<"workspaces">,
      projectId: args.projectId ? (args.projectId as Id<"projects">) : undefined,
      title: args.title,
      description: args.description,
      priority: args.priority,
      taskType: args.taskType,
      slackChannelId: args.slackChannelId,
      slackUserId: args.slackUserId,
      slackMessageTs: args.slackMessageTs,
      slackThreadTs: args.slackThreadTs,
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
    workspaceId: z.string().describe("The workspace ID"),
  }),
  handler: async (ctx, args): Promise<CreateProjectResult> => {
    const result = await ctx.runMutation(internal.tools.createProject, {
      workspaceId: args.workspaceId as Id<"workspaces">,
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
    workspaceId: z.string().describe("The workspace ID"),
  }),
  handler: async (ctx, args): Promise<ListProjectsResult> => {
    const projects = await ctx.runQuery(internal.tools.listProjects, {
      workspaceId: args.workspaceId as Id<"workspaces">,
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
    workspaceId: z.string().describe("The workspace ID"),
    searchText: z.string().describe("The message text to search for project references"),
  }),
  handler: async (ctx, args): Promise<FindProjectResult> => {
    const result = await ctx.runQuery(internal.tools.findProjectByMatch, {
      workspaceId: args.workspaceId as Id<"workspaces">,
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
    workspaceId: z.string().describe("The workspace ID"),
    slackUserId: z.string().describe("The Slack user ID (to get their GitHub token)"),
  }),
  handler: async (ctx, args): Promise<SendToGitHubResult> => {
    // Find task by display ID
    const task = await ctx.runQuery(internal.github.getTaskByDisplayId, {
      displayId: args.displayId,
    });

    if (!task) {
      return { success: false, error: `Task ${args.displayId} not found` };
    }

    // Find user by Slack ID
    const user = await ctx.runQuery(internal.tools.getUserBySlackId, {
      slackUserId: args.slackUserId,
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
    workspaceId: z.string().describe("The workspace ID"),
    slackUserId: z.string().describe("The Slack user ID (to verify repo access)"),
  }),
  handler: async (ctx, args): Promise<LinkRepoResult> => {
    // Find user by Slack ID
    const user = await ctx.runQuery(internal.tools.getUserBySlackId, {
      slackUserId: args.slackUserId,
    });

    if (!user) {
      return { success: false, error: "User not found. Please link your GitHub account first." };
    }

    const result = await ctx.runAction(internal.github.linkRepositoryToProject, {
      repoUrl: args.repoUrl,
      workspaceId: args.workspaceId as Id<"workspaces">,
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
    workspaceId: z.string().describe("The workspace ID"),
  }),
  handler: async (ctx, args): Promise<ListReposResult> => {
    const repositories = await ctx.runQuery(internal.github.listRepositoriesForWorkspace, {
      workspaceId: args.workspaceId as Id<"workspaces">,
    });
    return { repositories };
  },
});
