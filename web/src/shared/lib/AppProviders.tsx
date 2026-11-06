import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { FlyerChangesProvider } from "./flyer-changes/FlyerChangesProvider.tsx";
import { OptionOnScreenProvider } from "./option-on-screen/OptionOnScreenProvider.tsx";
import { PlaceDeskProvider } from "./places/PlaceDeskProvider.tsx";
import { PrimaryActionProvider } from "./primary-action/PrimaryActionProvider.tsx";
import { IncludeModoProvider } from "./promotions/IncludeModoProvider.tsx";
import { PromotionFiltersProvider } from "./promotions/PromotionFiltersProvider.tsx";
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
              <PrimaryActionProvider>
                <OptionOnScreenProvider>
                  <FlyerChangesProvider>
                    <IncludeModoProvider>
                      <PromotionFiltersProvider>
                        <PlaceDeskProvider>{children}</PlaceDeskProvider>
                      </PromotionFiltersProvider>
                    </IncludeModoProvider>
                  </FlyerChangesProvider>
                </OptionOnScreenProvider>
              </PrimaryActionProvider>
            </ToastProvider>
          </SessionProvider>
        </QueryClientProvider>
      </BackendProvider>
    </ThemeProvider>
  );
}
