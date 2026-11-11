// Which flyer each company gets for a Hunter, agreed with the owner of the product after a Hunter got
// "the old flyer, all off center". Only options enabled for the profile and with a flyer loaded count:
// an option with no picture is not a flyer. Among those, the one in force. With none left, the flyer
// is not made, and the row says why: sending the wrong flyer is worse than sending none.
import { allowedOptions } from "@/shared/lib/flyer-workspace/flyer-tab.ts";
import {
  cashbackIndex,
  categoryOptions,
  type Company,
  type Options,
  kindOfCategory,
  kindOfOption,
  officerCount,
} from "@/shared/domain/company-registry/index.ts";
import {
  currentAmong,
  type FlyerTab,
  optionLabel,
  optionTab,
} from "@/shared/domain/flyer-options.ts";

export const NO_FLYER_ENABLED = 0;
export const CATEGORY_FLYER_NOT_ENABLED = -1;
export const CATEGORY_NOT_KNOWN = -2;

/** The cap of whoever has none of their own, as the template has it. */
export const DEFAULT_CAP = "$24.000";

export interface HunterFlyerRules {
  readonly options: Options;
  readonly cashbackNames: readonly string[];
  readonly can: (key: `opcion_${number}`) => boolean;
  readonly tabLabel: (tab: FlyerTab) => string;
  /** Only a firm yes counts. */
  readonly hasFlyer: (option: number) => boolean | undefined;
}

function usable(option: number, { can, hasFlyer }: HunterFlyerRules): boolean {
  return can(`opcion_${option}`) && hasFlyer(option) === true;
}

/** The option it comes out in. Zero or negative: it cannot be made, and `flyerWarnings` says why. */
export function flyerOfCompany(company: Pick<Company, "rubro">, rules: HunterFlyerRules): number {
  const { options, can } = rules;
  const kind = kindOfCategory(company.rubro, options);
  if (kind) {
    const candidates = categoryOptions(options).filter(
      (option) => kindOfOption(option, options) === kind && usable(option, rules),
    );
    return candidates.length > 0 ? currentAmong(options, candidates) : CATEGORY_FLYER_NOT_ENABLED;
  }
  // It has a category of which nothing can be told: it is not guessed with the general flyer.
  if (company.rubro.opcion) return CATEGORY_NOT_KNOWN;
  const candidates = allowedOptions(options, "flyer", can).filter((option) =>
    usable(option, rules),
  );
  return candidates.length > 0 ? currentAmong(options, candidates) : NO_FLYER_ENABLED;
}

/** "Flyer · Flyer" says nothing. */
export function flyerLabel(option: number, { options, tabLabel }: HunterFlyerRules): string {
  if (option > 0) {
    const tab = tabLabel(optionTab(options, option));
    const name = optionLabel(options, option);
    return tab === name ? tab : `${tab} · ${name}`;
  }
  if (option === CATEGORY_FLYER_NOT_ENABLED) return "sin flyer para su rubro";
  if (option === CATEGORY_NOT_KNOWN) return "rubro sin identificar";
  return "sin flyer habilitado";
}

function whyNoFlyer(option: number): string {
  if (option === CATEGORY_FLYER_NOT_ENABLED) {
    return "el flyer del rubro de esta empresa no está habilitado para tu perfil o todavía no está cargado";
  }
  if (option === CATEGORY_NOT_KNOWN) {
    return "no se puede saber de qué rubro es: hay que revisarla en la base de datos";
  }
  return "no hay ningún flyer habilitado para tu perfil";
}

export function flyerWarnings(
  company: Company,
  option: number,
  { options, cashbackNames }: HunterFlyerRules,
): readonly string[] {
  if (option <= 0) return [whyNoFlyer(option)];
  const hasNoCap = optionTab(options, option) === "rubros" && !company.rubro.importe;
  return [
    ...(officerCount(company) === 0 ? ["el flyer sale sin datos de contacto"] : []),
    ...(cashbackIndex(company.config, cashbackNames) < 0
      ? ["sin cashback: sale sin importes"]
      : []),
    ...(hasNoCap ? [`sin tope cargado: sale ${DEFAULT_CAP}`] : []),
  ];
}

/** The same razón social can be loaded by two officers: it is the owner that tells them apart. */
export function companyKey({ empresa, user_id: owner }: Company): string {
  return `${owner ?? ""}|${empresa}`;
}

/** The officers by name: it tells two loads of the same company apart, and it is what is printed. */
export function officerNames({ asesores }: Pick<Company, "asesores">): string {
  const names = asesores.map(({ nombre }) => nombre.trim()).filter(Boolean);
  return names.length > 0 ? names.join("  ·  ") : "sin oficiales asignados";
}
