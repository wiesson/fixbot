import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import { getSessionToken, clearSessionCookie } from "@/lib/auth";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST() {
  const token = await getSessionToken();

  if (token) {
    try {
      await convex.mutation(api.users.deleteSession, { token });
    } catch (error) {
      console.error("Error deleting session:", error);
    }
  }

  await clearSessionCookie();

  return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_APP_URL));
}

// Removed GET handler - logout should only happen via POST to prevent prefetch logout
