// The list of the Hunter: its companies, what each one can come out with, and what a cut in the
// network leaves (invariant 24).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Company, searchCompanies } from "@/shared/domain/company-registry/index.ts";
import { titleOf } from "@/shared/domain/screen-titles.ts";
import { useCashbackConfigs } from "@/shared/lib/app-config/cashback-query.ts";
import { useFlyerOptions } from "@/shared/lib/app-config/flyer-options-query.ts";
import { useScreenTitles } from "@/shared/lib/app-config/screen-titles-query.ts";
import { registerProbe } from "@/shared/lib/test-probe.ts";
import { usePermissions } from "@/shared/session/index.ts";
import type { HunterFlyerRules } from "./company-flyer-rules.ts";
import { useFlyersKnown } from "./use-flyers-known.ts";
import { useVisibleCompanies } from "./use-visible-companies.ts";

/** How many rows a search lists. */
export const MAX_LISTED = 40;

const NO_COMPANIES: readonly Company[] = [];

export type ListProblem = "companies" | "flyers" | null;

export function useHunterList(isActive: boolean) {
  const companies = useVisibleCompanies();
  const { options, settled } = useFlyerOptions();
  const { names } = useCashbackConfigs();
  const { titles } = useScreenTitles();
  const { can } = usePermissions();
  const allowed = useMemo(
    () => options.map(({ n }) => n).filter((option) => can(`opcion_${option}`)),
    [can, options],
  );
  const flyers = useFlyersKnown(allowed, settled);
  const [query, setQuery] = useState("");
  const { rows, loading, failed, reload } = companies;
  const { hasFlyer, answers, askAgain, failed: flyersFailed, loading: flyersLoading } = flyers;

  const rules = useMemo<HunterFlyerRules>(
    () => ({
      options,
      cashbackNames: names,
      can,
      tabLabel: (tab) => titleOf(titles, tab),
      hasFlyer,
    }),
    [can, hasFlyer, names, options, titles],
  );
  const all = rows ?? NO_COMPANIES;
  const hits = useMemo(() => searchCompanies(query, all, MAX_LISTED), [all, query]);

  const retry = useCallback(() => {
    void askAgain();
    void reload();
  }, [askAgain, reload]);

  const askMissing = useRef<() => void>(() => undefined);
  useEffect(() => {
    askMissing.current = () => {
      if (rows === null && failed && !loading) void reload();
      if (flyersFailed && !flyersLoading) void askAgain();
    };
  });
  // Coming back to the screen asks for what it did not get: each entry is a new try, as it is today.
  useEffect(() => {
    if (isActive) askMissing.current();
  }, [isActive]);

  useEffect(
    () =>
      registerProbe("hunterScreen", () => ({
        loadedCompanies: rows === null ? null : rows.length,
        companiesFailed: failed,
        flyersFailed,
        flyersSettled: !flyersLoading,
        hasFlyer: Object.fromEntries(answers),
      })),
    [answers, failed, flyersFailed, flyersLoading, rows],
  );

  const problem: ListProblem = failed ? "companies" : flyersFailed ? "flyers" : null;
  return {
    query,
    setQuery,
    all,
    hits,
    rules,
    loading: loading || flyersLoading,
    problem,
    companiesLoading: loading,
    retry,
    noteHasNoFlyer: flyers.noteHasNoFlyer,
  };
}

export type HunterList = ReturnType<typeof useHunterList>;
