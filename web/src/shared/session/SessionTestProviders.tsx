import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, StrictMode } from "react";
import { type Backend, BackendProvider } from "@/shared/supabase/index.ts";
import { SessionProvider } from "./SessionProvider.tsx";

/** Test support: what the app shell will put around the session. */
export function SessionTestProviders({
  backend,
  queryClient,
  strict = false,
  children,
}: {
  readonly backend: Backend;
  readonly queryClient: QueryClient;
  readonly strict?: boolean;
  readonly children?: ReactNode;
}) {
  const tree = (
    <BackendProvider backend={backend}>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>{children}</SessionProvider>
      </QueryClientProvider>
    </BackendProvider>
  );
  return strict ? <StrictMode>{tree}</StrictMode> : tree;
}
