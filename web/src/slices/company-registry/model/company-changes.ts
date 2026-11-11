// What a downloaded flyer changed against the company it came from. The razón social identifies the
// company and is never renamed from here: another name is another company.
import {
  cashbackCell,
  cashbackIndex,
  cashbackName,
  categoryLabel,
  type Company,
  type CompanyCategory,
  type CompanyOfficer,
  mailFromName,
  normalizeName,
  OFFICERS_PER_COMPANY,
  type Options,
  sameCategory,
  sanitizeCategory,
} from "@/shared/domain/company-registry/index.ts";
import type { RichText } from "@/shared/domain/rich-text.ts";

/** What the form of the flyer editor says now. */
export interface FlyerForm {
  readonly empresa: string;
  /** The position of the cashback; -1 is none. */
  readonly cashback: number;
  /** An officer that is off, or all of them with the switch off, count as empty. */
  readonly officers: readonly CompanyOfficer[];
  /** The switch "Mostrar en el flyer". */
  readonly officersShown: boolean;
  /** Only in Flyer Rubros: what its caps say. Null elsewhere: it does not touch the category. */
  readonly category: CompanyCategory | null;
}

export interface ChangeLine {
  readonly text: RichText;
  /** A person who leaves: it goes in red. */
  readonly removal?: boolean;
}

export interface CompanyChange {
  readonly company: Company;
  readonly config: string;
  readonly officers: readonly CompanyOfficer[];
  readonly category: CompanyCategory;
  readonly lines: readonly ChangeLine[];
  readonly cashbackChanged: boolean;
  readonly categoryChanged: boolean;
}

export interface ChangeContext {
  readonly options: Options;
  readonly cashbackNames: readonly string[];
}

const EMPTY = "(vacío)";

function trimmed(officer: CompanyOfficer | undefined): CompanyOfficer {
  return {
    nombre: (officer?.nombre ?? "").trim(),
    celular: (officer?.celular ?? "").trim(),
    email: (officer?.email ?? "").trim(),
  };
}

/** A mail deduced from the name is not a change: every company without one would ask. */
function withoutDeducedMail(now: CompanyOfficer, before: CompanyOfficer): CompanyOfficer {
  return !before.email && now.nombre && now.email && now.email === mailFromName(now.nombre)
    ? { ...now, email: "" }
    : now;
}

function fieldLine(label: string, before: string, after: string): ChangeLine {
  return { text: [`${label}: ${before || EMPTY} → `, { strong: after || EMPTY }] };
}

function officerLines(before: CompanyOfficer, after: CompanyOfficer, number: number): ChangeLine[] {
  const label = `Oficial ${String(number)}`;
  if (!before.nombre && !after.nombre) return [];
  if (!before.nombre) return [{ text: [`${label}: `, { strong: `+ ${after.nombre}` }] }];
  if (!after.nombre) {
    return [
      { text: [`${label}: `, { strong: `− ${before.nombre}` }, " (se quita)"], removal: true },
    ];
  }
  const lines: ChangeLine[] = [];
  if (before.nombre !== after.nombre) {
    lines.push({ text: [`${label}: ${before.nombre} → `, { strong: after.nombre }] });
  }
  if (before.celular !== after.celular) {
    lines.push(fieldLine(`${label} · celular`, before.celular, after.celular));
  }
  if (before.email !== after.email) {
    lines.push(fieldLine(`${label} · mail`, before.email, after.email));
  }
  return lines;
}

/** Null: there is nothing to update. */
export function changeOf(
  company: Company,
  form: FlyerForm,
  { options, cashbackNames }: ChangeContext,
): CompanyChange | null {
  if (normalizeName(form.empresa) !== normalizeName(company.empresa) || !form.empresa.trim()) {
    return null;
  }
  const before = Array.from({ length: OFFICERS_PER_COMPANY }, (_, position) =>
    trimmed(company.asesores[position]),
  );
  const after = Array.from({ length: OFFICERS_PER_COMPANY }, (_, position) =>
    withoutDeducedMail(trimmed(form.officers[position]), before[position] ?? trimmed(undefined)),
  );
  const previous = cashbackIndex(company.config, cashbackNames);
  const cashbackChanged = form.cashback !== previous;
  const categoryChanged = form.category !== null && !sameCategory(form.category, company.rubro);
  const lines: ChangeLine[] = [];
  if (cashbackChanged) {
    lines.push({
      text: [
        `Cashback: ${cashbackName(previous, cashbackNames)} → `,
        { strong: cashbackName(form.cashback, cashbackNames) },
      ],
    });
  }
  for (const [position, officer] of before.entries()) {
    lines.push(...officerLines(officer, after[position] ?? trimmed(undefined), position + 1));
  }
  if (form.category && categoryChanged) {
    lines.push({
      text: [
        `Rubro: ${categoryLabel(company.rubro, options) || "—"} → `,
        { strong: categoryLabel(form.category, options) },
      ],
    });
  }
  if (lines.length === 0) return null;
  return {
    company,
    config: cashbackCell(form.cashback, cashbackNames),
    officers: after,
    category: form.category ?? sanitizeCategory(company.rubro),
    lines,
    cashbackChanged,
    categoryChanged,
  };
}

/** If the person says no and touches nothing else, it does not ask again. */
export function changeSignature({ company, config, officers, category }: CompanyChange): string {
  return `${company.empresa}|${config}|${JSON.stringify(officers)}|${JSON.stringify(category)}`;
}
