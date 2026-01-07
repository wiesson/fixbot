import { redirect } from "next/navigation";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import { getSessionToken } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export default async function SettingsPage() {
  const token = await getSessionToken();

  if (!token) {
    redirect("/login");
  }

  const user = await convex.query(api.users.me, { sessionToken: token });

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Link
          href="/"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mb-6")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Link>

        <h1 className="text-2xl font-bold mb-6">Settings</h1>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={user.avatarUrl} alt={user.name} />
              <AvatarFallback>{user.name[0]}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">{user.name}</p>
              <p className="text-sm text-muted-foreground">{user.email}</p>
              <p className="text-sm text-muted-foreground">@{user.githubUsername}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent>
            <form action="/api/auth/logout" method="POST">
              <button
                type="submit"
                className={cn(buttonVariants({ variant: "destructive" }))}
              >
                Sign Out
              </button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
