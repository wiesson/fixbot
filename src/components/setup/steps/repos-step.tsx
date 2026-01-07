"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderGit2, Lock, Globe } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface Repo {
  githubId: number;
  githubNodeId: string;
  name: string;
  fullName: string;
  cloneUrl: string;
  defaultBranch: string;
  isPrivate: boolean;
  description: string | null;
}

interface ReposStepProps {
  repos: Repo[];
  isLoading: boolean;
  onComplete: (selectedRepos: Repo[]) => void;
  onSkip: () => void;
}

export function ReposStep({ repos, isLoading, onComplete, onSkip }: ReposStepProps) {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const toggleRepo = (id: number) => {
    const newSelected = new Set(selected);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelected(newSelected);
  };

  const handleComplete = () => {
    const selectedRepos = repos.filter((r) => selected.has(r.githubId));
    onComplete(selectedRepos);
  };

  if (isLoading) {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="py-12 text-center">
          <div className="animate-pulse text-muted-foreground">Loading repositories...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-lg">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <FolderGit2 className="h-8 w-8 text-primary" />
        </div>
        <CardTitle>Connect Repositories</CardTitle>
        <CardDescription>
          Select GitHub repositories to link with Herbot for code context
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {repos.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No repositories found.</p>
            <p className="text-sm mt-2">
              Make sure your GitHub account has access to repositories.
            </p>
          </div>
        ) : (
          <div className="max-h-64 overflow-y-auto space-y-2">
            {repos.map((repo) => (
              <button
                key={repo.githubId}
                type="button"
                onClick={() => toggleRepo(repo.githubId)}
                className={cn(
                  "w-full flex items-center justify-between p-3 rounded-lg border transition-colors text-left",
                  selected.has(repo.githubId)
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/50"
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={cn(
                      "w-5 h-5 rounded border-2 flex items-center justify-center shrink-0",
                      selected.has(repo.githubId)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/30"
                    )}
                  >
                    {selected.has(repo.githubId) && (
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 12 12">
                        <path d="M10.28 2.28L3.989 8.575 1.695 6.28A1 1 0 00.28 7.695l3 3a1 1 0 001.414 0l7-7A1 1 0 0010.28 2.28z" />
                      </svg>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium truncate">{repo.fullName}</span>
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
            ))}
          </div>
        )}

        <div className="flex gap-3 pt-4">
          <Button variant="outline" className="flex-1" onClick={onSkip}>
            Skip
          </Button>
          <Button className="flex-1" onClick={handleComplete}>
            {selected.size > 0 ? `Complete Setup (${selected.size})` : "Complete Setup"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
