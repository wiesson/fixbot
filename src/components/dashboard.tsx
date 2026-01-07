"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { LogOut, Plus, Settings } from "lucide-react";
import Link from "next/link";

interface Workspace {
  _id: string;
  name: string;
  slug: string;
  role: "admin" | "member" | "viewer";
}

interface User {
  _id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  githubUsername: string;
  workspaces?: Array<Workspace | null>;
}

interface DashboardProps {
  user: User;
}

export function Dashboard({ user }: DashboardProps) {
  const workspaces = (user.workspaces ?? []).filter(
    (ws): ws is Workspace => ws !== null
  );

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      {/* Header */}
      <header className="border-b bg-white dark:bg-neutral-900">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-emerald-600">Norbot</h1>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/settings"
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
            <form action="/api/auth/logout" method="POST" className="inline">
              <button
                type="submit"
                className={cn(
                  buttonVariants({ variant: "ghost", size: "icon" })
                )}
              >
                <LogOut className="h-5 w-5" />
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-2">
            Welcome back, {user.name}!
          </h2>
          <p className="text-muted-foreground">
            Select a workspace or create a new one to get started.
          </p>
        </div>

        {workspaces.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {workspaces.map((workspace) => (
              <Link key={workspace._id} href={`/w/${workspace.slug}`}>
                <Card className="hover:border-emerald-500 transition-colors cursor-pointer">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{workspace.name}</CardTitle>
                      <Badge variant="secondary">{workspace.role}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      /{workspace.slug}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}

            {/* Create New Workspace */}
            <Link href="/workspaces/new">
              <Card className="hover:border-emerald-500 transition-colors cursor-pointer border-dashed">
                <CardContent className="flex flex-col items-center justify-center h-full min-h-[140px] text-muted-foreground">
                  <Plus className="h-8 w-8 mb-2" />
                  <span className="text-sm font-medium">Create Workspace</span>
                </CardContent>
              </Card>
            </Link>
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <h3 className="text-lg font-semibold mb-2">No workspaces yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first workspace to start managing tasks with Norbot.
              </p>
              <Link href="/workspaces/new" className={cn(buttonVariants())}>
                <Plus className="size-4" />
                Create Workspace
              </Link>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
