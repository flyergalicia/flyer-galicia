// What each tab of the flyer editor draws differently, and which option it opens with.
import {
  type FlyerOption,
  type FlyerTab,
  optionNumber,
  optionTab,
  optionsOfTab,
} from "@/shared/domain/flyer-options.ts";
import type { FlyerValues } from "@/shared/flyer-engine/index.ts";

const FIRST_OPTION = 1;
const DEFAULT_CAP = "$24.000";

/** The amounts of a cashback: of the first configuration, while the form does not choose another. */
export interface CashbackAmounts {
  readonly m1?: string;
  readonly m2?: string;
  readonly m3?: string;
  readonly m4?: string;
}

export function drawsSingleCashback(tab: FlyerTab): boolean {
  return tab === "sueldo";
}

/** The options of a tab this person can use. */
export function allowedOptions(
  options: readonly FlyerOption[],
  tab: FlyerTab,
  can: (key: `opcion_${number}`) => boolean,
): readonly number[] {
  return optionsOfTab(options, tab).filter((option) => can(`opcion_${option}`));
}

/** Everybody starts on option 1 if they have it; if not, on the first one they may use. */
export function firstOptionOf(allowed: readonly number[], remembered?: number): number {
  if (remembered !== undefined && allowed.includes(remembered)) return remembered;
  if (allowed.includes(FIRST_OPTION)) return FIRST_OPTION;
  return allowed[0] ?? FIRST_OPTION;
}

/** The tab an option lives in. */
export function tabOfOption(options: readonly FlyerOption[], option: number): FlyerTab {
  return optionTab(options, optionNumber(options, option));
}

/** What an empty form says: the flyer as it comes, with the first cashback of the list. */
export function emptyFormValues(
  tab: FlyerTab,
  amounts: CashbackAmounts = {},
  cashbackName = "",
): FlyerValues {
  return {
    empresa: "",
    nocb: false,
    config: cashbackName,
    ...amounts,
    sedes: false,
    sedesTit: "",
    benef: tab === "rubros",
    cashUnico: drawsSingleCashback(tab),
    benefNombre: "",
    importe: DEFAULT_CAP,
    importe2: DEFAULT_CAP,
  };
}
