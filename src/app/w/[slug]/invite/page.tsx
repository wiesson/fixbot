"use client";

import { use, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { ArrowLeft, UserPlus, Copy, Check, Clock, X, Github } from "lucide-react";
import type { Doc } from "@convex/_generated/dataModel";

interface InvitePageProps {
  params: Promise<{ slug: string }>;
}

type Role = "admin" | "member" | "viewer";

export default function InvitePage({ params }: InvitePageProps) {
  const { slug } = use(params);
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const router = useRouter();

  const [githubUsername, setGithubUsername] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<{
    type: "added_directly" | "invitation_created";
    token?: string;
  } | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Queries
  const workspace = useQuery(api.workspaces.getBySlug, { slug });
  const userMembership = useQuery(
    api.workspaces.getUserMembership,
    workspace && user ? { workspaceId: workspace._id, userId: user._id } : "skip"
  );
  const pendingInvitations = useQuery(
    api.invitations.getPendingForWorkspace,
    workspace ? { workspaceId: workspace._id } : "skip"
  );

  // Mutations
  const createInvitation = useMutation(api.invitations.create);
  const cancelInvitation = useMutation(api.invitations.cancel);

  const isAdmin = userMembership?.role === "admin";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspace || !user || !githubUsername.trim()) return;

    setIsSubmitting(true);
    setError(null);
    setLastResult(null);

    try {
      const result = await createInvitation({
        workspaceId: workspace._id,
        githubUsername: githubUsername.trim(),
        role,
        invitedById: user._id,
      });
      setLastResult(result);
      setGithubUsername("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invitation");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyLink = async (token: string) => {
    const inviteUrl = `${window.location.origin}/invite/${token}`;
    await navigator.clipboard.writeText(inviteUrl);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const handleCancelInvitation = async (invitationId: Doc<"workspaceInvitations">["_id"]) => {
    try {
      await cancelInvitation({ invitationId });
    } catch (err) {
      console.error("Failed to cancel invitation:", err);
    }
  };

  // Auth redirect
  if (!authLoading && !isAuthenticated) {
    router.push("/login");
    return null;
  }

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

  // Only admins can invite
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <Link
            href={`/w/${slug}/settings`}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mb-6")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Settings
          </Link>

          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground">
                Only workspace admins can invite new members.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Link
          href={`/w/${slug}/settings`}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mb-6")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Settings
        </Link>

        <h1 className="text-2xl font-bold mb-6">Invite Members</h1>

        {/* Invite Form */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Invite by GitHub Username</CardTitle>
            <CardDescription>
              Enter a GitHub username to invite them to {workspace.name}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex gap-3">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="github-username">GitHub Username</Label>
                  <div className="relative">
                    <Github className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="github-username"
                      value={githubUsername}
                      onChange={(e) => setGithubUsername(e.target.value)}
                      placeholder="username"
                      className="pl-9"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                    <SelectTrigger className="w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              {lastResult && (
                <div className="rounded-lg border p-4 bg-muted/50">
                  {lastResult.type === "added_directly" ? (
                    <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-2">
                      <Check className="h-4 w-4" />
                      User added to workspace!
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm flex items-center gap-2">
                        <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                        Invitation created! Share this link:
                      </p>
                      <div className="flex gap-2">
                        <Input
                          readOnly
                          value={`${window.location.origin}/invite/${lastResult.token}`}
                          className="text-sm font-mono"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => handleCopyLink(lastResult.token!)}
                        >
                          {copiedToken === lastResult.token ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <Button type="submit" disabled={isSubmitting || !githubUsername.trim()}>
                <UserPlus className="h-4 w-4 mr-2" />
                {isSubmitting ? "Inviting..." : "Send Invitation"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Pending Invitations */}
        <Card>
          <CardHeader>
            <CardTitle>Pending Invitations</CardTitle>
            <CardDescription>
              Invitations that haven&apos;t been accepted yet
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pendingInvitations && pendingInvitations.length > 0 ? (
              <div className="space-y-4">
                {pendingInvitations.map((invitation) => {
                  const isExpired = invitation.expiresAt < Date.now();
                  const daysLeft = Math.ceil(
                    (invitation.expiresAt - Date.now()) / (1000 * 60 * 60 * 24)
                  );

                  return (
                    <div
                      key={invitation._id}
                      className="flex items-center justify-between p-3 rounded-lg border"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage
                            src={`https://github.com/${invitation.githubUsername}.png`}
                            alt={invitation.githubUsername}
                          />
                          <AvatarFallback>
                            {invitation.githubUsername[0]?.toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium flex items-center gap-2">
                            <Github className="h-3 w-3" />
                            {invitation.githubUsername}
                          </p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {isExpired ? (
                              <span className="text-destructive">Expired</span>
                            ) : (
                              <span>Expires in {daysLeft} day{daysLeft !== 1 ? "s" : ""}</span>
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="capitalize">
                          {invitation.role}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleCopyLink(invitation.token)}
                        >
                          {copiedToken === invitation.token ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleCancelInvitation(invitation._id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-center py-8 text-muted-foreground">
                No pending invitations
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
