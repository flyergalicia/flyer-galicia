// The brake of the sheet: uploading it replaces every company and the base keeps no copies, so what
// goes, enters and changes is shown first. The razón social is the key, not the tax id: two groups
// can share one.
import { type Options, sameCategory } from "./categories.ts";
import { cashbackIndex } from "./cashback.ts";
import { type Company, OFFICERS_PER_COMPANY } from "./company.ts";
import { formatTaxId, normalizeName } from "./text.ts";

export interface ChangedCompany {
  readonly empresa: string;
  readonly que: readonly string[];
}

export interface ImportDifference {
  readonly leaving: readonly string[];
  readonly entering: readonly string[];
  readonly changing: readonly ChangedCompany[];
  readonly same: number;
  readonly current: number;
  readonly incoming: number;
  readonly hasChanges: boolean;
}

export interface DifferenceContext {
  readonly options: Options;
  readonly cashbackNames: readonly string[];
}

function keyOf({ empresa, cuits }: Company): string {
  return normalizeName(empresa) || `#cuit:${cuits.join(",")}`;
}

export function companyLabel({ empresa, cuits }: Pick<Company, "empresa" | "cuits">): string {
  return empresa || `(sin razón social) ${cuits.map(formatTaxId).join(", ")}`;
}

function sortedTaxIds({ cuits }: Company): string {
  return cuits.toSorted().join(",");
}

function sameOfficer(one: Company, other: Company, position: number): boolean {
  const first = one.asesores[position];
  const second = other.asesores[position];
  return (
    (first?.nombre ?? "").trim() === (second?.nombre ?? "").trim() &&
    (first?.celular ?? "").trim() === (second?.celular ?? "").trim() &&
    (first?.email ?? "").trim().toLowerCase() === (second?.email ?? "").trim().toLowerCase()
  );
}

function whatChanged(
  one: Company,
  other: Company,
  { cashbackNames }: DifferenceContext,
): readonly string[] {
  const changes: string[] = [];
  if (sortedTaxIds(one) !== sortedTaxIds(other)) changes.push("CUIT");
  if (cashbackIndex(one.config, cashbackNames) !== cashbackIndex(other.config, cashbackNames)) {
    changes.push("cashback");
  }
  for (let position = 0; position < OFFICERS_PER_COMPANY; position += 1) {
    if (!sameOfficer(one, other, position)) changes.push(`oficial ${String(position + 1)}`);
  }
  if (!sameCategory(one.rubro, other.rubro)) changes.push("rubro");
  return changes;
}

function byKey(rows: readonly Company[]): Map<string, Company[]> {
  const groups = new Map<string, Company[]>();
  for (const row of rows) {
    const key = keyOf(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return groups;
}

interface Tally {
  changing: ChangedCompany[];
  same: number;
}

/** A repeated razón social that changes how many times it is there is said as such. */
function compareGroup(
  before: readonly Company[],
  after: readonly Company[],
  tally: Tally,
  context: DifferenceContext,
): void {
  const first = after[0];
  if (before.length !== after.length && first) {
    tally.changing.push({
      empresa: companyLabel(first),
      que: [`figura ${String(after.length)} veces (antes ${String(before.length)})`],
    });
    return;
  }
  for (const [position, row] of after.entries()) {
    const previous = before[position];
    const changes = previous ? whatChanged(previous, row, context) : [];
    if (changes.length > 0) tally.changing.push({ empresa: companyLabel(row), que: changes });
    else tally.same += 1;
  }
}

export function importDifference(
  current: readonly Company[],
  incoming: readonly Company[],
  context: DifferenceContext,
): ImportDifference {
  const before = byKey(current);
  const after = byKey(incoming);
  const leaving = [...before]
    .filter(([key]) => !after.has(key))
    .flatMap(([, rows]) => rows.map(companyLabel));
  const entering: string[] = [];
  const tally: Tally = { changing: [], same: 0 };
  for (const [key, rows] of after) {
    const previous = before.get(key);
    if (previous) compareGroup(previous, rows, tally, context);
    else entering.push(...rows.map(companyLabel));
  }
  return {
    leaving,
    entering,
    changing: tally.changing,
    same: tally.same,
    current: current.length,
    incoming: incoming.length,
    hasChanges: leaving.length > 0 || entering.length > 0 || tally.changing.length > 0,
  };
}
