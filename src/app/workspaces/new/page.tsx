import { redirect } from "next/navigation";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import { getSessionToken } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export default async function NewWorkspacePage() {
  const token = await getSessionToken();

  if (!token) {
    redirect("/login");
  }

  const user = await convex.query(api.users.me, { sessionToken: token });

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex items-center justify-center">
      <Card className="max-w-md w-full mx-4">
        <CardContent className="py-8 text-center">
          <h1 className="text-xl font-bold mb-2">Create a Workspace</h1>
          <p className="text-muted-foreground mb-6">
            Workspaces are created by connecting a Slack workspace. This allows Norbot to receive tasks and communicate with your team.
          </p>
          <Link href="/setup?step=slack" className={cn(buttonVariants())}>
            Connect Slack
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
