// What the cells of a row say, with their explanations.
import {
  formatDate,
  hasKnownGeography,
  isModoPromotion,
  isNewPromotion,
  promotionLink,
  provinceNamesOf,
  type Promotion,
  type PromotionStatus,
} from "@/shared/domain/promotions/index.ts";
import type { BadgeTone } from "@/shared/ui/index.ts";

const MAX_NAMES = 6;

export interface WhereCell {
  readonly kind: "text" | "online";
  readonly text: string;
  readonly title?: string;
}

const NOT_INFORMED_BY_MODO =
  "MODO no informa en qué locales vale esta promoción: sólo se muestra con Todas las provincias. Mirá los locales en su ficha (Ver en MODO).";

/** "Dónde": a promotion can be in the 24 provinces, so it goes short and the detail on hover. */
export function whereCell(promotion: Promotion | null, totalProvinces: number): WhereCell {
  if (promotion && isModoPromotion(promotion) && !hasKnownGeography(promotion)) {
    return { kind: "text", text: "Sin dato", title: NOT_INFORMED_BY_MODO };
  }
  if (!hasKnownGeography(promotion)) return { kind: "text", text: "-" };
  if (promotion.provincias.length === 0) {
    return {
      kind: "online",
      text: "Online",
      title: "Compra por internet: no tiene local, así que sirve desde cualquier provincia.",
    };
  }
  const names = provinceNamesOf(promotion);
  const full = names.join(", ");
  let text = full;
  if (totalProvinces > 0 && names.length >= totalProvinces) text = "Todo el país";
  else if (names.length > 2) {
    text = `${names.slice(0, 2).join(", ")} y ${String(names.length - 2)} más`;
  }
  return { kind: "text", text, title: full };
}

export function newTagHint(promotion: Promotion): string | null {
  if (!isNewPromotion(promotion)) return null;
  const where = isModoPromotion(promotion) ? "MODO" : "el catálogo de Galicia";
  return `Apareció en ${where} el ${formatDate(promotion.primera_vez?.slice(0, 10))}`;
}

export function modoTagHint(promotion: Promotion): string | null {
  if (!isModoPromotion(promotion)) return null;
  const reach = promotion.solo_galicia
    ? " exclusiva de Galicia"
    : " que vale con Galicia (y otros bancos)";
  return `Promoción de MODO${reach}: se paga con MODO, escaneando el QR o con NFC desde la app de Galicia.`;
}

/** The "+N" of a row that stands for several. */
export function hiddenRowsHint(hidden: number, joinedNames: readonly string[] | null): string {
  const shown = joinedNames ? joinedNames.slice(0, MAX_NAMES) : [];
  const names = joinedNames
    ? ` Se juntaron: ${shown.join(", ")}${joinedNames.length > MAX_NAMES ? "..." : ""}.`
    : "";
  return `Esta marca tiene ${String(hidden + 1)} promociones vigentes (distintas tarjetas, plazos o locales).${names} Se muestra la que vence más tarde; destildá "Una sola fila por marca" para verlas todas.`;
}

export interface LinkCell {
  readonly address: string;
  readonly text: string;
  readonly title: string;
}

/** To the page of the promotion, on another tab: the advisor is in the middle of a flyer. */
export function linkCell(promotion: Promotion | null): LinkCell | null {
  const address = promotionLink(promotion);
  if (!address) return null;
  return isModoPromotion(promotion)
    ? {
        address,
        text: "Ver en MODO",
        title: "Abrir esta promoción en el sitio de MODO (vigencia, días, bancos y letra chica)",
      }
    : {
        address,
        text: "Ver",
        title:
          "Abrir esta promoción en el sitio de Galicia (vigencia, días, tarjetas y letra chica)",
      };
}

export const STATUS_TONE: Readonly<Record<PromotionStatus, BadgeTone>> = {
  VIGENTE: "valid",
  VENCE_ESTE_MES: "ending",
  VENCIDA: "expired",
  REVISAR: "review",
  NO_ENCONTRADA: "none",
  SIN_FECHA: "none",
  FUERA_PROV: "outside",
  PROXIMA: "soon",
};
