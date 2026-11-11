// The flyer bar with many flyers: the first two of the order the administrator made, a third one each
// person chooses with the star ("Tu favorito") and the rest under "Otros". With four or fewer it stays
// as always: all of them in sight.
const FIXED = 2;
const MOST_IN_SIGHT = 4;

export interface BarParts {
  readonly fixed: readonly number[];
  readonly favorite: number | null;
  readonly others: readonly number[];
}

/** Null: all of them in sight. A favorite no longer enabled, or moved up to the fixed, does not count. */
export function barParts(
  allowed: readonly number[],
  favorites: readonly number[],
): BarParts | null {
  if (allowed.length <= MOST_IN_SIGHT) return null;
  const fixed = allowed.slice(0, FIXED);
  const favorite = favorites.find((option) => allowed.indexOf(option) >= FIXED) ?? null;
  return {
    fixed,
    favorite,
    others: allowed.filter((option) => !fixed.includes(option) && option !== favorite),
  };
}

/** One per tab: the star of one does not take away the one of another. */
export function favoritesAfterStar(
  favorites: readonly number[],
  option: number,
  tabOf: (option: number) => string,
): number[] {
  const tab = tabOf(option);
  const rest = favorites.filter((other) => tabOf(other) !== tab);
  return favorites.includes(option) ? rest : [...rest, option];
}

export function favoritesOfProfile(saved: unknown): number[] {
  return Array.isArray(saved) ? saved.map(Number).filter((option) => option > 0) : [];
}

/** What goes in "Otros", in the order of the bar: the favorite also, for its star. */
export function otherFlyersList(allowed: readonly number[], parts: BarParts): readonly number[] {
  return allowed.filter((option) => parts.others.includes(option) || option === parts.favorite);
}

/**
 * The new order of the flyers in sight, in the whole list: those of other tabs and those not in sight
 * stay where they were, and these take turns in their places.
 */
export function orderAfterMoving(
  all: readonly number[],
  inSight: readonly number[],
): readonly number[] {
  let next = 0;
  return all.map((option) => {
    if (!inSight.includes(option)) return option;
    const taken = inSight[next] ?? option;
    next += 1;
    return taken;
  });
}
