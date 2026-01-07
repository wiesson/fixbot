import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import { generateSessionToken } from "@/lib/auth";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
}

interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/login?error=${error}`, request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=no_code", request.url));
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error("GitHub OAuth error:", tokenData);
      return NextResponse.redirect(new URL(`/login?error=${tokenData.error}`, request.url));
    }

    const accessToken = tokenData.access_token;

    // Get user info
    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    const githubUser: GitHubUser = await userResponse.json();

    // Get user email if not public
    let email = githubUser.email;
    if (!email) {
      const emailsResponse = await fetch("https://api.github.com/user/emails", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      });
      const emails: GitHubEmail[] = await emailsResponse.json();
      const primaryEmail = emails.find((e) => e.primary && e.verified);
      email = primaryEmail?.email ?? emails[0]?.email;
    }

    if (!email) {
      return NextResponse.redirect(new URL("/login?error=no_email", request.url));
    }

    // Upsert user in Convex
    const userId = await convex.mutation(api.users.upsertFromGithub, {
      githubId: githubUser.id,
      githubUsername: githubUser.login,
      email,
      name: githubUser.name || githubUser.login,
      avatarUrl: githubUser.avatar_url,
      githubAccessToken: accessToken,
    });

    // Create session
    const sessionToken = generateSessionToken();
    await convex.mutation(api.users.createSession, {
      userId,
      token: sessionToken,
    });

    // Redirect to dashboard with session cookie
    const response = NextResponse.redirect(new URL("/", request.url));
    response.cookies.set("herbot_session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });
    return response;
  } catch (error) {
    console.error("GitHub OAuth callback error:", error);
    return NextResponse.redirect(new URL("/login?error=callback_failed", request.url));
  }
}
