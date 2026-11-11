// Which flyer each company comes out in, from its own row and not from the screen: a batch of 180
// flyers cannot depend on where the person was standing.
import { currentAmong, optionLabel, optionTab } from "@/shared/domain/flyer-options.ts";
import type { FlyerTab } from "@/shared/domain/flyer-options.ts";
import { cashbackIndex } from "./cashback.ts";
import { type Options, optionOfCategory } from "./categories.ts";
import { type Company, officerCount, sanitizeCategory } from "./company.ts";

export interface DestinationRules {
  readonly options: Options;
  readonly cashbackNames: readonly string[];
  readonly can: (key: `opcion_${number}`) => boolean;
  readonly tabLabel: (tab: FlyerTab) => string;
  /** Whether that option has a flyer; undefined when nobody knows yet. */
  readonly hasFlyer: (option: number) => boolean | undefined;
}

function isKnown(option: number, options: Options): boolean {
  return options.some(({ n }) => n === option);
}

/** The version without cashback of an option, which this profile can see; 0 when there is none. */
export function versionWithoutCashback(option: number, rules: DestinationRules): number {
  if (!option) return 0;
  const { options, can, hasFlyer } = rules;
  return (
    options.find(({ n, sinCB }) => sinCB === option && can(`opcion_${n}`) && hasFlyer(n) !== false)
      ?.n ?? 0
  );
}

function generalFlyer({ options, can, hasFlyer }: DestinationRules): number {
  // Without the options known to have no image ("VIEJO…", "Sin cashback" that are empty).
  const pool = options
    .filter(({ n, solapa, sinCB }) => can(`opcion_${n}`) && solapa === "flyer" && !sinCB)
    .map(({ n }) => n);
  const withFlyer = pool.filter((n) => hasFlyer(n) !== false);
  return currentAmong(options, withFlyer.length > 0 ? withFlyer : pool);
}

function baseDestination(company: Pick<Company, "rubro">, rules: DestinationRules): number {
  const option = optionOfCategory(sanitizeCategory(company.rubro), rules.options);
  if (!option) return generalFlyer(rules);
  return isKnown(option, rules.options) && rules.can(`opcion_${option}`) ? option : -option;
}

/**
 * The option it comes out in. Negative: it has a category, but that flyer is not for this profile.
 * Zero: this profile has no option at all.
 */
export function destinationOf(
  company: Pick<Company, "rubro" | "config">,
  rules: DestinationRules,
): number {
  const option = baseDestination(company, rules);
  if (option > 0 && cashbackIndex(company.config, rules.cashbackNames) < 0) {
    return versionWithoutCashback(option, rules) || option;
  }
  return option;
}

export function destinationLabel(
  option: number,
  rules: Pick<DestinationRules, "options" | "tabLabel">,
): string {
  if (option <= 0) return "sin formato disponible";
  const { options, tabLabel } = rules;
  return `${tabLabel(optionTab(options, option))} · ${optionLabel(options, option)}`;
}

/** What is worth knowing before generating a company. */
export function destinationWarnings(
  company: Company,
  option: number,
  rules: DestinationRules,
): readonly string[] {
  const { options, cashbackNames } = rules;
  const warnings: string[] = [];
  if (option < 0) {
    // The second reason is not the first one: the label of a flyer that is gone says anything.
    warnings.push(
      isKnown(-option, options)
        ? `rubro «${optionLabel(options, -option)}» no habilitado para tu perfil`
        : "el flyer de su rubro ya no está: revisá el rubro de esta empresa",
    );
  } else if (option === 0) {
    warnings.push("sin opción habilitada");
  }
  if (officerCount(company) === 0) warnings.push("sin oficiales");
  if (cashbackIndex(company.config, cashbackNames) < 0) warnings.push("sin cashback");
  if (option > 0 && optionTab(options, option) === "rubros" && !company.rubro.importe) {
    warnings.push("sin tope (se usa el del formulario o $24.000)");
  }
  return warnings;
}
