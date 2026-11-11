// Choosing brands for a flyer from the table of Promociones ("Elegir en pantalla completa"). The
// first column stops being the tick that leaves a row out of the report and becomes a button of the
// one that is choosing. Promociones does not know who that is, and Cambiar logos does not know how
// to get to Promociones: `app` is the one that joins them.
import { createContext, type ReactNode, useContext } from "react";
import type { Promotion, PromotionStatus } from "@/shared/domain/promotions/index.ts";
import type { PromotionFilterValues } from "./promotion-filters.ts";

export interface PickableRow {
  readonly promotion: Promotion | null;
  readonly status: PromotionStatus;
}

export interface PromotionPicking {
  /** What goes first on a row. Null: it cannot be chosen, and it keeps the usual tick. */
  readonly firstCell: (row: PickableRow) => ReactNode;
  /** What says over the table who is choosing and how to go back. */
  readonly bar?: ReactNode;
  /** The row was already chosen: it stands out. */
  readonly isChosen?: (row: PickableRow) => boolean;
}

export const PromotionPickingContext = createContext<PromotionPicking | null>(null);

export function usePromotionPicking(): PromotionPicking | null {
  return useContext(PromotionPickingContext);
}

/** One brand for one logo: pressing + chooses it and goes back to the flyer. */
export interface OneBrandRequest {
  readonly filters: PromotionFilterValues;
  /** The way back, chosen or not. The brand comes back with what Promociones has chosen now. */
  readonly onBack: (promotion: Promotion | null) => void;
}

export interface PickedBrand {
  readonly logo: string;
  readonly title: string;
}

/** Several brands for a strip: + adds or takes out, in order, until going back. */
export interface ManyBrandsRequest {
  readonly filters: PromotionFilterValues;
  /** What was already chosen on the window. */
  readonly picked: readonly PickedBrand[];
  readonly limit: number;
  /** What is said on reaching the limit. */
  readonly limitNotice: string;
  /** A brand was added: its logo can be brought already. */
  readonly onAdd: (brand: PickedBrand) => void;
  readonly onBack: (picked: readonly PickedBrand[]) => void;
  readonly onCancel: () => void;
}

export interface PromotionPicker {
  readonly pickOneBrand: (request: OneBrandRequest) => void;
  readonly pickManyBrands: (request: ManyBrandsRequest) => void;
  /** What is being chosen is left behind, without saying anything. */
  readonly stopPicking: () => void;
}

export const PromotionPickerContext = createContext<PromotionPicker | null>(null);

export function usePromotionPicker(): PromotionPicker {
  const picker = useContext(PromotionPickerContext);
  if (!picker) throw new Error("usePromotionPicker needs a PromotionPickerContext above it");
  return picker;
}
