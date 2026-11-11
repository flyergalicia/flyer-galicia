import { QueryClient } from "@tanstack/react-query";

/**
 * Nothing moves by itself: going back to the tab or getting the network back does not read again,
 * and no read or write repeats on its own; each screen offers Reintentar. `always`, because `navigator.onLine` is not what
 * decides here: with it off, TanStack would pause the request and nobody would hear of a failure.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: false,
        networkMode: "always",
      },
      mutations: { retry: false, networkMode: "always" },
    },
  });
}
