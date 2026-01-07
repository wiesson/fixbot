"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { useEffect, useState } from "react";

export function useAuth() {
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Get session token from cookie via API
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data) => {
        setSessionToken(data.token);
        setIsLoading(false);
      })
      .catch(() => {
        setIsLoading(false);
      });
  }, []);

  // Skip query until we have a token to avoid race condition
  const user = useQuery(api.users.me, sessionToken ? { sessionToken } : "skip");

  // Still loading if: fetching token OR (have token but query pending)
  const queryLoading = sessionToken !== null && user === undefined;

  // Debug logging
  console.log("[useAuth]", {
    sessionToken: sessionToken ? "present" : "null",
    user: user === undefined ? "undefined" : user ? "present" : "null",
    isLoading,
    queryLoading,
    finalLoading: isLoading || queryLoading,
    isAuthenticated: !!user,
  });

  return {
    user: user ?? null,
    isLoading: isLoading || queryLoading,
    isAuthenticated: !!user,
  };
}
