"use client";

import { use, useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Github, Check, Clock, AlertCircle } from "lucide-react";

interface AcceptInvitationPageProps {
  params: Promise<{ token: string }>;
}

export default function AcceptInvitationPage({ params }: AcceptInvitationPageProps) {
  const { token } = use(params);
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const router = useRouter();

  const [isAccepting, setIsAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  // Query invitation details
  const invitation = useQuery(api.invitations.getByToken, { token });

  // Mutation to accept
  const acceptInvitation = useMutation(api.invitations.accept);

  // Store token for post-login acceptance
  useEffect(() => {
    if (token && !authLoading && !isAuthenticated) {
      sessionStorage.setItem("pendingInviteToken", token);
    }
  }, [token, authLoading, isAuthenticated]);

  // Auto-accept if logged in and username matches
  useEffect(() => {
    if (
      user &&
      invitation &&
      invitation.status === "pending" &&
      user.githubUsername.toLowerCase() === invitation.githubUsername.toLowerCase() &&
      !accepted &&
      !isAccepting &&
      !error
    ) {
      handleAccept();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, invitation, accepted]);

  const handleAccept = async () => {
    if (!user || !invitation) return;

    setIsAccepting(true);
    setError(null);

    try {
      const result = await acceptInvitation({
        token,
        userId: user._id,
      });
      setAccepted(true);
      // Clear stored token
      sessionStorage.removeItem("pendingInviteToken");
      // Redirect to workspace after a brief delay
      setTimeout(() => {
        if (invitation.workspace) {
          router.push(`/w/${invitation.workspace.slug}`);
        } else {
          router.push("/");
        }
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept invitation");
    } finally {
      setIsAccepting(false);
    }
  };

  const handleLogin = () => {
    // Token is already stored in sessionStorage, redirect to login
    router.push("/login");
  };

  // Loading state
  if (authLoading || invitation === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950">
        <div className="animate-pulse text-muted-foreground">Loading invitation...</div>
      </div>
    );
  }

  // Invitation not found
  if (invitation === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="py-8 text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">Invitation Not Found</h2>
            <p className="text-muted-foreground mb-4">
              This invitation link is invalid or has been cancelled.
            </p>
            <Button onClick={() => router.push("/")}>Go to Home</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Check expiration
  const isExpired = invitation.expiresAt < Date.now();
  const isAlreadyAccepted = invitation.status === "accepted";
  const isCancelled = invitation.status === "cancelled";

  // Wrong user
  const isWrongUser =
    user && user.githubUsername.toLowerCase() !== invitation.githubUsername.toLowerCase();

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950 px-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <CardTitle>Workspace Invitation</CardTitle>
          <CardDescription>
            You&apos;ve been invited to join a workspace
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Workspace Info */}
          {invitation.workspace && (
            <div className="text-center p-4 rounded-lg bg-muted/50">
              <h3 className="text-lg font-semibold">{invitation.workspace.name}</h3>
              <Badge variant="secondary" className="mt-2 capitalize">
                {invitation.role}
              </Badge>
            </div>
          )}

          {/* Invited By */}
          {invitation.invitedBy && (
            <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
              <Avatar className="h-6 w-6">
                <AvatarImage
                  src={invitation.invitedBy.avatarUrl ?? undefined}
                  alt={invitation.invitedBy.name}
                />
                <AvatarFallback>{invitation.invitedBy.name[0]}</AvatarFallback>
              </Avatar>
              <span>Invited by {invitation.invitedBy.name}</span>
            </div>
          )}

          {/* Invited GitHub User */}
          <div className="flex items-center justify-center gap-2 text-sm">
            <Github className="h-4 w-4" />
            <span>For: <strong>{invitation.githubUsername}</strong></span>
          </div>

          {/* Status Messages */}
          {accepted && (
            <div className="text-center p-4 rounded-lg bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300">
              <Check className="h-8 w-8 mx-auto mb-2" />
              <p className="font-medium">Welcome to {invitation.workspace?.name}!</p>
              <p className="text-sm mt-1">Redirecting you now...</p>
            </div>
          )}

          {error && (
            <div className="text-center p-4 rounded-lg bg-destructive/10 text-destructive">
              <AlertCircle className="h-6 w-6 mx-auto mb-2" />
              <p>{error}</p>
            </div>
          )}

          {isExpired && !accepted && (
            <div className="text-center p-4 rounded-lg bg-muted text-muted-foreground">
              <Clock className="h-6 w-6 mx-auto mb-2" />
              <p>This invitation has expired.</p>
              <p className="text-sm mt-1">Please ask for a new invitation.</p>
            </div>
          )}

          {isAlreadyAccepted && !accepted && (
            <div className="text-center p-4 rounded-lg bg-muted text-muted-foreground">
              <Check className="h-6 w-6 mx-auto mb-2" />
              <p>This invitation has already been accepted.</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() =>
                  invitation.workspace
                    ? router.push(`/w/${invitation.workspace.slug}`)
                    : router.push("/")
                }
              >
                Go to Workspace
              </Button>
            </div>
          )}

          {isCancelled && (
            <div className="text-center p-4 rounded-lg bg-muted text-muted-foreground">
              <AlertCircle className="h-6 w-6 mx-auto mb-2" />
              <p>This invitation has been cancelled.</p>
            </div>
          )}

          {isWrongUser && !accepted && (
            <div className="text-center p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300">
              <AlertCircle className="h-6 w-6 mx-auto mb-2" />
              <p>This invitation was sent to <strong>{invitation.githubUsername}</strong>.</p>
              <p className="text-sm mt-1">
                You&apos;re logged in as <strong>{user?.githubUsername}</strong>.
              </p>
              <p className="text-sm mt-2">
                Please log out and sign in with the correct GitHub account.
              </p>
            </div>
          )}

          {/* Actions */}
          {!accepted && !isExpired && !isAlreadyAccepted && !isCancelled && !isWrongUser && (
            <div className="space-y-3">
              {isAuthenticated && user ? (
                <Button
                  className="w-full"
                  onClick={handleAccept}
                  disabled={isAccepting}
                >
                  {isAccepting ? "Joining..." : "Accept Invitation"}
                </Button>
              ) : (
                <Button className="w-full" onClick={handleLogin}>
                  <Github className="h-4 w-4 mr-2" />
                  Sign in with GitHub to Join
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
