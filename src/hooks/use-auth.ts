"use client";

import { useQuery } from "convex/react";
import { useQuery as useTanstackQuery } from "@tanstack/react-query";
import { api } from "@convex/_generated/api";

export function useAuth() {
  // Fetch session token using TanStack Query (cached, no re-fetch on navigation)
  const { data: sessionData, isLoading: sessionLoading } = useTanstackQuery({
    queryKey: ["session"],
    queryFn: () => fetch("/api/auth/session").then((res) => res.json()),
    staleTime: Infinity, // Session doesn't change during session
    retry: false,
  });
  const sessionToken = sessionData?.token ?? null;

  // Skip Convex query until we have a token to avoid race condition
  const user = useQuery(api.users.me, sessionToken ? { sessionToken } : "skip");

  // Still loading if: fetching token OR (have token but query pending)
  const queryLoading = sessionToken !== null && user === undefined;

  return {
    user: user ?? null,
    isLoading: sessionLoading || queryLoading,
    isAuthenticated: !!user,
  };
}
