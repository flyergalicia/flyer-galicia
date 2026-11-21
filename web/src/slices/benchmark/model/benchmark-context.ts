// What the views of Benchmark read and do, once the data is there. State and actions apart.
import { createContext, useContext } from "react";
import type { BenchmarkData } from "../api/benchmark-data.ts";
import type { BrandIndex, FilterDays } from "./filters.ts";
import type { BenchPromotion, PremiumCard } from "./rows.ts";
import type { ScreenAction, ScreenState } from "./screen-state.ts";

export interface BenchmarkValue {
  readonly screen: ScreenState;
  readonly data: BenchmarkData;
  /** Null: they could not be read. Undefined: they are on their way. */
  readonly cards: readonly PremiumCard[] | null | undefined;
  readonly brands: BrandIndex;
  /** The promotions that count with the filters on screen. */
  readonly filtered: readonly BenchPromotion[];
  readonly days: FilterDays;
  readonly isAdmin: boolean;
}

export interface BenchmarkActions {
  readonly dispatch: (action: ScreenAction) => void;
  /** Changes a reference purchase, and the browser remembers it. */
  readonly setReference: (rubro: string, typed: string) => void;
  readonly readAgain: () => Promise<void>;
  readonly readCardsAgain: () => Promise<void>;
}

export const BenchmarkContext = createContext<BenchmarkValue | null>(null);
export const BenchmarkActionsContext = createContext<BenchmarkActions | null>(null);

export function useBenchmark(): BenchmarkValue {
  const value = useContext(BenchmarkContext);
  if (!value) throw new Error("useBenchmark needs the screen of Benchmark around it");
  return value;
}

export function useBenchmarkActions(): BenchmarkActions {
  const actions = useContext(BenchmarkActionsContext);
  if (!actions) throw new Error("useBenchmarkActions needs the screen of Benchmark around it");
  return actions;
}
