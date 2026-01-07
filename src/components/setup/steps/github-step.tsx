"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Github } from "lucide-react";
import { useEffect } from "react";

interface GitHubStepProps {
  githubUsername: string;
  onComplete: () => void;
}

export function GitHubStep({ githubUsername, onComplete }: GitHubStepProps) {
  // Auto-advance after showing completion
  useEffect(() => {
    const timer = setTimeout(onComplete, 1000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
          <div className="relative">
            <Github className="h-8 w-8 text-green-500" />
            <Check className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-green-500 text-white p-0.5" />
          </div>
        </div>
        <CardTitle>GitHub Connected</CardTitle>
        <CardDescription>
          Signed in as <span className="font-medium text-foreground">@{githubUsername}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="text-center">
        <p className="text-sm text-muted-foreground">Continuing to next step...</p>
      </CardContent>
    </Card>
  );
}
