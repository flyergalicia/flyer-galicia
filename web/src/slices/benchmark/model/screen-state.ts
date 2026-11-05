// What the screen of Benchmark is showing: the view, the filters, the bank compared, Por comercio
// and the listing of a day. It lives while the tab does; only the reference purchases are remembered.
import { todayWeekday } from "./dates.ts";
import type { BenchFilters } from "./filters.ts";
import { FIRST_FILTERS } from "./filters.ts";
import { readReferences, type ReferencePurchases } from "./reference.ts";
import type { DayPick } from "./week.ts";

export type BenchView = "rubro" | "marca" | "semana" | "comercio" | "versus" | "tarjetas";

export interface ScreenState {
  readonly view: BenchView;
  /** The bank Galicia is compared with. */
  readonly versus: string;
  readonly filters: BenchFilters;
  readonly merchantText: string;
  /** 0 is Monday, -1 any day; null until Por comercio is first shown: then it is today. */
  readonly merchantDay: number | null;
  /** The "Ver las N promos" open on Semana. */
  readonly dayPick: DayPick | null;
  readonly references: ReferencePurchases;
}

export type ScreenAction =
  | { readonly type: "view"; readonly view: BenchView }
  | { readonly type: "versus"; readonly bank: string }
  | { readonly type: "filter"; readonly change: Partial<BenchFilters> }
  | { readonly type: "merchant-text"; readonly text: string }
  | { readonly type: "merchant-day"; readonly day: number }
  | { readonly type: "day-pick"; readonly pick: DayPick }
  | { readonly type: "reference"; readonly references: ReferencePurchases };

export function firstScreen(stored: string | null): ScreenState {
  return {
    view: "rubro",
    versus: "bbva",
    filters: FIRST_FILTERS,
    merchantText: "",
    merchantDay: null,
    dayPick: null,
    references: readReferences(stored),
  };
}

/** Pressing the open one again, or Cerrar, closes it. */
function toggledPick(open: DayPick | null, pick: DayPick): DayPick | null {
  return open?.day === pick.day && open.bank === pick.bank ? null : pick;
}

export function screenReducer(state: ScreenState, action: ScreenAction): ScreenState {
  switch (action.type) {
    case "view":
      return {
        ...state,
        view: action.view,
        dayPick: null,
        merchantDay:
          action.view === "comercio" && state.merchantDay === null
            ? todayWeekday()
            : state.merchantDay,
      };
    case "versus":
      return { ...state, versus: action.bank };
    case "filter":
      return { ...state, filters: { ...state.filters, ...action.change } };
    case "merchant-text":
      return { ...state, merchantText: action.text };
    case "merchant-day":
      return { ...state, merchantDay: action.day };
    case "day-pick":
      return { ...state, dayPick: toggledPick(state.dayPick, action.pick) };
    case "reference":
      return { ...state, references: action.references };
    default:
      return state;
  }
}
