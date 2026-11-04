import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { PrimaryActionProvider } from "./primary-action/PrimaryActionProvider.tsx";
import { ToastProvider } from "./toast/ToastProvider.tsx";
import { SessionProvider } from "@/shared/session/index.ts";
import { type Backend, BackendProvider } from "@/shared/supabase/index.ts";
import { ThemeProvider } from "@/shared/ui/index.ts";

interface AppProvidersProps {
  readonly backend: Backend;
  readonly queryClient: QueryClient;
  readonly children: ReactNode;
}

/** What everything in the app has available. The very few things that are of the whole app. */
export function AppProviders({ backend, queryClient, children }: AppProvidersProps) {
  return (
    <ThemeProvider>
      <BackendProvider backend={backend}>
        <QueryClientProvider client={queryClient}>
          <SessionProvider>
            <ToastProvider>
              <PrimaryActionProvider>{children}</PrimaryActionProvider>
            </ToastProvider>
          </SessionProvider>
        </QueryClientProvider>
      </BackendProvider>
    </ThemeProvider>
  );
}
