"use client";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Github } from "lucide-react";
import Link from "next/link";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-neutral-50 to-neutral-100 dark:from-neutral-950 dark:to-neutral-900">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Fixbot</CardTitle>
          <CardDescription>
            AI-powered task management with Claude Code integration
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Link
            href="/api/auth/github"
            className={cn(buttonVariants({ size: "lg" }), "w-full")}
          >
            <Github className="mr-2 h-5 w-5" />
            Continue with GitHub
          </Link>
          <p className="text-xs text-center text-muted-foreground">
            By continuing, you agree to our Terms of Service and Privacy Policy
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
