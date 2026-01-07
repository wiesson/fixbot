import { redirect } from "next/navigation";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import { getSessionToken } from "@/lib/auth";
import { SetupWizard } from "@/components/setup/setup-wizard";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

interface SetupPageProps {
  searchParams: Promise<{ step?: string }>;
}

export default async function SetupPage({ searchParams }: SetupPageProps) {
  const token = await getSessionToken();

  if (!token) {
    redirect("/login");
  }

  const user = await convex.query(api.users.me, { sessionToken: token });

  if (!user) {
    redirect("/login");
  }

  const params = await searchParams;

  // If onboarding already complete and no step param, redirect to dashboard
  if (user.onboarding?.completedAt && !params.step) {
    redirect("/");
  }

  return <SetupWizard user={user} />;
}
