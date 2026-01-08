"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useAction, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { StepIndicator, Step } from "./step-indicator";
import { GitHubStep } from "./steps/github-step";
import { SlackStep } from "./steps/slack-step";
import { ChannelsStep } from "./steps/channels-step";
import { ReposStep } from "./steps/repos-step";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

interface User {
  _id: Id<"users">;
  githubUsername: string;
  onboarding?: {
    completedAt?: number;
    skippedSteps: string[];
    currentStep?: string;
  };
  workspaces?: Array<{
    _id: Id<"workspaces">;
    name: string;
    slackTeamId: string;
  } | null>;
}

interface Channel {
  id: string;
  name: string;
  isPrivate: boolean;
  numMembers: number;
}

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

interface SetupWizardProps {
  user: User;
}

export function SetupWizard({ user }: SetupWizardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get step from URL or default to github
  const urlStep = searchParams.get("step") as Step | null;
  const slackConnected = searchParams.get("slack") === "connected";

  const [currentStep, setCurrentStep] = useState<Step>(urlStep || "github");
  const [completedSteps, setCompletedSteps] = useState<Step[]>([]);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);

  // Get workspace ID (from user's workspaces after Slack connect)
  const workspace = user.workspaces?.find((w) => w !== null);
  const workspaceId = workspace?._id;

  // Realtime channel mappings from Convex (updates when bot is invited to channels)
  const channelMappings = useQuery(
    api.channelMappings.list,
    workspaceId ? { workspaceId } : "skip"
  );

  // Transform channel mappings to Channel interface for ChannelsStep
  const channels: Channel[] = (channelMappings ?? []).map((mapping) => ({
    id: mapping.slackChannelId,
    name: mapping.slackChannelName,
    isPrivate: false, // We don't store this currently
    numMembers: 0, // We don't store this currently
  }));
  const isLoadingChannels = channelMappings === undefined && workspaceId !== undefined;

  // Mutations and actions
  const updateOnboarding = useMutation(api.users.updateOnboarding);
  const completeOnboarding = useMutation(api.users.completeOnboarding);
  const listUserRepos = useAction(api.github.listUserRepos);
  const connectRepos = useMutation(api.github.connectRepos);

  // Handle Slack OAuth return
  useEffect(() => {
    if (slackConnected && currentStep === "channels") {
      setCompletedSteps((prev) => {
        const newSet = new Set<Step>([...prev, "github", "slack"]);
        return Array.from(newSet);
      });
    }
  }, [slackConnected, currentStep]);

  // Fetch repos when entering repos step
  useEffect(() => {
    if (currentStep === "repos" && !repos.length) {
      setIsLoadingRepos(true);
      listUserRepos({ userId: user._id })
        .then((fetchedRepos) => {
          setRepos(fetchedRepos);
        })
        .catch((error) => {
          console.error("Error fetching repos:", error);
        })
        .finally(() => {
          setIsLoadingRepos(false);
        });
    }
  }, [currentStep, user._id, listUserRepos, repos.length]);

  const goToStep = useCallback(
    (step: Step) => {
      setCurrentStep(step);
      router.push(`/setup?step=${step}`, { scroll: false });
    },
    [router]
  );

  const markStepComplete = useCallback((step: Step) => {
    setCompletedSteps((prev) => [...new Set([...prev, step])]);
  }, []);

  const handleGitHubComplete = useCallback(() => {
    markStepComplete("github");
    goToStep("slack");
  }, [markStepComplete, goToStep]);

  const handleSlackSkip = useCallback(async () => {
    await updateOnboarding({
      userId: user._id,
      onboarding: {
        skippedSteps: [...(user.onboarding?.skippedSteps || []), "slack"],
        currentStep: "repos",
      },
    });
    markStepComplete("slack");
    goToStep("repos");
  }, [updateOnboarding, user._id, user.onboarding?.skippedSteps, markStepComplete, goToStep]);

  const handleChannelsComplete = useCallback(
    async (selectedChannels: string[]) => {
      // In a real implementation, we'd save channel mappings here
      console.log("Selected channels:", selectedChannels);
      markStepComplete("channels");
      goToStep("repos");
    },
    [markStepComplete, goToStep]
  );

  const handleChannelsSkip = useCallback(async () => {
    await updateOnboarding({
      userId: user._id,
      onboarding: {
        skippedSteps: [...(user.onboarding?.skippedSteps || []), "channels"],
        currentStep: "repos",
      },
    });
    markStepComplete("channels");
    goToStep("repos");
  }, [updateOnboarding, user._id, user.onboarding?.skippedSteps, markStepComplete, goToStep]);

  const handleReposComplete = useCallback(
    async (selectedRepos: Repo[]) => {
      if (selectedRepos.length > 0 && workspaceId) {
        await connectRepos({
          workspaceId,
          repos: selectedRepos.map((r) => ({
            githubId: r.githubId,
            githubNodeId: r.githubNodeId,
            name: r.name,
            fullName: r.fullName,
            cloneUrl: r.cloneUrl,
            defaultBranch: r.defaultBranch,
          })),
        });
      }
      markStepComplete("repos");
      await completeOnboarding({ userId: user._id });
      goToStep("complete");
    },
    [workspaceId, connectRepos, markStepComplete, completeOnboarding, user._id, goToStep]
  );

  const handleReposSkip = useCallback(async () => {
    await completeOnboarding({ userId: user._id });
    goToStep("complete");
  }, [completeOnboarding, user._id, goToStep]);

  const handleGoToDashboard = useCallback(() => {
    router.push("/");
  }, [router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-linear-to-br from-neutral-50 to-neutral-100 dark:from-neutral-950 dark:to-neutral-900 p-4">
      {currentStep !== "complete" && (
        <StepIndicator currentStep={currentStep} completedSteps={completedSteps} />
      )}

      {currentStep === "github" && (
        <GitHubStep githubUsername={user.githubUsername} onComplete={handleGitHubComplete} />
      )}

      {currentStep === "slack" && <SlackStep userId={user._id} onSkip={handleSlackSkip} />}

      {currentStep === "channels" && (
        <ChannelsStep
          channels={channels}
          isLoading={isLoadingChannels}
          onComplete={handleChannelsComplete}
          onSkip={handleChannelsSkip}
        />
      )}

      {currentStep === "repos" && (
        <ReposStep
          repos={repos}
          isLoading={isLoadingRepos}
          onComplete={handleReposComplete}
          onSkip={handleReposSkip}
        />
      )}

      {currentStep === "complete" && (
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500">
              <Check className="h-8 w-8 text-white" />
            </div>
            <CardTitle>Setup Complete!</CardTitle>
            <CardDescription>
              Norbot is ready to help you manage tasks from Slack
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button size="lg" className="w-full" onClick={handleGoToDashboard}>
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
