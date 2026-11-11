// The agenda pasted, reviewed against the database: each company once, then each hunter and day. It
// waits for the writing to stop. A failure to ask is told apart from a company that is not there, and
// a review that arrives late does not paint over the one on its way: each text has its key.
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { normalizeName } from "@/shared/domain/company-registry/index.ts";
import { type Backend, useBackend } from "@/shared/supabase/index.ts";
import { readHunterDay } from "../api/actions.ts";
import { searchCompanies } from "../api/agenda.ts";
import {
  type CompaniesByName,
  daysToAsk,
  type FoundCompany,
  namesToLookFor,
  parsePastedAgenda,
  type PastedLine,
  type TakenOnDay,
  withCompanies,
  withOverlaps,
} from "./agenda-paste.ts";
import type { Who } from "./who.ts";

const WAIT_TO_REVIEW_MS = 400;

async function exactMatches(
  backend: Backend,
  name: string,
): Promise<readonly FoundCompany[] | null> {
  try {
    const found = await searchCompanies(backend, name);
    const key = normalizeName(name);
    return found.filter(({ empresa }) => normalizeName(empresa) === key);
  } catch {
    return null;
  }
}

async function companiesOf(backend: Backend, names: readonly string[]): Promise<CompaniesByName> {
  const answers = await Promise.all(
    names.map(async (name) => [normalizeName(name), await exactMatches(backend, name)] as const),
  );
  return new Map(answers);
}

/** Without a network nothing is stopped here: the database still does when adding. */
async function takenOf(
  backend: Backend,
  days: readonly { readonly hunter: string; readonly date: string }[],
) {
  const answers = await Promise.all(
    days.map(async ({ hunter, date }) => {
      const taken = await readHunterDay(backend, hunter, date).catch(
        (): readonly TakenOnDay[] => [],
      );
      return [`${hunter}|${date}`, taken] as const;
    }),
  );
  const byDay = new Map(answers);
  return (hunter: string, date: string) => byDay.get(`${hunter}|${date}`) ?? [];
}

async function reviewed(backend: Backend, who: Who, text: string): Promise<PastedLine[]> {
  const lines = parsePastedAgenda(who, text);
  const found = withCompanies(who, lines, await companiesOf(backend, namesToLookFor(lines)));
  return withOverlaps(who, found, await takenOf(backend, daysToAsk(found)));
}

export function usePasteReview(who: Who) {
  const backend = useBackend();
  const [text, setText] = useState("");
  const [asked, setAsked] = useState("");
  useEffect(() => {
    if (text === asked) return undefined;
    const timer = setTimeout(() => {
      setAsked(text);
    }, WAIT_TO_REVIEW_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [asked, text]);
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["commercial-actions", "agenda-paste", asked],
    gcTime: 0,
    staleTime: 0,
    enabled: parsePastedAgenda(who, asked).length > 0,
    queryFn: () => reviewed(backend, who, asked),
  });
  const hasLines = parsePastedAgenda(who, asked).length > 0;
  const tryAgain = useCallback(() => {
    void refetch();
  }, [refetch]);
  return {
    text,
    setText,
    /** What was written has not been reviewed yet. */
    isWaiting: text !== asked,
    isReviewing: hasLines && isFetching,
    lines: hasLines ? (data ?? null) : null,
    tryAgain,
  };
}
