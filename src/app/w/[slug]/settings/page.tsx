"use client";

import { use, useEffect, useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { ArrowLeft, Slack, Trash2, UserMinus, Lock, Globe, Plus, FolderGit2 } from "lucide-react";
import type { Id } from "@convex/_generated/dataModel";
import { RepoSelector, type Repo } from "@/components/repo-selector";

interface WorkspaceSettingsPageProps {
  params: Promise<{ slug: string }>;
}

type Priority = "critical" | "high" | "medium" | "low";
type Role = "admin" | "member" | "viewer";

export default function WorkspaceSettingsPage({ params }: WorkspaceSettingsPageProps) {
  const { slug } = use(params);
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const router = useRouter();

  // Form state
  const [workspaceName, setWorkspaceName] = useState("");
  const [aiExtractionEnabled, setAiExtractionEnabled] = useState(true);
  const [defaultPriority, setDefaultPriority] = useState<Priority | "">("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Repository state
  const [addRepoDialogOpen, setAddRepoDialogOpen] = useState(false);
  const [availableRepos, setAvailableRepos] = useState<Repo[]>([]);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  const [selectedRepoIds, setSelectedRepoIds] = useState<Set<number>>(new Set());

  // Queries
  const workspace = useQuery(api.workspaces.getBySlug, { slug });
  const members = useQuery(
    api.workspaces.getMembers,
    workspace ? { workspaceId: workspace._id } : "skip"
  );
  const userMembership = useQuery(
    api.workspaces.getUserMembership,
    workspace && user ? { workspaceId: workspace._id, userId: user._id } : "skip"
  );
  const repositories = useQuery(
    api.repositories.list,
    workspace ? { workspaceId: workspace._id } : "skip"
  );

  // Mutations
  const updateWorkspace = useMutation(api.workspaces.update);
  const updateMemberRole = useMutation(api.workspaces.updateMemberRole);
  const removeMember = useMutation(api.workspaces.removeMember);
  const deleteWorkspace = useMutation(api.workspaces.deleteWorkspace);
  const updateRepository = useMutation(api.repositories.update);
  const removeRepository = useMutation(api.repositories.remove);
  const connectRepos = useMutation(api.github.connectRepos);

  // Actions
  const listUserRepos = useAction(api.github.listUserRepos);

  // Derived state
  const isAdmin = userMembership?.role === "admin";
  const validMembers = members?.filter((m): m is NonNullable<typeof m> => m !== null) ?? [];
  const adminCount = validMembers.filter((m) => m.role === "admin").length;

  // Sync form state with workspace data
  useEffect(() => {
    if (workspace) {
      setWorkspaceName(workspace.name);
      setAiExtractionEnabled(workspace.settings?.aiExtractionEnabled ?? true);
      setDefaultPriority(workspace.settings?.defaultTaskPriority ?? "");
    }
  }, [workspace]);

  // Auth redirect
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [authLoading, isAuthenticated, router]);

  // Handlers
  const handleNameBlur = async () => {
    if (workspace && workspaceName !== workspace.name && workspaceName.trim()) {
      await updateWorkspace({
        id: workspace._id,
        name: workspaceName.trim(),
      });
    }
  };

  const handleAiExtractionChange = async (checked: boolean) => {
    setAiExtractionEnabled(checked);
    if (workspace) {
      await updateWorkspace({
        id: workspace._id,
        settings: {
          aiExtractionEnabled: checked,
          defaultTaskPriority: defaultPriority || undefined,
        },
      });
    }
  };

  const handlePriorityChange = async (value: string | null) => {
    if (value === null) return;
    const priority = value as Priority | "";
    setDefaultPriority(priority);
    if (workspace) {
      await updateWorkspace({
        id: workspace._id,
        settings: {
          aiExtractionEnabled,
          defaultTaskPriority: priority || undefined,
        },
      });
    }
  };

  const handleRoleChange = async (userId: Id<"users">, role: Role) => {
    if (workspace) {
      await updateMemberRole({
        workspaceId: workspace._id,
        userId,
        role,
      });
    }
  };

  const handleRemoveMember = async (userId: Id<"users">) => {
    if (workspace) {
      await removeMember({
        workspaceId: workspace._id,
        userId,
      });
    }
  };

  const handleDeleteWorkspace = async () => {
    if (workspace) {
      await deleteWorkspace({ id: workspace._id });
      router.push("/");
    }
  };

  // Repository handlers
  const handleOpenAddRepoDialog = async () => {
    if (!user) return;
    setAddRepoDialogOpen(true);
    setIsLoadingRepos(true);
    setSelectedRepoIds(new Set());
    try {
      const repos = await listUserRepos({ userId: user._id });
      setAvailableRepos(repos);
    } catch (error) {
      console.error("Error fetching repos:", error);
      setAvailableRepos([]);
    } finally {
      setIsLoadingRepos(false);
    }
  };

  const handleToggleRepo = (id: number) => {
    const newSelected = new Set(selectedRepoIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedRepoIds(newSelected);
  };

  const handleConnectRepos = async () => {
    if (!workspace) return;
    const selectedRepos = availableRepos
      .filter((r) => selectedRepoIds.has(r.githubId))
      .map((r) => ({
        githubId: r.githubId,
        githubNodeId: r.githubNodeId,
        name: r.name,
        fullName: r.fullName,
        cloneUrl: r.cloneUrl,
        defaultBranch: r.defaultBranch,
      }));
    if (selectedRepos.length > 0) {
      await connectRepos({ workspaceId: workspace._id, repos: selectedRepos });
    }
    setAddRepoDialogOpen(false);
    setSelectedRepoIds(new Set());
  };

  const handleUpdateRepoSettings = async (
    repoId: Id<"repositories">,
    settings: {
      claudeCodeEnabled: boolean;
      autoCreateBranches: boolean;
      branchPrefix?: string;
    }
  ) => {
    await updateRepository({ id: repoId, settings });
  };

  const handleRemoveRepository = async (repoId: Id<"repositories">) => {
    await removeRepository({ id: repoId });
  };

  // Loading state
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
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Link
          href={`/w/${slug}`}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mb-6")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Workspace
        </Link>

        <h1 className="text-2xl font-bold mb-6">Workspace Settings</h1>

        {/* General Section */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>General</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="workspace-name">Workspace Name</Label>
              <Input
                id="workspace-name"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                onBlur={handleNameBlur}
                placeholder="Workspace name"
              />
            </div>

            <div className="space-y-2">
              <Label>Slack Team</Label>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  <Slack className="h-3 w-3 mr-1" />
                  {workspace.slackTeamName}
                </Badge>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Created</Label>
              <p className="text-sm text-muted-foreground">
                {new Date(workspace.createdAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Settings Section */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>AI Extraction</Label>
                <p className="text-sm text-muted-foreground">
                  Automatically extract task details from Slack messages
                </p>
              </div>
              <Switch
                checked={aiExtractionEnabled}
                onCheckedChange={handleAiExtractionChange}
              />
            </div>

            <div className="space-y-2">
              <Label>Default Task Priority</Label>
              <Select
                value={defaultPriority || null}
                onValueChange={handlePriorityChange}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue>
                    {defaultPriority
                      ? defaultPriority.charAt(0).toUpperCase() + defaultPriority.slice(1)
                      : "Select priority"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Members Section */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Members</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {validMembers.map((member) => {
                const isCurrentUser = member.userId === user._id;
                const isLastAdmin = member.role === "admin" && adminCount === 1;
                const canChangeRole = isAdmin && !isCurrentUser && !isLastAdmin;
                const canRemove = isAdmin && !isCurrentUser && !isLastAdmin;

                return (
                  <div
                    key={member.membershipId}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={member.avatarUrl ?? undefined} alt={member.name} />
                        <AvatarFallback>{member.name?.[0] ?? "?"}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">
                          {member.name}
                          {isCurrentUser && (
                            <span className="text-muted-foreground ml-1">(you)</span>
                          )}
                        </p>
                        <p className="text-sm text-muted-foreground">{member.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {canChangeRole ? (
                        <Select
                          value={member.role}
                          onValueChange={(value) => {
                            if (value) handleRoleChange(member.userId, value as Role);
                          }}
                        >
                          <SelectTrigger className="w-[120px]" size="sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="member">Member</SelectItem>
                            <SelectItem value="viewer">Viewer</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="secondary" className="capitalize">
                          {member.role}
                        </Badge>
                      )}

                      {canRemove && (
                        <AlertDialog>
                          <AlertDialogTrigger
                            render={<Button variant="ghost" size="icon-sm" />}
                          >
                            <UserMinus className="h-4 w-4" />
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove member?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to remove {member.name} from this
                                workspace? They will lose access to all tasks and data.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleRemoveMember(member.userId)}
                              >
                                Remove
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Repositories Section */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Repositories</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {repositories && repositories.length > 0 ? (
              <div className="space-y-4">
                {repositories.map((repo) => (
                  <div
                    key={repo._id}
                    className="flex flex-col gap-4 p-4 rounded-lg border border-border"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FolderGit2 className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{repo.fullName}</span>
                        {repo.githubId && (
                          <span className="text-muted-foreground">
                            {/* Repos from settings don't have isPrivate, check via GitHub metadata */}
                          </span>
                        )}
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger
                          render={<Button variant="ghost" size="icon-sm" />}
                        >
                          <Trash2 className="h-4 w-4" />
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove repository?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to remove {repo.fullName} from this
                              workspace? This will not delete the repository from GitHub.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleRemoveRepository(repo._id)}
                            >
                              Remove
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Claude Code enabled</Label>
                        <Switch
                          checked={repo.settings?.claudeCodeEnabled ?? true}
                          onCheckedChange={(checked) =>
                            handleUpdateRepoSettings(repo._id, {
                              claudeCodeEnabled: checked,
                              autoCreateBranches: repo.settings?.autoCreateBranches ?? true,
                              branchPrefix: repo.settings?.branchPrefix,
                            })
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Auto-create branches</Label>
                        <Switch
                          checked={repo.settings?.autoCreateBranches ?? true}
                          onCheckedChange={(checked) =>
                            handleUpdateRepoSettings(repo._id, {
                              claudeCodeEnabled: repo.settings?.claudeCodeEnabled ?? true,
                              autoCreateBranches: checked,
                              branchPrefix: repo.settings?.branchPrefix,
                            })
                          }
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm">Branch prefix</Label>
                      <Input
                        placeholder="e.g., feature/"
                        value={repo.settings?.branchPrefix ?? ""}
                        onChange={(e) =>
                          handleUpdateRepoSettings(repo._id, {
                            claudeCodeEnabled: repo.settings?.claudeCodeEnabled ?? true,
                            autoCreateBranches: repo.settings?.autoCreateBranches ?? true,
                            branchPrefix: e.target.value || undefined,
                          })
                        }
                        className="max-w-[200px]"
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <FolderGit2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No repositories connected</p>
                <p className="text-sm">Connect a GitHub repository to get started</p>
              </div>
            )}

            <Dialog open={addRepoDialogOpen} onOpenChange={setAddRepoDialogOpen}>
              <DialogTrigger
                render={<Button variant="outline" onClick={handleOpenAddRepoDialog} />}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Repository
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Repository</DialogTitle>
                  <DialogDescription>
                    Select GitHub repositories to connect to this workspace
                  </DialogDescription>
                </DialogHeader>
                <RepoSelector
                  repos={availableRepos}
                  selectedIds={selectedRepoIds}
                  onToggle={handleToggleRepo}
                  alreadyConnectedIds={
                    new Set(repositories?.map((r) => r.githubId) ?? [])
                  }
                  isLoading={isLoadingRepos}
                />
                <DialogFooter>
                  <Button
                    onClick={handleConnectRepos}
                    disabled={selectedRepoIds.size === 0}
                  >
                    {selectedRepoIds.size > 0
                      ? `Connect (${selectedRepoIds.size})`
                      : "Connect"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        {/* Danger Zone */}
        {isAdmin && (
          <Card className="border-destructive/50">
            <CardHeader>
              <CardTitle className="text-destructive">Danger Zone</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Delete Workspace</p>
                  <p className="text-sm text-muted-foreground">
                    Permanently delete this workspace and all its data
                  </p>
                </div>
                <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                  <AlertDialogTrigger render={<Button variant="destructive" />}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete "{workspace.name}"?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete this workspace, including all tasks,
                        repositories, and channel mappings. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDeleteWorkspace}
                        className={buttonVariants({ variant: "destructive" })}
                      >
                        Delete Workspace
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
