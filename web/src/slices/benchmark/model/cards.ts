// Tarjetas y salas VIP: loaded by hand from the official pages of each bank.
import { bankOrder, type PremiumCard } from "./rows.ts";

/** By bank, in the order of the columns, and within it, by the order given. */
export function sortedCards(cards: readonly PremiumCard[]): PremiumCard[] {
  return cards.toSorted(
    (one, other) =>
      bankOrder(one.banco) - bankOrder(other.banco) || (one.orden ?? 0) - (other.orden ?? 0),
  );
}

export interface AnnouncedChange {
  readonly card: PremiumCard;
  /** "18/11/2026", as written. */
  readonly date: string;
}

/** "desde el 18/11/2026" in the validity or the detail: changes that do not apply yet. */
export function announcedChanges(cards: readonly PremiumCard[], today: string): AnnouncedChange[] {
  return cards.flatMap((card) => {
    const text = [card.vigencia, card.salas_vip, card.notas].join(" ");
    for (const match of text.matchAll(/desde el (\d{1,2})\/(\d{1,2})\/(\d{4})/gi)) {
      const [, day = "", month = "", year = ""] = match;
      const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
      if (iso > today) return [{ card, date: `${day}/${month}/${year}` }];
    }
    return [];
  });
}

/** The three that give the most passes. */
export function mostPasses(cards: readonly PremiumCard[]): PremiumCard[] {
  return cards
    .filter((card) => (card.pases_anio ?? 0) > 0)
    .toSorted((one, other) => (other.pases_anio ?? 0) - (one.pases_anio ?? 0))
    .slice(0, 3);
}

/** The one of Galicia with the most passes. */
export function bestOfGalicia(cards: readonly PremiumCard[]): PremiumCard | undefined {
  return mostPasses(cards.filter((card) => card.banco === "galicia")).at(0);
}

/** The longest, for the bars. */
export function mostPassesCount(cards: readonly PremiumCard[]): number {
  return Math.max(...cards.map((card) => card.pases_anio || 0)) || 1;
}

export const TRUST_TEXT: Readonly<Record<string, string>> = {
  oficial: "Página del banco",
  nota: "Nota de prensa o blog",
  sin_dato: "Sin dato firme",
};
