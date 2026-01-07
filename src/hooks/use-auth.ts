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

  const user = useQuery(api.users.me, { sessionToken: sessionToken ?? undefined });

  return {
    user: user ?? null,
    isLoading: isLoading || user === undefined,
    isAuthenticated: !!user,
  };
}
