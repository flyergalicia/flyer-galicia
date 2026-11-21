import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import type { Company } from "@/shared/domain/company-registry/index.ts";
import { useSession } from "@/shared/session/index.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { readVisibleCompanies, VISIBLE_COMPANIES_QUERY_KEY } from "../api/visible-companies.ts";

export interface VisibleCompanies {
  /** Null until they could be read at least once. */
  readonly rows: readonly Company[] | null;
  readonly loading: boolean;
  /** The last read failed: it is not "there are no companies" (invariant 24). */
  readonly failed: boolean;
  readonly reload: () => Promise<unknown>;
}

export function useVisibleCompanies(): VisibleCompanies {
  const backend = useBackend();
  const session = useSession();
  const userId = session.status === "signed-in" ? session.user.id : null;
  const { data, isError, isFetching, isPending, refetch } = useQuery({
    queryKey: [...VISIBLE_COMPANIES_QUERY_KEY, userId],
    enabled: userId !== null,
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: () => readVisibleCompanies(backend),
  });
  const reload = useCallback(() => refetch({ cancelRefetch: false }), [refetch]);
  return useMemo(
    () => ({
      rows: data ?? null,
      loading: isPending || isFetching,
      failed: isError,
      reload,
    }),
    [data, isError, isFetching, isPending, reload],
  );
}
