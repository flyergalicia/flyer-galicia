// Choosing brands for a flyer from the table of Promociones ("Elegir en pantalla completa"). The
// first column stops being the tick that leaves a row out of the report and becomes a button of the
// one that is choosing. Promociones does not know who that is: Cambiar logos brings it.
import { createContext, type ReactNode, useContext } from "react";
import type { Promotion, PromotionStatus } from "@/shared/domain/promotions/index.ts";

export interface PickableRow {
  readonly promotion: Promotion | null;
  readonly status: PromotionStatus;
}

export interface PromotionPicking {
  /** What goes first on a row. Null: it cannot be chosen, and it keeps the usual tick. */
  readonly firstCell: (row: PickableRow) => ReactNode;
}

export const PromotionPickingContext = createContext<PromotionPicking | null>(null);

export function usePromotionPicking(): PromotionPicking | null {
  return useContext(PromotionPickingContext);
}
