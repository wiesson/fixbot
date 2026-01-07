"use client";

import { cn } from "@/lib/utils";
import { TaskCard } from "./task-card";
import { Plus } from "lucide-react";
import type { Id } from "@convex/_generated/dataModel";

interface Task {
  _id: Id<"tasks">;
  displayId: string;
  title: string;
  description?: string;
  priority: "critical" | "high" | "medium" | "low";
  taskType: "bug" | "feature" | "improvement" | "task" | "question";
  labels: string[];
  source: {
    type: "slack" | "manual" | "github" | "api";
    slackChannelName?: string;
  };
  claudeCodeExecution?: {
    status: "pending" | "running" | "completed" | "failed";
    pullRequestUrl?: string;
  };
  assignee?: {
    name: string;
    avatarUrl?: string;
  };
}

interface KanbanColumnProps {
  title: string;
  status: string;
  tasks: Task[];
  color: string;
  onTaskClick?: (taskId: Id<"tasks">) => void;
  onAddTask?: () => void;
}

const statusColors: Record<string, string> = {
  backlog: "bg-slate-400",
  todo: "bg-blue-500",
  in_progress: "bg-amber-500",
  in_review: "bg-purple-500",
  done: "bg-emerald-500",
};

export function KanbanColumn({
  title,
  status,
  tasks,
  onTaskClick,
  onAddTask,
}: KanbanColumnProps) {
  return (
    <div className="flex flex-col min-w-[280px] w-[280px] bg-neutral-100 dark:bg-neutral-900 rounded-lg">
      {/* Column Header */}
      <div className="p-3 border-b border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={cn("h-2.5 w-2.5 rounded-full", statusColors[status])}
            />
            <h3 className="font-medium text-sm">{title}</h3>
            <span className="text-xs text-muted-foreground bg-neutral-200 dark:bg-neutral-800 px-1.5 py-0.5 rounded-full">
              {tasks.length}
            </span>
          </div>
          {onAddTask && status === "backlog" && (
            <button
              onClick={onAddTask}
              className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-800 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Tasks List */}
      <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-220px)]">
        {tasks.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            No tasks
          </div>
        ) : (
          tasks.map((task) => (
            <TaskCard
              key={task._id}
              task={task}
              onClick={() => onTaskClick?.(task._id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
