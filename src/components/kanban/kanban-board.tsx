"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { KanbanColumn } from "./kanban-column";
import type { Id } from "@convex/_generated/dataModel";
import { useState } from "react";
import { TaskDetailModal } from "./task-detail-modal";

interface KanbanBoardProps {
  workspaceId: Id<"workspaces">;
  repositoryId?: Id<"repositories">;
}

const columns = [
  { key: "backlog", title: "Backlog", color: "slate" },
  { key: "todo", title: "To Do", color: "blue" },
  { key: "in_progress", title: "In Progress", color: "amber" },
  { key: "in_review", title: "In Review", color: "purple" },
  { key: "done", title: "Done", color: "emerald" },
] as const;

type ColumnKey = (typeof columns)[number]["key"];

export function KanbanBoard({ workspaceId, repositoryId }: KanbanBoardProps) {
  const [selectedTaskId, setSelectedTaskId] = useState<Id<"tasks"> | null>(null);

  const kanbanData = useQuery(api.tasks.getKanban, {
    workspaceId,
    repositoryId,
  });

  const updateStatus = useMutation(api.tasks.updateStatus);

  if (!kanbanData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-muted-foreground">
          Loading tasks...
        </div>
      </div>
    );
  }

  const handleTaskClick = (taskId: Id<"tasks">) => {
    setSelectedTaskId(taskId);
  };

  const handleCloseModal = () => {
    setSelectedTaskId(null);
  };

  return (
    <>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((column) => (
          <KanbanColumn
            key={column.key}
            title={column.title}
            status={column.key}
            color={column.color}
            tasks={kanbanData.columns[column.key] || []}
            onTaskClick={handleTaskClick}
          />
        ))}
      </div>

      {/* Stats Bar */}
      <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
        <span>Total: {kanbanData.stats.total}</span>
        <span className="text-red-500">
          Critical: {kanbanData.stats.byPriority.critical}
        </span>
        <span className="text-orange-500">
          High: {kanbanData.stats.byPriority.high}
        </span>
        <span className="text-yellow-500">
          Medium: {kanbanData.stats.byPriority.medium}
        </span>
        <span className="text-slate-500">
          Low: {kanbanData.stats.byPriority.low}
        </span>
      </div>

      {/* Task Detail Modal */}
      {selectedTaskId && (
        <TaskDetailModal
          taskId={selectedTaskId}
          onClose={handleCloseModal}
        />
      )}
    </>
  );
}
