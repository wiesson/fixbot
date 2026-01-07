"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  Bug,
  Lightbulb,
  Zap,
  HelpCircle,
  CheckSquare,
  GitPullRequest,
  MessageSquare,
} from "lucide-react";
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

interface TaskCardProps {
  task: Task;
  onClick?: () => void;
}

const priorityColors = {
  critical: "bg-red-500/10 text-red-600 border-red-200",
  high: "bg-orange-500/10 text-orange-600 border-orange-200",
  medium: "bg-yellow-500/10 text-yellow-600 border-yellow-200",
  low: "bg-slate-500/10 text-slate-600 border-slate-200",
};

const taskTypeIcons = {
  bug: Bug,
  feature: Lightbulb,
  improvement: Zap,
  task: CheckSquare,
  question: HelpCircle,
};

const taskTypeColors = {
  bug: "text-red-500",
  feature: "text-purple-500",
  improvement: "text-blue-500",
  task: "text-slate-500",
  question: "text-amber-500",
};

export function TaskCard({ task, onClick }: TaskCardProps) {
  const TypeIcon = taskTypeIcons[task.taskType];

  return (
    <Card
      className={cn(
        "cursor-pointer hover:border-emerald-400 hover:shadow-sm transition-all",
        "bg-white dark:bg-neutral-900"
      )}
      onClick={onClick}
    >
      <CardHeader className="p-3 pb-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <TypeIcon className={cn("h-4 w-4", taskTypeColors[task.taskType])} />
            <span className="text-xs font-mono text-muted-foreground">
              {task.displayId}
            </span>
          </div>
          <Badge
            variant="outline"
            className={cn("text-[10px] px-1.5 py-0", priorityColors[task.priority])}
          >
            {task.priority}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-2">
        <h4 className="text-sm font-medium leading-snug mb-2 line-clamp-2">
          {task.title}
        </h4>

        {/* Labels */}
        {task.labels.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {task.labels.slice(0, 3).map((label) => (
              <Badge
                key={label}
                variant="secondary"
                className="text-[10px] px-1.5 py-0"
              >
                {label}
              </Badge>
            ))}
            {task.labels.length > 3 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                +{task.labels.length - 3}
              </Badge>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-2 pt-2 border-t">
          <div className="flex items-center gap-2">
            {/* Source indicator */}
            {task.source.type === "slack" && task.source.slackChannelName && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                <MessageSquare className="h-3 w-3" />
                #{task.source.slackChannelName}
              </span>
            )}

            {/* Claude Code status */}
            {task.claudeCodeExecution && (
              <span
                className={cn("text-[10px] flex items-center gap-0.5", {
                  "text-yellow-500": task.claudeCodeExecution.status === "pending",
                  "text-blue-500": task.claudeCodeExecution.status === "running",
                  "text-green-500": task.claudeCodeExecution.status === "completed",
                  "text-red-500": task.claudeCodeExecution.status === "failed",
                })}
              >
                <GitPullRequest className="h-3 w-3" />
                {task.claudeCodeExecution.status}
              </span>
            )}
          </div>

          {/* Assignee */}
          {task.assignee && (
            <Avatar className="h-5 w-5">
              <AvatarImage src={task.assignee.avatarUrl} alt={task.assignee.name} />
              <AvatarFallback className="text-[10px]">
                {task.assignee.name[0]}
              </AvatarFallback>
            </Avatar>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
