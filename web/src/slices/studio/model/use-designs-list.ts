// The designs of Estudio: read on showing the screen and every 90 s while it is on top, so that a
// question or an answer reaches the card and not only the number. What was asked for while reading is
// not lost: the read starts over.
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  isOpenRequest,
  STUDIO_DESIGNS_QUERY_KEY,
  upsertDesign,
} from "@/shared/lib/studio/design-row.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { readDesign, readDesigns, readThreads, type Threads } from "../api/designs.ts";

/** How often it looks for news while the screen is on top. */
export const REFRESH_MS = 90_000;
const NO_THREADS: Threads = {};

export function useDesignsList(isActive: boolean, refreshMs = REFRESH_MS) {
  const backend = useBackend();
  const queryClient = useQueryClient();
  // Where an administrator opens: it is decided on each read, not on each change of the list.
  const [isRequestWaiting, setRequestWaiting] = useState(false);
  const list = useQuery({
    queryKey: STUDIO_DESIGNS_QUERY_KEY,
    queryFn: async () => {
      const rows = await readDesigns(backend);
      setRequestWaiting(rows.some(({ estado }) => estado === "pedido"));
      return rows;
    },
    staleTime: 0,
    refetchInterval: isActive ? refreshMs : false,
  });
  const { data: designs, dataUpdatedAt, refetch } = list;
  const wasActive = useRef(isActive);
  useEffect(() => {
    if (isActive && !wasActive.current) void refetch();
    wasActive.current = isActive;
  }, [isActive, refetch]);
  // Only those of the open requests: once resolved, what stays is the note of the administrator.
  const open = (designs ?? []).filter(isOpenRequest).map(({ id }) => id);
  const threads = useQuery({
    // A late answer does not step on that of a newer read: each read of the list has its key.
    queryKey: ["studio", "threads", open.join(), dataUpdatedAt],
    queryFn: () => readThreads(backend, open),
    enabled: open.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 0,
  });
  const reload = useCallback(async () => {
    await refetch();
  }, [refetch]);
  /** One design and its conversation, after asking or answering. */
  const refreshOne = useCallback(
    async (id: string) => {
      try {
        upsertDesign(queryClient, await readDesign(backend, id));
      } catch {
        // The list is read again in a while, and what is on screen says nothing false.
      }
    },
    [backend, queryClient],
  );
  return {
    designs: designs ?? null,
    isRequestWaiting,
    isLoading: list.isPending,
    failure: designs ? null : list.error,
    threads: threads.data ?? NO_THREADS,
    reload,
    refreshOne,
  };
}
