"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderGit2 } from "lucide-react";
import { useState } from "react";
import { RepoSelector, type Repo } from "@/components/repo-selector";

export type { Repo };

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
          Select GitHub repositories to link with Norbot for code context
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <RepoSelector
          repos={repos}
          selectedIds={selected}
          onToggle={toggleRepo}
        />

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
