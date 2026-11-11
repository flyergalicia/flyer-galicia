// The flyer of a company of the list: what it says comes from its row, never from the form. It is the
// same for Generar flyers and for the ZIP of a Hunter.
import {
  type CashbackConfig,
  cashbackIndex,
  type Company,
  mailFromName,
  officerCount,
  sanitizeCategory,
} from "@/shared/domain/company-registry/index.ts";
import { formatAmount, type FlyerValues } from "@/shared/flyer-engine/index.ts";

const OFFICER_SLOTS = [
  [1, ""],
  [2, "2"],
  [3, "3"],
  [4, "4"],
] as const;

export interface CompanyFlyerContext {
  readonly configs: readonly CashbackConfig[];
  readonly names: readonly string[];
  readonly legal: string;
  /** The flyer draws one cashback amount. */
  readonly singleCashback: boolean;
  /** The flyer carries the sign of the benefit. */
  readonly hasBenefit: boolean;
  /** The cap of whoever has none of their own. */
  readonly formCap: string;
}

export interface CompanyFlyer {
  readonly values: FlyerValues;
  readonly hasNoCashback: boolean;
  readonly hasNoOfficers: boolean;
  /** It had no cap of its own, and it took the one of the form. */
  readonly usedFormCap: boolean;
}

function officerValues(company: Company): Partial<FlyerValues> {
  const values: Partial<FlyerValues> = {};
  for (const [number, suffix] of OFFICER_SLOTS) {
    const officer = company.asesores[number - 1];
    const name = officer?.nombre.trim() ?? "";
    const phone = officer?.celular.trim() ?? "";
    values[`has${number}`] = name !== "";
    values[`nombre${suffix}`] = name;
    values[`celular${suffix}`] = phone ? `Cel: ${phone}` : "";
    values[`email${suffix}`] = name ? officer?.email?.trim() || mailFromName(name) : "";
  }
  return values;
}

function benefitValues(company: Company, formCap: string) {
  const category = sanitizeCategory(company.rubro);
  const cap = formatAmount(category.importe);
  const importe = cap || formCap;
  return {
    usedFormCap: !cap,
    values: {
      benef: true,
      benefNombre: company.empresa,
      importe,
      importe2: formatAmount(category.importe2) || importe,
    },
  };
}

export function companyFlyer(company: Company, context: CompanyFlyerContext): CompanyFlyer {
  const { configs, names, legal, singleCashback, hasBenefit, formCap } = context;
  const index = cashbackIndex(company.config, names);
  const { m1, m2, m3, m4 } = configs[index < 0 ? 0 : index] ?? {};
  const benefit = hasBenefit ? benefitValues(company, formCap) : null;
  return {
    values: {
      empresa: company.empresa,
      nocb: index < 0,
      m1: m1 ?? null,
      m2: m2 ?? null,
      m3: m3 ?? null,
      m4: m4 ?? null,
      legal,
      cashUnico: singleCashback,
      ...officerValues(company),
      ...benefit?.values,
    },
    hasNoCashback: index < 0,
    hasNoOfficers: officerCount(company) === 0,
    usedFormCap: benefit?.usedFormCap ?? false,
  };
}
