// Descarga múltiple: the companies ticked, which stay in sight even if the search shows others.
import { useCallback, useMemo, useState } from "react";
import type { Company } from "@/shared/domain/company-registry/index.ts";

const NOTHING_TICKED: ReadonlySet<Company> = new Set();

export function useTickedCompanies(all: readonly Company[]) {
  const [isOn, setIsOn] = useState(false);
  const [ticked, setTicked] = useState(NOTHING_TICKED);
  const [listRead, setListRead] = useState(all);
  // A list read again has other rows: nothing of the old one stays.
  if (all !== listRead) {
    setListRead(all);
    setTicked(NOTHING_TICKED);
  }

  const toggle = useCallback(() => {
    setIsOn((on) => !on);
    setTicked(NOTHING_TICKED);
  }, []);
  const cancel = useCallback(() => {
    setIsOn(false);
    setTicked(NOTHING_TICKED);
  }, []);
  const tick = useCallback((company: Company, on: boolean) => {
    setTicked((before) => {
      const next = new Set(before);
      if (on) next.add(company);
      else next.delete(company);
      return next;
    });
  }, []);
  const tickAll = useCallback((companies: readonly Company[], on: boolean) => {
    setTicked((before) => {
      const next = new Set(before);
      for (const company of companies) {
        if (on) next.add(company);
        else next.delete(company);
      }
      return next;
    });
  }, []);
  /** In the order of the list, whichever way they were ticked. */
  const list = useMemo(() => all.filter((company) => ticked.has(company)), [all, ticked]);
  return { isOn, ticked, list, toggle, cancel, tick, tickAll };
}
