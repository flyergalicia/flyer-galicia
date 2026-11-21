// Which options of this profile have a flyer loaded (`_hunMetasCargar`). Only a firm answer is written
// down: what could not be asked is asked again the next time (invariant 24).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { optionHasFlyer } from "@/shared/lib/flyer-workspace/index.ts";
import { useBackend } from "@/shared/supabase/index.ts";

const QUERY_KEY = ["hunter", "flyers-known"] as const;

interface Known {
  readonly answers: ReadonlyMap<number, boolean>;
  /** Some option could not be asked. */
  readonly failed: boolean;
}

const NOTHING_KNOWN: Known = { answers: new Map(), failed: false };

export interface FlyersKnown {
  readonly hasFlyer: (option: number) => boolean | undefined;
  readonly loading: boolean;
  readonly failed: boolean;
  /** What is known so far, as a test reads it. */
  readonly answers: ReadonlyMap<number, boolean>;
  /** Asks only what is not known yet. */
  readonly askAgain: () => Promise<unknown>;
  /** It turned out it has none: it is not offered again in this session. */
  readonly noteHasNoFlyer: (option: number) => void;
}

/** `options`: those of this profile. `enabled`: it is known which ones they are. */
export function useFlyersKnown(options: readonly number[], enabled: boolean): FlyersKnown {
  const { bucket } = useBackend();
  const queryClient = useQueryClient();
  const key = useMemo(() => [...QUERY_KEY, options.join(",")], [options]);
  const { data, isFetching, isPending, refetch } = useQuery({
    queryKey: key,
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: async (): Promise<Known> => {
      const before = queryClient.getQueryData<Known>(key)?.answers ?? NOTHING_KNOWN.answers;
      const missing = options.filter((option) => !before.has(option));
      const answers = await Promise.all(
        missing.map(async (option) => [option, await optionHasFlyer(bucket, option)] as const),
      );
      const firm = answers.flatMap(([option, has]) =>
        has === null ? [] : [[option, has] as const],
      );
      return { answers: new Map([...before, ...firm]), failed: firm.length < answers.length };
    },
  });
  const { answers, failed } = data ?? NOTHING_KNOWN;
  const hasFlyer = useCallback((option: number) => answers.get(option), [answers]);
  const askAgain = useCallback(() => refetch({ cancelRefetch: false }), [refetch]);
  const noteHasNoFlyer = useCallback(
    (option: number) => {
      queryClient.setQueryData<Known>(key, (known = NOTHING_KNOWN) => ({
        ...known,
        answers: new Map(known.answers).set(option, false),
      }));
    },
    [key, queryClient],
  );
  return {
    hasFlyer,
    loading: isPending || isFetching,
    failed,
    answers,
    askAgain,
    noteHasNoFlyer,
  };
}
