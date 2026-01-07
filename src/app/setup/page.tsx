"use client";

import { useAuth } from "@/hooks/use-auth";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { SetupWizard } from "@/components/setup/setup-wizard";

function SetupPageContent() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  // If onboarding already complete and no step param, redirect to dashboard
  useEffect(() => {
    if (user?.onboarding?.completedAt && !searchParams.get("step")) {
      router.push("/");
    }
  }, [user, router, searchParams]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <SetupWizard user={user} />;
}

export default function SetupPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-pulse text-muted-foreground">Loading...</div>
        </div>
      }
    >
      <SetupPageContent />
    </Suspense>
  );
}
