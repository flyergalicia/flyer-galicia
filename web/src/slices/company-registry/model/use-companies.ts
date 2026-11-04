import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import {
  type BorrowedCompany,
  type Company,
  searchableCompanies,
  type SearchableCompany,
} from "@/shared/domain/company-registry/index.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { usePermissions, useSession } from "@/shared/session/index.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import {
  COMPANIES_QUERY_KEY,
  type CompanyList,
  failureText,
  readCompanies,
  readSubstituteCompanies,
  replaceCompanies,
  SUBSTITUTE_COMPANIES_QUERY_KEY,
} from "../api/companies.ts";

const NO_COMPANIES: readonly never[] = [];
/** The list of a substitute is asked for again, at most, once a minute. */
const SUBSTITUTES_FRESH_MS = 60_000;

export function useUserId(): string | null {
  const session = useSession();
  return session.status === "signed-in" ? session.user.id : null;
}

export interface CompaniesValue {
  readonly rows: readonly Company[];
  readonly updatedAt: string;
  /** There is nothing to show yet: the first answer, or trying again after a failure. */
  readonly loading: boolean;
  /** The last read failed. What is in `rows` is what was there before. */
  readonly failed: boolean;
  /** Reads them again. Null: it could not, and nothing can be compared against them. */
  readonly reload: () => Promise<readonly Company[] | null>;
}

/** The person's own companies. Whoever uses it, there is one read and one list. */
export function useCompanies(): CompaniesValue {
  const backend = useBackend();
  const userId = useUserId();
  const { show } = useToast();
  const { data, isError, isFetching, isPending, refetch } = useQuery({
    queryKey: [...COMPANIES_QUERY_KEY, userId],
    enabled: userId !== null,
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: async () => {
      try {
        return await readCompanies(backend, userId ?? "");
      } catch (cause) {
        const reason = cause instanceof Error ? cause.cause : cause;
        show(
          `No se pudieron traer tus empresas (${failureText(reason)}). Tocá Reintentar en la lupa.`,
        );
        throw cause;
      }
    },
  });
  const reload = useCallback(async () => {
    const result = await refetch({ cancelRefetch: false });
    return result.isError ? null : (result.data?.rows ?? NO_COMPANIES);
  }, [refetch]);
  return useMemo(
    () => ({
      rows: data?.rows ?? NO_COMPANIES,
      updatedAt: data?.updatedAt ?? "",
      loading: isPending || (isError && isFetching && !data?.rows.length),
      failed: isError,
      reload,
    }),
    [data, isError, isFetching, isPending, reload],
  );
}

/**
 * Replaces the whole list. Only the person's own rows ever get here: the companies of a substitute
 * are in another query, and saving them would keep them as one's own (invariant 25).
 */
export function useSaveCompanies(): (rows: readonly Company[]) => Promise<boolean> {
  const backend = useBackend();
  const queryClient = useQueryClient();
  const userId = useUserId();
  const { show } = useToast();
  return useCallback(
    async (rows) => {
      const failed = await replaceCompanies(backend, rows);
      if (failed) {
        show(`Error al guardar tus empresas: ${failed.message}`);
        return false;
      }
      queryClient.setQueryData<CompanyList>([...COMPANIES_QUERY_KEY, userId], {
        rows,
        updatedAt: new Date().toISOString(),
      });
      return true;
    },
    [backend, queryClient, show, userId],
  );
}

export interface SubstituteCompaniesValue {
  readonly rows: readonly BorrowedCompany[];
  /** Asks again if it is older than a minute. A cut does not take away what was there. */
  readonly refreshIfOld: () => Promise<void>;
}

export function useSubstituteCompanies(): SubstituteCompaniesValue {
  const backend = useBackend();
  const queryClient = useQueryClient();
  const userId = useUserId();
  const { isHunter } = usePermissions();
  const key = useMemo(() => [...SUBSTITUTE_COMPANIES_QUERY_KEY, userId], [userId]);
  const { data } = useQuery({
    queryKey: key,
    enabled: userId !== null && !isHunter,
    staleTime: SUBSTITUTES_FRESH_MS,
    queryFn: () => readSubstituteCompanies(backend),
  });
  const refreshIfOld = useCallback(async () => {
    if (isHunter) return;
    await queryClient.prefetchQuery({
      queryKey: key,
      staleTime: SUBSTITUTES_FRESH_MS,
      queryFn: () => readSubstituteCompanies(backend),
    });
  }, [backend, isHunter, key, queryClient]);
  return { rows: data ?? NO_COMPANIES, refreshIfOld };
}

/** What the magnifying glass and the suggestions go through: one's own first, then the borrowed. */
export function useSearchableCompanies(): readonly SearchableCompany[] {
  const { rows } = useCompanies();
  const { rows: borrowed } = useSubstituteCompanies();
  return useMemo(() => searchableCompanies(rows, borrowed), [rows, borrowed]);
}
