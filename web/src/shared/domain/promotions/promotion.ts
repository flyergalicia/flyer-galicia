// One promotion of the catalog, with the columns of its table: they are a contract with the base.
import { decodeEntities } from "./text.ts";

export interface Promotion {
  /** A number in Galicia; "m:<uuid>" in MODO. */
  readonly id: number | string;
  readonly titulo: string;
  readonly subtitulo?: string | null;
  readonly imagen?: string | null;
  readonly fecha_hasta?: string | null;
  readonly fecha_desde?: string | null;
  readonly tipo_promocion?: string | null;
  /** A list of names; empty: verified to have no stores, it is bought online; null: not known. */
  readonly provincias?: readonly string[] | null;
  /** Only MODO: "PROVINCIA|LOCALIDAD". */
  readonly localidades?: readonly string[] | null;
  readonly primera_vez?: string | null;
  readonly proximamente?: boolean | null;
  readonly dias?: string | null;
  readonly beneficio?: string | null;
  readonly aclaracion?: string | null;
  readonly slug?: string | null;
  readonly solo_galicia?: boolean | null;
  readonly origen?: "modo";
}

const LOGO_BASE =
  "https://www.galicia.ar/content/dam/galicia/banco-galicia/personas/promociones/catalogo-de-beneficios/";
const DETAIL_BASE = "https://beneficios.galicia.ar/promocion/";
const MODO_BASE = "https://www.modo.com.ar/promos/";
const BUCKET_LOGOS = "modo/";
const SUPERMARKET = /supermercado/i;
const DAY_MS = 86_400_000;

export const NEW_PROMOTION_DAYS = 7;

/** A logo copied to our bucket. */
export type BucketLogo = `${typeof BUCKET_LOGOS}${string}`;

function isBucketLogo(image: string): image is BucketLogo {
  return image.startsWith(BUCKET_LOGOS);
}

export function isModoPromotion(promotion: Promotion | null | undefined): boolean {
  return promotion?.origen === "modo";
}

/**
 * Where the logo of a promotion lives: those of Galicia on its site; those of MODO in our bucket,
 * because the ones of MODO cannot be drawn on a PDF (invariant 26). Whatever shows or downloads a
 * logo goes through here.
 */
export function promotionLogoSource(
  image: string | null | undefined,
  bucketUrl: (file: BucketLogo) => string,
): string {
  if (!image) return "";
  return isBucketLogo(image) ? bucketUrl(image) : LOGO_BASE + image;
}

/**
 * The public page of a promotion. In Galicia the id is what counts: the title only shows on the
 * heading of that page, so accents or an "&" do not break it.
 */
export function promotionLink(promotion: Promotion | null | undefined): string {
  if (!promotion?.id) return "";
  if (isModoPromotion(promotion)) {
    return promotion.slug ? MODO_BASE + encodeURIComponent(promotion.slug) : "";
  }
  const title = decodeEntities(promotion.titulo);
  const kind = promotion.tipo_promocion || "Marca";
  return `${DETAIL_BASE}${encodeURIComponent(promotion.id)}|${encodeURIComponent(title)}|${encodeURIComponent(kind)}`;
}

/** It appeared in the catalog in the last days. Without the date, it was there before counting. */
export function isNewPromotion(
  promotion: Promotion | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!promotion?.primera_vez) return false;
  const first = Date.parse(promotion.primera_vez);
  return Number.isFinite(first) && now - first < NEW_PROMOTION_DAYS * DAY_MS;
}

export function isSupermarket(promotion: Promotion | null | undefined): boolean {
  return SUPERMARKET.test(decodeEntities(promotion?.subtitulo));
}

/** On the table each row is one promotion: Coto 25% has the dot, Coto in installments does not. */
export function promotionHasPercent(promotion: Promotion | null | undefined): boolean {
  return isSupermarket(promotion) && (promotion?.beneficio ?? "").includes("%");
}

/** "25% de ahorro", without the final point. */
export function benefitText(promotion: Promotion | null | undefined): string {
  return decodeEntities(promotion?.beneficio)
    .replace(/\s+/g, " ")
    .replace(/[.\s]+$/, "")
    .trim();
}

/** What MODO says when it is a real restriction: "only oil change". */
export function promotionNote(promotion: Promotion | null | undefined): string {
  return (promotion?.aclaracion ?? "").replace(/\s+/g, " ").trim();
}

/** The promotion that uses that logo: look on the whole catalog, with MODO (invariant 26). */
export function promotionOfLogo(
  catalog: readonly Promotion[] | null | undefined,
  image: string,
): Promotion | null {
  return catalog?.find(({ imagen }) => imagen === image) ?? null;
}
