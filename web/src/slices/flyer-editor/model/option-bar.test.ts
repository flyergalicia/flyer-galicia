import { describe, expect, it } from "vitest";
import {
  barParts,
  favoritesAfterStar,
  favoritesOfProfile,
  orderAfterMoving,
  otherFlyersList,
} from "./option-bar.ts";

const FIVE = [2, 3, 4, 5, 6];

describe("the flyer bar with many flyers", () => {
  it("with four or fewer they are all in sight", () => {
    expect(barParts([2, 3, 4, 5], [5])).toBeNull();
    expect(barParts([], [])).toBeNull();
  });

  it("with more, the first two, the favorite and the rest apart", () => {
    expect(barParts(FIVE, [])).toEqual({ fixed: [2, 3], favorite: null, others: [4, 5, 6] });
    expect(barParts(FIVE, [5])).toEqual({ fixed: [2, 3], favorite: 5, others: [4, 6] });
  });

  it("a favorite no longer enabled, or moved up to the fixed, does not count", () => {
    expect(barParts(FIVE, [99])).toEqual({ fixed: [2, 3], favorite: null, others: [4, 5, 6] });
    expect(barParts(FIVE, [3])).toEqual({ fixed: [2, 3], favorite: null, others: [4, 5, 6] });
  });

  it("of several, the first one of this tab that is enabled", () => {
    expect(barParts(FIVE, [99, 3, 6, 5])?.favorite).toBe(6);
  });

  it("the list of Otros has the favorite too, for its star, in the order of the bar", () => {
    const parts = barParts(FIVE, [5]);
    if (!parts) throw new Error("There are no parts");
    expect(otherFlyersList(FIVE, parts)).toEqual([4, 5, 6]);
  });
});

const tabOf = (option: number) => (option >= 10 ? "rubros" : "flyer");

describe("the star", () => {
  it("one per tab: it replaces the one of its tab and leaves the others", () => {
    expect(favoritesAfterStar([5, 13], 6, tabOf)).toEqual([13, 6]);
    expect(favoritesAfterStar([5], 13, tabOf)).toEqual([5, 13]);
  });

  it("on the favorite, it takes it out", () => {
    expect(favoritesAfterStar([5, 13], 5, tabOf)).toEqual([13]);
  });

  it("what the account has is read tolerantly", () => {
    expect(favoritesOfProfile([5, "6", 0, -1, "x"])).toEqual([5, 6]);
    expect(favoritesOfProfile(null)).toEqual([]);
    expect(favoritesOfProfile("5")).toEqual([]);
  });
});

describe("the order after moving one", () => {
  it("what is not in sight stays where it was, and these take turns in their places", () => {
    expect(orderAfterMoving([1, 8, 3, 4, 9], [3, 4, 1])).toEqual([3, 8, 4, 1, 9]);
  });

  it("with nothing moved, the same", () => {
    expect(orderAfterMoving([1, 2, 3], [1, 2, 3])).toEqual([1, 2, 3]);
  });
});
