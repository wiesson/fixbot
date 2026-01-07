"use client";

import { Lock, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Repo {
  githubId: number;
  githubNodeId: string;
  name: string;
  fullName: string;
  cloneUrl: string;
  defaultBranch: string;
  isPrivate: boolean;
  description: string | null;
}

interface RepoSelectorProps {
  repos: Repo[];
  selectedIds: Set<number>;
  onToggle: (id: number) => void;
  alreadyConnectedIds?: Set<number>;
  isLoading?: boolean;
}

export function RepoSelector({
  repos,
  selectedIds,
  onToggle,
  alreadyConnectedIds,
  isLoading,
}: RepoSelectorProps) {
  if (isLoading) {
    return (
      <div className="py-8 text-center">
        <div className="animate-pulse text-muted-foreground">Loading repositories...</div>
      </div>
    );
  }

  if (repos.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No repositories found.</p>
        <p className="text-sm mt-2">
          Make sure your GitHub account has access to repositories.
        </p>
      </div>
    );
  }

  return (
    <div className="max-h-64 overflow-y-auto space-y-2">
      {repos.map((repo) => {
        const isConnected = alreadyConnectedIds?.has(repo.githubId);
        const isSelected = selectedIds.has(repo.githubId);

        return (
          <button
            key={repo.githubId}
            type="button"
            onClick={() => !isConnected && onToggle(repo.githubId)}
            disabled={isConnected}
            className={cn(
              "w-full flex items-center justify-between p-3 rounded-lg border transition-colors text-left",
              isConnected
                ? "border-border bg-muted/30 opacity-60 cursor-not-allowed"
                : isSelected
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted/50"
            )}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={cn(
                  "w-5 h-5 rounded border-2 flex items-center justify-center shrink-0",
                  isConnected
                    ? "border-primary bg-primary text-primary-foreground"
                    : isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground/30"
                )}
              >
                {(isSelected || isConnected) && (
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 12 12">
                    <path d="M10.28 2.28L3.989 8.575 1.695 6.28A1 1 0 00.28 7.695l3 3a1 1 0 001.414 0l7-7A1 1 0 0010.28 2.28z" />
                  </svg>
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium truncate">{repo.fullName}</span>
                  {isConnected && (
                    <span className="text-xs text-muted-foreground">(connected)</span>
                  )}
                </div>
                {repo.description && (
                  <p className="text-sm text-muted-foreground truncate">{repo.description}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 text-sm text-muted-foreground shrink-0 ml-2">
              {repo.isPrivate ? (
                <Lock className="w-3.5 h-3.5" />
              ) : (
                <Globe className="w-3.5 h-3.5" />
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
