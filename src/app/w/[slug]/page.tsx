"use client";

import { use } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { KanbanBoard } from "@/components/kanban/kanban-board";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  Settings,
  LogOut,
  ChevronLeft,
  GitBranch,
  Slack,
} from "lucide-react";
import Link from "next/link";
import type { Id } from "@convex/_generated/dataModel";

interface WorkspacePageProps {
  params: Promise<{ slug: string }>;
}

export default function WorkspacePage({ params }: WorkspacePageProps) {
  const { slug } = use(params);
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const router = useRouter();
  const [selectedRepoId, setSelectedRepoId] = useState<string>("all");

  const workspace = useQuery(api.workspaces.getBySlug, { slug });
  const repositories = useQuery(
    api.repositories.list,
    workspace ? { workspaceId: workspace._id } : "skip"
  );

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [authLoading, isAuthenticated, router]);

  if (authLoading || !workspace) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      {/* Header */}
      <header className="border-b bg-white dark:bg-neutral-900 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon" }),
                "mr-2"
              )}
            >
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-lg font-bold flex items-center gap-2">
                {workspace.name}
                <Badge variant="secondary" className="text-xs font-normal">
                  <Slack className="h-3 w-3 mr-1" />
                  {workspace.slackTeamName}
                </Badge>
              </h1>
              <p className="text-xs text-muted-foreground">/{workspace.slug}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Repository Filter */}
            {repositories && repositories.length > 0 && (
              <Select
                value={selectedRepoId}
                onValueChange={(value) => {
                  if (value) {
                    setSelectedRepoId(value);
                  }
                }}
              >
                <SelectTrigger className="w-[200px]">
                  <GitBranch className="h-4 w-4 mr-2 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All repositories</SelectItem>
                  {repositories.map((repo) => (
                    <SelectItem key={repo._id} value={repo._id}>
                      {repo.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Link
              href={`/w/${slug}/settings`}
              className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
            >
              <Settings className="h-5 w-5" />
            </Link>
            <div className="flex items-center gap-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user.avatarUrl} alt={user.name} />
                <AvatarFallback>{user.name[0]}</AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium hidden sm:inline">
                {user.name}
              </span>
            </div>
            <Link
              href="/api/auth/logout"
              className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
            >
              <LogOut className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <KanbanBoard
          workspaceId={workspace._id}
          repositoryId={selectedRepoId === "all" ? undefined : selectedRepoId as Id<"repositories">}
        />
      </main>
    </div>
  );
}
