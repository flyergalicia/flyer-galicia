import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import {
  ADVISORS_QUERY_KEY,
  type AdvisorList,
  cachedAdvisors,
  keepAdvisorsCopy,
  readAdvisors,
  replaceAdvisors,
  type SavedAdvisor,
} from "../api/saved-advisors.ts";
import { useUserId } from "./use-companies.ts";

const NO_ADVISORS: readonly never[] = [];

export interface SavedAdvisorsValue {
  readonly rows: readonly SavedAdvisor[];
  /** The first answer has not arrived: what shows is the copy of the browser, if there is one. */
  readonly loading: boolean;
  /** Keeps them here and uploads them. If the cloud does not take them, they stay here. */
  readonly save: (rows: readonly SavedAdvisor[]) => Promise<boolean>;
  /** The list as the cloud has it, for whoever is about to add to it. */
  readonly latest: () => Promise<readonly SavedAdvisor[]>;
}

/** The list of advisors of the account, for Mis asesores and for what the flyer editor loads. */
export function useSavedAdvisors(): SavedAdvisorsValue {
  const backend = useBackend();
  const queryClient = useQueryClient();
  const userId = useUserId();
  const { show } = useToast();
  const key = useMemo(() => [...ADVISORS_QUERY_KEY, userId], [userId]);
  const { data, isPending, isPlaceholderData } = useQuery({
    queryKey: key,
    enabled: userId !== null,
    // Read once a session; if the cloud did not answer, it is read again the next time it is asked.
    staleTime: ({ state }) => (state.data?.fromCloud ? Number.POSITIVE_INFINITY : 0),
    queryFn: () => readAdvisors(backend, userId ?? ""),
    placeholderData: () => ({ rows: cachedAdvisors(userId ?? "anon"), fromCloud: false }),
  });
  const save = useCallback(
    async (rows: readonly SavedAdvisor[]) => {
      if (userId) keepAdvisorsCopy(userId, rows);
      queryClient.setQueryData<AdvisorList>(key, { rows, fromCloud: true });
      const failed = await replaceAdvisors(backend, rows);
      if (failed)
        show(`No se pudo guardar en la nube: ${failed.message} (quedó en esta computadora)`);
      return !failed;
    },
    [backend, key, queryClient, show, userId],
  );
  const latest = useCallback(async () => {
    const known = await queryClient.fetchQuery({
      queryKey: key,
      staleTime: ({ state }) => (state.data?.fromCloud ? Number.POSITIVE_INFINITY : 0),
      queryFn: () => readAdvisors(backend, userId ?? ""),
    });
    return known.rows;
  }, [backend, key, queryClient, userId]);
  return {
    rows: data?.rows ?? NO_ADVISORS,
    loading: isPending || isPlaceholderData,
    save,
    latest,
  };
}
