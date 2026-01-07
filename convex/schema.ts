import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ===========================================
  // WORKSPACES (= Slack Team)
  // ===========================================

  workspaces: defineTable({
    name: v.string(),
    slug: v.string(),

    // Slack Integration
    slackTeamId: v.string(),
    slackTeamName: v.string(),
    slackBotUserId: v.optional(v.string()),

    // Settings
    settings: v.object({
      defaultTaskPriority: v.optional(
        v.union(v.literal("critical"), v.literal("high"), v.literal("medium"), v.literal("low"))
      ),
      aiExtractionEnabled: v.boolean(),
    }),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slack_team_id", ["slackTeamId"])
    .index("by_slug", ["slug"]),

  // ===========================================
  // PROJECTS (logical groupings within workspace)
  // ===========================================

  projects: defineTable({
    workspaceId: v.id("workspaces"),
    repositoryId: v.optional(v.id("repositories")), // Linked GitHub repo

    // Identity
    shortCode: v.string(), // "TM", "ACME" - used in task IDs like TM-123
    name: v.string(), // "TakeMemories"
    domain: v.optional(v.string()), // "takememories.com" - for auto-detection
    description: v.optional(v.string()),

    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_and_code", ["workspaceId", "shortCode"])
    .index("by_repository", ["repositoryId"]),

  // ===========================================
  // PROJECT COUNTERS (for per-project task numbering)
  // ===========================================

  projectCounters: defineTable({
    projectId: v.id("projects"),
    counterType: v.literal("task_number"),
    currentValue: v.number(),
  }).index("by_project_and_type", ["projectId", "counterType"]),

  // ===========================================
  // REPOSITORIES (GitHub repos linked to workspace)
  // ===========================================

  repositories: defineTable({
    workspaceId: v.id("workspaces"),

    // Repository Info
    name: v.string(),
    fullName: v.string(), // e.g., "acme-corp/frontend"
    cloneUrl: v.string(),
    defaultBranch: v.string(),

    // GitHub IDs
    githubId: v.number(),
    githubNodeId: v.string(),

    // Settings
    settings: v.object({
      claudeCodeEnabled: v.boolean(),
      branchPrefix: v.optional(v.string()),
      autoCreateBranches: v.boolean(),
    }),

    isActive: v.boolean(),
    lastSyncedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_github_id", ["githubId"]),

  // ===========================================
  // CHANNEL MAPPINGS (Slack channel -> repo)
  // ===========================================

  channelMappings: defineTable({
    workspaceId: v.id("workspaces"),
    repositoryId: v.optional(v.id("repositories")),

    slackChannelId: v.string(),
    slackChannelName: v.string(),

    // Settings
    settings: v.object({
      autoExtractTasks: v.boolean(),
      mentionRequired: v.boolean(),
      defaultPriority: v.optional(v.string()),
    }),

    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_slack_channel", ["slackChannelId"])
    .index("by_repository", ["repositoryId"]),

  // ===========================================
  // USERS
  // ===========================================

  users: defineTable({
    // Identity
    email: v.string(),
    name: v.string(),
    avatarUrl: v.optional(v.string()),

    // GitHub Identity (primary auth)
    githubId: v.number(),
    githubUsername: v.string(),
    githubAccessToken: v.optional(v.string()),

    // Slack Identity (linked)
    slackUserId: v.optional(v.string()),
    slackUsername: v.optional(v.string()),

    // Preferences
    preferences: v.object({
      defaultWorkspaceId: v.optional(v.id("workspaces")),
      notifications: v.object({
        slackDM: v.boolean(),
        email: v.boolean(),
      }),
    }),

    // Onboarding state
    onboarding: v.optional(
      v.object({
        completedAt: v.optional(v.number()),
        skippedSteps: v.array(v.string()),
        currentStep: v.optional(v.string()),
      })
    ),

    isActive: v.boolean(),
    lastSeenAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_github_id", ["githubId"])
    .index("by_email", ["email"])
    .index("by_slack_user_id", ["slackUserId"]),

  // ===========================================
  // WORKSPACE MEMBERS (Many-to-Many)
  // ===========================================

  workspaceMembers: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),

    role: v.union(v.literal("admin"), v.literal("member"), v.literal("viewer")),

    joinedAt: v.number(),
    invitedById: v.optional(v.id("users")),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_user", ["userId"])
    .index("by_workspace_and_user", ["workspaceId", "userId"]),

  // ===========================================
  // TASKS
  // ===========================================

  tasks: defineTable({
    workspaceId: v.id("workspaces"),
    repositoryId: v.optional(v.id("repositories")),
    projectId: v.optional(v.id("projects")), // Optional project grouping

    // Task Identity
    taskNumber: v.number(),
    displayId: v.string(), // e.g., "TM-123" or "FIX-123"

    // Content
    title: v.string(),
    description: v.optional(v.string()),

    // Classification
    status: v.union(
      v.literal("backlog"),
      v.literal("todo"),
      v.literal("in_progress"),
      v.literal("in_review"),
      v.literal("done"),
      v.literal("cancelled")
    ),
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

    // Assignment
    assigneeId: v.optional(v.id("users")),
    createdById: v.optional(v.id("users")),

    // Source Tracking
    source: v.object({
      type: v.union(v.literal("slack"), v.literal("manual"), v.literal("github"), v.literal("api")),
      slackChannelId: v.optional(v.string()),
      slackChannelName: v.optional(v.string()),
      slackMessageTs: v.optional(v.string()),
      slackThreadTs: v.optional(v.string()),
      slackPermalink: v.optional(v.string()),
      githubIssueNumber: v.optional(v.number()),
      githubIssueUrl: v.optional(v.string()),
    }),

    // Code Context (for Claude Code)
    codeContext: v.optional(
      v.object({
        url: v.optional(v.string()), // URL where the bug/issue occurs
        filePaths: v.optional(v.array(v.string())),
        errorMessage: v.optional(v.string()),
        stackTrace: v.optional(v.string()),
        codeSnippet: v.optional(v.string()),
        suggestedFix: v.optional(v.string()),
        branch: v.optional(v.string()),
        commitSha: v.optional(v.string()),
      })
    ),

    // Attachments (files/images from Slack)
    attachments: v.optional(
      v.array(
        v.object({
          storageId: v.id("_storage"), // Convex file storage ID
          filename: v.string(),
          mimeType: v.string(),
          size: v.number(),
          slackFileId: v.string(),
        })
      )
    ),

    // AI Extraction Metadata
    aiExtraction: v.optional(
      v.object({
        extractedAt: v.number(),
        model: v.string(),
        confidence: v.number(),
        originalText: v.string(),
      })
    ),

    // Claude Code Execution
    claudeCodeExecution: v.optional(
      v.object({
        status: v.union(
          v.literal("pending"),
          v.literal("running"),
          v.literal("completed"),
          v.literal("failed")
        ),
        startedAt: v.optional(v.number()),
        completedAt: v.optional(v.number()),
        pullRequestUrl: v.optional(v.string()),
        branchName: v.optional(v.string()),
        commitSha: v.optional(v.string()),
        errorMessage: v.optional(v.string()),
      })
    ),

    // GitHub Integration (when sent to GitHub for fixing)
    githubIntegration: v.optional(
      v.object({
        issueNumber: v.optional(v.number()),
        issueUrl: v.optional(v.string()),
        pullRequestNumber: v.optional(v.number()),
        pullRequestUrl: v.optional(v.string()),
        sentAt: v.optional(v.number()),
        sentByUserId: v.optional(v.id("users")),
      })
    ),

    // Labels
    labels: v.array(v.string()),

    // Dates
    dueDate: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_and_status", ["workspaceId", "status"])
    .index("by_repository", ["repositoryId"])
    .index("by_repository_and_status", ["repositoryId", "status"])
    .index("by_project", ["projectId"])
    .index("by_project_and_status", ["projectId", "status"])
    .index("by_assignee", ["assigneeId"])
    .index("by_display_id", ["displayId"]),

  // ===========================================
  // MESSAGES (Task comments/conversation)
  // ===========================================

  messages: defineTable({
    taskId: v.id("tasks"),
    authorId: v.optional(v.id("users")),

    content: v.string(),
    contentType: v.union(v.literal("text"), v.literal("markdown"), v.literal("system")),

    // Slack sync
    slackMessageTs: v.optional(v.string()),

    // AI-generated
    aiGenerated: v.optional(
      v.object({
        model: v.string(),
        purpose: v.string(),
      })
    ),

    isEdited: v.boolean(),
    editedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_task", ["taskId"])
    .index("by_task_and_created", ["taskId", "createdAt"]),

  // ===========================================
  // TASK ACTIVITY (Audit log)
  // ===========================================

  taskActivity: defineTable({
    taskId: v.id("tasks"),
    userId: v.optional(v.id("users")),

    activityType: v.union(
      v.literal("created"),
      v.literal("status_changed"),
      v.literal("assigned"),
      v.literal("unassigned"),
      v.literal("priority_changed"),
      v.literal("repo_linked"),
      v.literal("comment_added"),
      v.literal("claude_code_started"),
      v.literal("claude_code_completed"),
      v.literal("pr_created"),
      v.literal("pr_merged")
    ),

    changes: v.optional(
      v.object({
        field: v.string(),
        oldValue: v.optional(v.string()),
        newValue: v.optional(v.string()),
      })
    ),

    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_task", ["taskId"])
    .index("by_task_and_type", ["taskId", "activityType"]),

  // ===========================================
  // WORKSPACE COUNTERS (for task numbering)
  // ===========================================

  workspaceCounters: defineTable({
    workspaceId: v.id("workspaces"),
    counterType: v.literal("task_number"),
    currentValue: v.number(),
  }).index("by_workspace_and_type", ["workspaceId", "counterType"]),

  // ===========================================
  // SESSIONS (for auth)
  // ===========================================

  sessions: defineTable({
    userId: v.id("users"),
    token: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_user", ["userId"]),

  // ===========================================
  // PROCESSED SLACK EVENTS (deduplication)
  // ===========================================

  processedSlackEvents: defineTable({
    eventTs: v.string(), // Slack message timestamp (unique per event)
    eventType: v.string(), // "app_mention", "message", etc.
    processedAt: v.number(),
  }).index("by_event_ts", ["eventTs"]),
});
