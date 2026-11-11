// What Promociones → Activas has chosen, for the windows of brands to start from, and what they ask
// it to choose when going to full screen. Promociones owns these values; this is the port between
// the two, because a slice does not read the context of another.
import { createContext, useContext } from "react";

export interface PromotionFilterValues {
  readonly province: string;
  readonly locality: string;
  readonly category: string;
  readonly hideOnline: boolean;
  readonly onePerBrand: boolean;
  readonly onlyPercent: boolean;
}

export const NO_PROMOTION_FILTERS: PromotionFilterValues = {
  province: "",
  locality: "",
  category: "",
  hideOnline: false,
  onePerBrand: false,
  onlyPercent: false,
};

/**
 * What is asked of Promociones. With `listActive`, it goes to Activas and lists them; with no province
 * it cannot, and it says `noProvinceNotice`.
 */
export type AskedFilters = Partial<PromotionFilterValues> & {
  readonly listActive?: boolean;
  readonly noProvinceNotice?: string;
};

export interface PromotionFiltersPort {
  /** What Promociones has now. Before it was opened, nothing is chosen. */
  readonly read: () => PromotionFilterValues;
  /** Promociones tells what changed. */
  readonly publish: (values: PromotionFilterValues) => void;
  /** Asks Promociones to choose these, now or when it opens. */
  readonly ask: (values: AskedFilters) => void;
  /** What was asked and nobody attended yet. */
  readonly takeAsked: () => AskedFilters | null;
  /** For Promociones, to attend what is asked while it is open. */
  readonly onAsked: (listener: () => void) => () => void;
}

export function createPromotionFiltersPort(): PromotionFiltersPort {
  let values = NO_PROMOTION_FILTERS;
  let asked: AskedFilters | null = null;
  const listeners = new Set<() => void>();
  return {
    read: () => values,
    publish: (next) => {
      values = next;
    },
    ask: (next) => {
      asked = { ...asked, ...next };
      const { listActive: _list, noProvinceNotice: _notice, ...chosen } = next;
      values = { ...values, ...chosen };
      for (const listener of listeners) listener();
    },
    takeAsked: () => {
      const taken = asked;
      asked = null;
      return taken;
    },
    onAsked: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const PromotionFiltersContext = createContext<PromotionFiltersPort | null>(null);

export function usePromotionFiltersPort(): PromotionFiltersPort {
  const port = useContext(PromotionFiltersContext);
  if (!port) throw new Error("usePromotionFiltersPort needs its provider above it");
  return port;
}
