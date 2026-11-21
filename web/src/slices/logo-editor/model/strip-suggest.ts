// "Sugerir marcas" fills the places that are left with brands valid in the chosen zone. The owner
// approved the criteria: those of a place before those online, one per brand, a variety of categories
// by turns, those that expire later first and a bit more weight for the new ones.
import { isOnlinePromotion, type Promotion } from "@/shared/domain/promotions/index.ts";

const DAY_MS = 86_400_000;
const NOT_ONLINE = 100;
const DAYS_WHEN_UNKNOWN = 30;
const MOST_DAYS = 60;
const NEW_POINTS = 15;
const NEW_DAYS = 7;
const TIE_RANGE = 1000;
/** How far it looks beyond what it needs: some logo may not come down. */
const EXTRA_CANDIDATES = 4;

function daysLeft({ fecha_hasta: end }: Promotion, today: Date): number {
  if (!end) return DAYS_WHEN_UNKNOWN;
  const date = new Date(`${end}T23:59:59`);
  return Number.isNaN(date.getTime())
    ? DAYS_WHEN_UNKNOWN
    : Math.round((date.getTime() - today.getTime()) / DAY_MS);
}

function isRecent({ primera_vez: first }: Promotion, today: Date): boolean {
  if (!first) return false;
  const date = new Date(first);
  return !Number.isNaN(date.getTime()) && today.getTime() - date.getTime() <= NEW_DAYS * DAY_MS;
}

/** Under one point: random but fixed in the day, so that the ones with A do not always win a tie. */
function tieOf(title: string, today: Date): number {
  let hash = 0;
  for (const letter of `${title}${today.toDateString()}`) {
    hash = Math.trunc(hash * 31 + (letter.codePointAt(0) ?? 0)) | 0;
  }
  return Math.abs(hash % TIE_RANGE) / TIE_RANGE;
}

export function pointsOf(promotion: Promotion, today: Date): number {
  return (
    (isOnlinePromotion(promotion) ? 0 : NOT_ONLINE) +
    Math.max(0, Math.min(MOST_DAYS, daysLeft(promotion, today))) +
    (isRecent(promotion, today) ? NEW_POINTS : 0) +
    tieOf(promotion.titulo, today)
  );
}

/** By turns: the best of each category, then the second of each one… */
export function suggestionOrder(list: readonly Promotion[], today: Date): readonly Promotion[] {
  const categories = new Map<string, Promotion[]>();
  const sorted = list.toSorted((one, other) => pointsOf(other, today) - pointsOf(one, today));
  for (const promotion of sorted) {
    const category = promotion.subtitulo || "otros";
    categories.set(category, [...(categories.get(category) ?? []), promotion]);
  }
  const groups = [...categories.values()];
  const most = Math.max(0, ...groups.map(({ length }) => length));
  return Array.from({ length: most }, (_turn, turn) =>
    groups.flatMap((group) => {
      const promotion = group[turn];
      return promotion ? [promotion] : [];
    }),
  ).flat();
}

export function candidatesFor(
  list: readonly Promotion[],
  missing: number,
  today: Date,
): readonly Promotion[] {
  return suggestionOrder(list, today).slice(0, missing * 2 + EXTRA_CANDIDATES);
}
