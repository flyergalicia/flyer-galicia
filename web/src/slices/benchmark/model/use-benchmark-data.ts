// The data of Benchmark: read once on opening the tab, and again on Reintentar, after Actualizar ahora
// and after a promotion loaded by hand is saved. Saving a card reads only the cards.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useBackend } from "@/shared/supabase/index.ts";
import { type BenchmarkData, readBenchmark, readCards } from "../api/benchmark-data.ts";
import { argentinaDay } from "./dates.ts";
import type { HandLoadedPromotion, PremiumCard, SourceMeta } from "./rows.ts";

const DATA_KEY = ["benchmark", "data"] as const;
const CARDS_KEY = ["benchmark", "cards"] as const;

export type BenchmarkLoad =
  | { readonly status: "loading" }
  | { readonly status: "failed"; readonly message: string }
  | { readonly status: "ready"; readonly data: BenchmarkData };

export interface LastRead {
  readonly meta: readonly SourceMeta[] | null;
  readonly handLoaded: readonly HandLoadedPromotion[] | null;
}

const NOTHING_READ: LastRead = { meta: [], handLoaded: [] };

export interface BenchmarkReading {
  readonly load: BenchmarkLoad;
  /** Null: they could not be read. Undefined: they are on their way. */
  readonly cards: readonly PremiumCard[] | null | undefined;
  /** What the labels show while it reads again: the last that was read. */
  readonly last: LastRead;
  /** Reads everything again, from nothing: "Cargando…" while it does. */
  readonly readAgain: () => Promise<void>;
  /** Reads the cards again, keeping the ones on screen meanwhile. */
  readonly readCardsAgain: () => Promise<void>;
}

export function useBenchmarkData(): BenchmarkReading {
  const backend = useBackend();
  const queryClient = useQueryClient();
  const data = useQuery({
    queryKey: DATA_KEY,
    queryFn: () => readBenchmark(backend, argentinaDay()),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const cards = useQuery({
    queryKey: CARDS_KEY,
    queryFn: () => readCards(backend),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const [last, setLast] = useState<LastRead>(NOTHING_READ);
  const result = data.data;

  const readAgain = useCallback(async () => {
    // What was there stays on the labels while it reads, as in the old app.
    const before = queryClient.getQueryData<Awaited<ReturnType<typeof readBenchmark>>>(DATA_KEY);
    if (before?.ok) setLast({ meta: before.value.meta, handLoaded: before.value.handLoaded });
    await Promise.all([
      queryClient.resetQueries({ queryKey: DATA_KEY }),
      queryClient.resetQueries({ queryKey: CARDS_KEY }),
    ]);
  }, [queryClient]);
  const readCardsAgain = useCallback(async () => {
    await queryClient.refetchQueries({ queryKey: CARDS_KEY });
  }, [queryClient]);

  return {
    load: loadOf(result, cards.data === undefined),
    cards: cards.data,
    last,
    readAgain,
    readCardsAgain,
  };
}

function loadOf(
  result: Awaited<ReturnType<typeof readBenchmark>> | undefined,
  cardsOnTheirWay: boolean,
): BenchmarkLoad {
  // As the old app, the screen waits for everything it reads together.
  if (result === undefined || cardsOnTheirWay) return { status: "loading" };
  return result.ok
    ? { status: "ready", data: result.value }
    : { status: "failed", message: result.error };
}
