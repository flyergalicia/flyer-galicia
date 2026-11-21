// What the agenda shows. The memory goes by range, so going from the week to the day asks nothing,
// and a late answer does not step on the period being looked at: each one has its key.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { useBackend } from "@/shared/supabase/index.ts";
import { readAgenda } from "../api/agenda.ts";
import type { AgendaView, DateRange } from "./agenda-place.ts";
import { AGENDA_KEY } from "./use-actions-data.ts";
import { asksHiddenOccupancy, type Who } from "./who.ts";

export function useAgendaData(who: Who, range: DateRange, view: AgendaView) {
  const backend = useBackend();
  const queryClient = useQueryClient();
  const slot = `${range.from}|${range.to}`;
  const { data, error, isPending, refetch } = useQuery({
    queryKey: [...AGENDA_KEY, who.me, who.role, slot],
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: () =>
      readAgenda(backend, range, {
        onlyOf: who.role === "hunter" ? who.me : null,
        // On the month it would be unreadable.
        asksOccupied: asksHiddenOccupancy(who) && view !== "mes",
      }),
  });
  // One period is remembered: coming back to one left behind reads it again.
  useEffect(() => {
    if (!data) return;
    queryClient.removeQueries({
      queryKey: AGENDA_KEY,
      predicate: ({ queryKey }) => queryKey.at(-1) !== slot,
    });
  }, [data, queryClient, slot]);
  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);
  return { data, error, isPending, retry };
}
