// Where each bank comes from and when it was read: the labels on top. MODO for everybody; some banks
// add their own website, and Santander and Macro are loaded once a month by the assisted load.
import { shortDate } from "./dates.ts";
import { isCurrentHandLoaded } from "./hand-loaded.ts";
import { BANKS, type HandLoadedPromotion, type SourceMeta } from "./rows.ts";

const DAY_MS = 86_400_000;
const STALE_DAYS = 10;
const STALE_DAYS_MONTHLY = 35;
const BLOCKED = /bloquea/i;
const MONTHLY_LOAD = /^carga (asistida|mensual)$/;

export interface SourceLabel {
  readonly bank: string;
  readonly name: string;
  /** "vía MODO · act. 30/10", without the name. */
  readonly detail: string;
  /** Too long since it was read. */
  readonly stale: boolean;
  /** What shows on hovering: the last error, or where it comes from. */
  readonly title: string;
  /** It has an error: the label carries a ⚠. */
  readonly warns: boolean;
}

function isQuietError(error: string): boolean {
  return BLOCKED.test(error) || MONTHLY_LOAD.test(error);
}

function sourceText(hasWebsite: boolean, monthly: boolean, blocked: boolean): string {
  if (hasWebsite) return monthly ? "MODO + web propia (carga asistida)" : "MODO + web propia";
  return blocked ? "vía MODO · su web se carga una vez por mes (pendiente)" : "vía MODO";
}

function handLoadedText(count: number): string {
  if (count === 0) return "";
  return ` · ${String(count)}${count > 1 ? " cargadas" : " cargada"} a mano`;
}

interface LabelInputs {
  readonly modo: SourceMeta | undefined;
  readonly website: SourceMeta | undefined;
  readonly handLoaded: number;
  readonly now: number;
}

/** The oldest of the dates it was read: by MODO, and by its website if that worked. */
function oldestRead(
  modo: SourceMeta | undefined,
  website: SourceMeta | undefined,
): string | undefined {
  const usable = [modo, website?.last_sync_at ? website : undefined];
  return usable.flatMap((meta) => (meta?.last_sync_at ? [meta.last_sync_at] : [])).toSorted()[0];
}

/** The first error worth telling: not that a website blocks, nor the monthly load. */
function firstError(modo: SourceMeta | undefined, website: SourceMeta | undefined): string {
  return (
    [modo, website].flatMap((meta) =>
      meta?.error && !isQuietError(meta.error) ? [meta.error] : [],
    )[0] ?? ""
  );
}

function labelOf(bank: string, name: string, inputs: LabelInputs): SourceLabel {
  const { modo, website, handLoaded, now } = inputs;
  const blocked = BLOCKED.test(website?.error ?? "");
  const hasWebsite = Boolean(website?.last_sync_at);
  const monthly = hasWebsite && (MONTHLY_LOAD.test(website?.error ?? "") || blocked);
  const oldest = oldestRead(modo, website);
  const error = firstError(modo, website);
  const limit = (monthly ? STALE_DAYS_MONTHLY : STALE_DAYS) * DAY_MS;
  const source = sourceText(hasWebsite, monthly, blocked);
  const read = oldest ? shortDate(oldest) : "sin datos";
  return {
    bank,
    name,
    detail: ` · ${source}${handLoadedText(handLoaded)} · act. ${read}${error ? " ⚠" : ""}`,
    stale: !modo?.last_sync_at || now - new Date(oldest ?? "").getTime() > limit,
    title: error ? `Último error: ${error}` : source,
    warns: Boolean(error),
  };
}

/** One label per bank, in the order of the columns. */
export function sourceLabels(
  meta: readonly SourceMeta[],
  handLoaded: readonly HandLoadedPromotion[],
  today: string,
  now: number = Date.now(),
): SourceLabel[] {
  const byBank = new Map(meta.map((entry) => [entry.banco, entry]));
  return BANKS.map(({ code, name }) =>
    labelOf(code, name, {
      modo: byBank.get(code),
      website: byBank.get(`${code}_web`),
      handLoaded: handLoaded.filter(
        (promotion) => promotion.banco === code && isCurrentHandLoaded(promotion, today),
      ).length,
      now,
    }),
  );
}
