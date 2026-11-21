// The numbers of the dashboard. They are asked on entering and on each filter; while a new answer
// comes, what is on screen stays.
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { registerProbe } from "@/shared/lib/test-probe.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { type DashboardArguments, readDashboard } from "../api/dashboard.ts";

export function useDashboardData(args: DashboardArguments) {
  const backend = useBackend();
  const { data, error, refetch } = useQuery({
    queryKey: ["commercial-actions", "dashboard", args],
    gcTime: 0,
    staleTime: 0,
    placeholderData: keepPreviousData,
    queryFn: () => readDashboard(backend, args),
  });
  useEffect(
    () =>
      registerProbe("commercialDashboard", () =>
        data
          ? {
              actions: data.kpis.visitas,
              unassigned: data.kpis.sin_asignar,
              hunterIds: data.byHunter.map(({ id }) => id),
              countedOfficerIds: data.byOfficer.map(({ id }) => id),
            }
          : null,
      ),
    [data],
  );
  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);
  return { data, error, retry };
}
