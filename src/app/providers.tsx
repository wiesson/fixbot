"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useState } from "react";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <ConvexProvider client={convex}>{children}</ConvexProvider>
    </QueryClientProvider>
  );
}
