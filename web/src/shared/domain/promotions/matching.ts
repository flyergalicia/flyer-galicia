// From a brand on a flyer to the promotion of the catalog: they are not always written the same.
import { isModoPromotion, type Promotion } from "./promotion.ts";
import { normalizeText } from "./text.ts";

/** Too generic to hold a match alone: there are dozens of "Golf Club", "Niceto Club", "Hotel...". */
const GENERIC_WORDS: ReadonlySet<string> = new Set([
  "club",
  "hotel",
  "bar",
  "rest",
  "resto",
  "restaurant",
  "restaurante",
  "cafe",
  "coffee",
  "golf",
  "casa",
  "shop",
  "store",
  "tienda",
  "centro",
  "center",
  "grupo",
  "argentino",
  "argentina",
  "sede",
  "local",
  "espacio",
  "salon",
  "studio",
]);

const MIN_CONTAINED_LENGTH = 5;
const MIN_SHARED_WORD_LENGTH = 4;
const SOLID_SCORE = 75;
const AMBIGUOUS_MARGIN = 10;
const MAX_CANDIDATES = 5;

export interface Candidate {
  readonly promotion: Promotion;
  readonly score: number;
}

interface Named {
  readonly normalized: string;
  readonly words: readonly string[];
  readonly joined: string;
}

function namedOf(text: string | null | undefined): Named {
  const normalized = normalizeText(text);
  return {
    normalized,
    words: normalized.split(" ").filter(Boolean),
    joined: normalized.replaceAll(" ", ""),
  };
}

const titles = new WeakMap<Promotion, Named>();

function titleOf(promotion: Promotion): Named {
  const known = titles.get(promotion);
  if (known) return known;
  const named = namedOf(promotion.titulo);
  titles.set(promotion, named);
  return named;
}

const allIn = (words: readonly string[], other: readonly string[]) =>
  words.every((word) => other.includes(word));

/** From the surest to the weakest: the first that holds gives the score. */
const RULES: readonly (readonly [number, (brand: Named, title: Named) => boolean])[] = [
  [100, (brand, title) => title.normalized === brand.normalized],
  [95, (brand, title) => Boolean(brand.joined) && brand.joined === title.joined],
  [85, (brand, title) => brand.words.length > 1 && allIn(brand.words, title.words)],
  [80, (brand, title) => title.words.length > 1 && allIn(title.words, brand.words)],
  [
    75,
    (brand, title) =>
      brand.words.length === 1 && Boolean(title.words[0]) && title.words[0] === brand.words[0],
  ],
  [
    70,
    (brand, title) =>
      brand.joined.length >= MIN_CONTAINED_LENGTH && title.joined.includes(brand.joined),
  ],
  [
    65,
    (brand, title) =>
      title.joined.length >= MIN_CONTAINED_LENGTH && brand.joined.includes(title.joined),
  ],
];

function scoreOfSharedWords(brand: Named, title: Named): number {
  const shared = brand.words.filter(
    (word) =>
      word.length >= MIN_SHARED_WORD_LENGTH &&
      !GENERIC_WORDS.has(word) &&
      title.words.includes(word),
  );
  if (shared.length > 1) return 55;
  return shared.length === 1 ? 40 : 0;
}

function scoreOf(brand: Named, title: Named): number {
  const rule = RULES.find(([, holds]) => holds(brand, title));
  return rule ? rule[0] : scoreOfSharedWords(brand, title);
}

/**
 * Of two promotions of a brand, which serves the flyer better: first the one already running, and
 * then the one that ends later. In a tie, the one of Galicia.
 */
export function isBetterPromotion(one: Promotion, other: Promotion): boolean {
  if (Boolean(one.proximamente) !== Boolean(other.proximamente)) return !one.proximamente;
  const oneEnd = one.fecha_hasta ?? "";
  const otherEnd = other.fecha_hasta ?? "";
  if (oneEnd === otherEnd) return isModoPromotion(other) && !isModoPromotion(one);
  return oneEnd > otherEnd;
}

function beats(one: Candidate, other: Candidate | undefined): boolean {
  if (!other || one.score > other.score) return true;
  return one.score === other.score && isBetterPromotion(one.promotion, other.promotion);
}

/** One candidate per title at most: several promotions of a brand are not competing names. */
export function findCandidates(brand: string, catalog: readonly Promotion[]): Candidate[] {
  const named = namedOf(brand);
  const byTitle = new Map<string, Candidate>();
  for (const promotion of catalog) {
    const title = titleOf(promotion);
    const score = scoreOf(named, title);
    if (score === 0) continue;
    const candidate = { promotion, score };
    if (beats(candidate, byTitle.get(title.normalized))) byTitle.set(title.normalized, candidate);
  }
  return [...byTitle.values()].toSorted((a, b) => b.score - a.score);
}

export interface BrandMatch {
  /** The best one, when there is any. */
  readonly best: Candidate | null;
  /** What to offer on a row that has to be reviewed. */
  readonly candidates: readonly Candidate[];
  /** Two close candidates, or a weak one: the person has to look. */
  readonly needsReview: boolean;
}

export function matchBrand(brand: string, catalog: readonly Promotion[]): BrandMatch {
  const candidates = findCandidates(brand, catalog);
  const [best, second] = candidates;
  if (!best) return { best: null, candidates: [], needsReview: false };
  const isAmbiguous =
    second !== undefined &&
    second.score >= SOLID_SCORE &&
    second.score >= best.score - AMBIGUOUS_MARGIN;
  return {
    best,
    candidates: candidates.slice(0, MAX_CANDIDATES),
    needsReview: isAmbiguous || best.score < SOLID_SCORE,
  };
}

/** The promotions of the catalog by their name. */
export function promotionsByTitle(catalog: readonly Promotion[]): Map<string, Promotion[]> {
  const groups = new Map<string, Promotion[]>();
  for (const promotion of catalog) {
    const { normalized } = titleOf(promotion);
    const list = groups.get(normalized);
    if (list) list.push(promotion);
    else groups.set(normalized, [promotion]);
  }
  return groups;
}

/**
 * All the other promotions of the same brand, the best first. Only with the SAME name: "Farmacity"
 * does not bring "Farmacity.com", which is another brand.
 */
export function siblingPromotions(
  promotion: Promotion,
  byTitle: ReadonlyMap<string, readonly Promotion[]>,
): Promotion[] {
  const same = byTitle.get(titleOf(promotion).normalized) ?? [];
  return same
    .filter(({ id }) => id !== promotion.id)
    .toSorted((a, b) => {
      if (isBetterPromotion(a, b)) return -1;
      return isBetterPromotion(b, a) ? 1 : 0;
    });
}
