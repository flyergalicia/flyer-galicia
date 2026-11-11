import { createContext, useContext, useSyncExternalStore } from "react";
import type { FlyerHistory } from "./flyer-history.ts";
import type { HistoryItem } from "./stored-flyer.ts";

export const FlyerHistoryContext = createContext<FlyerHistory | null>(null);

/** The store: it never changes, so reading it does not draw anything again. */
export function useFlyerHistory(): FlyerHistory {
  const history = useContext(FlyerHistoryContext);
  if (!history) throw new Error("useFlyerHistory needs a FlyerFormProvider above it");
  return history;
}

export function useHistoryItems(): readonly HistoryItem[] {
  const { subscribe, getItems } = useFlyerHistory();
  return useSyncExternalStore(subscribe, getItems);
}
