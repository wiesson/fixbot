import { redirect } from "next/navigation";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const clientId = process.env.GITHUB_CLIENT_ID;

  if (!clientId) {
    return new Response("GitHub OAuth not configured", { status: 500 });
  }

  // Generate state for CSRF protection
  const state = crypto.randomUUID();

  // Store state in cookie for verification
  const response = redirect(
    `https://github.com/login/oauth/authorize?` +
      new URLSearchParams({
        client_id: clientId,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/github/callback`,
        scope: "read:user user:email repo",
        state,
      }).toString()
  );

  return response;
}
