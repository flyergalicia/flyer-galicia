import { type ReactNode, useState } from "react";
import { createPromotionFiltersPort, PromotionFiltersContext } from "./promotion-filters.ts";

export function PromotionFiltersProvider({ children }: { readonly children: ReactNode }) {
  const [port] = useState(createPromotionFiltersPort);
  return (
    <PromotionFiltersContext.Provider value={port}>{children}</PromotionFiltersContext.Provider>
  );
}
