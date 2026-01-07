import { redirect } from "next/navigation";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import { getSessionToken } from "@/lib/auth";
import { Dashboard } from "@/components/dashboard";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export default async function Home() {
  const token = await getSessionToken();

  if (!token) {
    redirect("/login");
  }

  const user = await convex.query(api.users.me, { sessionToken: token });

  if (!user) {
    redirect("/login");
  }

  if (!user.onboarding?.completedAt) {
    redirect("/setup");
  }

  return <Dashboard user={user} />;
}
