// The flyer of the wrong category. The list says which flyer each company goes in: if it is being
// armed on another one it warns and offers to change, keeping what was loaded. It never stops anyone.
import {
  type Company,
  normalizeName,
  optionOfCategory,
  type Options,
  sanitizeCategory,
  type SearchableCompany,
} from "@/shared/domain/company-registry/index.ts";
import type { FlyerTab } from "@/shared/domain/flyer-options.ts";

export interface CategoryCheckRules {
  readonly options: Options;
  readonly can: (key: `opcion_${number}`) => boolean;
  /** The option on screen, and its tab. */
  readonly option: number;
  readonly tab: FlyerTab;
}

export interface CategoryWarning {
  /** The flyer it goes in; 0 when it has no category and it is being armed on Rubros. */
  readonly wanted: number;
  /** What says it is the same warning. */
  readonly signature: string;
}

/** The real option of a version without cashback; otherwise itself. */
export function baseOption(option: number, options: Options): number {
  const { sinCB = 0 } = options.find(({ n }) => n === option) ?? {};
  return sinCB && options.some(({ n }) => n === sinCB) ? sinCB : option;
}

function wantedOption(company: Pick<Company, "rubro">, rules: CategoryCheckRules): number {
  const { options, can } = rules;
  const option = optionOfCategory(sanitizeCategory(company.rubro), options);
  return option && options.some(({ n }) => n === option) && can(`opcion_${option}`) ? option : 0;
}

/** Null: this is the flyer of this company. */
export function categoryWarning(
  company: SearchableCompany,
  rules: CategoryCheckRules,
): CategoryWarning | null {
  const { option, options, tab } = rules;
  const wanted = wantedOption(company, rules);
  // The version without cashback is "the same one".
  if (wanted === option || (wanted && wanted === baseOption(option, options))) return null;
  // With no category in Flyer Galicia there is nothing to say.
  if (!wanted && tab !== "rubros") return null;
  return {
    wanted,
    signature: `${normalizeName(company.empresa)}|${String(wanted)}|${String(option)}`,
  };
}
