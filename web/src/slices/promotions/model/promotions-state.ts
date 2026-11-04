// What the screen of Promociones remembers, and how it changes.
import { validProvinces } from "@/shared/domain/promotions/index.ts";
import type { PromotionsTab } from "../promotions-tab.ts";
import { type ResultRow, withStartDates, withStatusesOf } from "./result-rows.ts";
import {
  keepTicks,
  NATURAL_ORDER,
  NO_FILTERS,
  nextOrder,
  orderOfKey,
  type SortField,
  type TableFilters,
  type TableOrder,
} from "./table.ts";

export interface PromotionsState {
  readonly tab: PromotionsTab;
  /** Several go joined by ";". Empty: all of them. */
  readonly province: string;
  readonly locality: string;
  readonly category: string;
  /** What Galicia answered for the locality. */
  readonly localityIds: readonly (string | number)[] | null;
  readonly filters: TableFilters;
  readonly order: TableOrder;
  readonly rows: readonly ResultRow[] | null;
  readonly monthRef: Date | null;
  readonly brandsText: string;
  /** aaaa-mm. */
  readonly month: string;
  /** What the buttons say while they work; empty when they are free. */
  readonly validateWork: string;
  readonly listWork: string;
  readonly isUpdatingCatalog: boolean;
  readonly isDownloading: boolean;
  /** How many dates of start are waiting for a yes. */
  readonly startDatesToConfirm: number | null;
}

export type PromotionsAction =
  | { readonly type: "tab"; readonly tab: PromotionsTab }
  | { readonly type: "province"; readonly value: string }
  | { readonly type: "locality"; readonly value: string }
  | { readonly type: "category"; readonly value: string }
  | { readonly type: "locality-ids"; readonly ids: readonly (string | number)[] }
  | {
      readonly type: "provinces-known";
      readonly provinces: readonly string[];
      readonly usable: boolean;
    }
  | { readonly type: "filters"; readonly change: Partial<TableFilters> }
  | { readonly type: "clear-filters" }
  | { readonly type: "sort-by"; readonly field: SortField }
  | { readonly type: "order"; readonly key: string }
  | { readonly type: "results"; readonly rows: readonly ResultRow[]; readonly monthRef: Date }
  | { readonly type: "rows"; readonly rows: readonly ResultRow[] }
  | { readonly type: "recalculate" }
  | { readonly type: "start-dates"; readonly dates: Readonly<Record<string, string | null>> }
  | { readonly type: "excluded"; readonly key: number; readonly excluded: boolean }
  | { readonly type: "brands"; readonly text: string }
  | { readonly type: "month"; readonly value: string }
  | { readonly type: "validate-work"; readonly text: string }
  | { readonly type: "list-work"; readonly text: string }
  | { readonly type: "updating-catalog"; readonly on: boolean }
  | { readonly type: "downloading"; readonly on: boolean }
  | { readonly type: "confirm-start-dates"; readonly count: number | null };

function currentMonth(now: Date): string {
  return `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function initialPromotionsState(now: Date = new Date()): PromotionsState {
  return {
    tab: "search",
    province: "",
    locality: "",
    category: "",
    localityIds: null,
    filters: NO_FILTERS,
    order: NATURAL_ORDER,
    rows: null,
    monthRef: null,
    brandsText: "",
    month: currentMonth(now),
    validateWork: "",
    listWork: "",
    isUpdatingCatalog: false,
    isDownloading: false,
    startDatesToConfirm: null,
  };
}

function changesOfPlace(state: PromotionsState, action: PromotionsAction): PromotionsState | null {
  switch (action.type) {
    case "province":
      return { ...state, province: action.value, locality: "", localityIds: null };
    case "locality":
      return { ...state, locality: action.value, localityIds: null };
    case "category":
      return { ...state, category: action.value };
    case "locality-ids":
      return { ...state, localityIds: action.ids };
    case "provinces-known":
      if (!action.usable) return { ...state, province: "" };
      return state.province && action.provinces.length > 0
        ? { ...state, province: validProvinces(state.province, action.provinces) }
        : state;
    default:
      return null;
  }
}

function changesOfTable(state: PromotionsState, action: PromotionsAction): PromotionsState | null {
  switch (action.type) {
    case "tab":
      return {
        ...state,
        tab: action.tab,
        rows: null,
        localityIds: null,
        filters: keepTicks(state.filters),
        order: NATURAL_ORDER,
      };
    case "filters":
      return { ...state, filters: { ...state.filters, ...action.change } };
    case "clear-filters":
      return { ...state, filters: NO_FILTERS };
    case "sort-by":
      return { ...state, order: nextOrder(state.order, action.field) };
    case "order":
      return { ...state, order: orderOfKey(action.key) };
    case "results":
      return {
        ...state,
        rows: action.rows,
        monthRef: action.monthRef,
        filters: keepTicks(state.filters),
        order: NATURAL_ORDER,
      };
    default:
      return null;
  }
}

function changesOfRows(state: PromotionsState, action: PromotionsAction): PromotionsState | null {
  switch (action.type) {
    case "rows":
      return { ...state, rows: action.rows };
    case "recalculate":
      return state.rows && state.monthRef
        ? { ...state, rows: withStatusesOf(state.rows, state.province, state.monthRef) }
        : state;
    case "start-dates":
      return state.rows ? { ...state, rows: withStartDates(state.rows, action.dates) } : state;
    case "excluded":
      return state.rows
        ? {
            ...state,
            rows: state.rows.map((row) =>
              row.key === action.key ? { ...row, excluded: action.excluded } : row,
            ),
          }
        : state;
    default:
      return null;
  }
}

function changesOfWork(state: PromotionsState, action: PromotionsAction): PromotionsState {
  switch (action.type) {
    case "brands":
      return { ...state, brandsText: action.text };
    case "month":
      return { ...state, month: action.value };
    case "validate-work":
      return { ...state, validateWork: action.text };
    case "list-work":
      return { ...state, listWork: action.text };
    case "updating-catalog":
      return { ...state, isUpdatingCatalog: action.on };
    case "downloading":
      return { ...state, isDownloading: action.on };
    case "confirm-start-dates":
      return { ...state, startDatesToConfirm: action.count };
    default:
      return state;
  }
}

export function promotionsReducer(
  state: PromotionsState,
  action: PromotionsAction,
): PromotionsState {
  return (
    changesOfPlace(state, action) ??
    changesOfTable(state, action) ??
    changesOfRows(state, action) ??
    changesOfWork(state, action)
  );
}
