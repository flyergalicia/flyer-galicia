import { describe, expect, it } from "vitest";
import {
  cleanTitle,
  NO_TITLES,
  orderTabs,
  readScreenTitles,
  screenTitlesFile,
  titleOf,
} from "./screen-titles.ts";

describe("the names of the screens", () => {
  it("are the ones of the app until someone changes them", () => {
    expect(titleOf(NO_TITLES, "flyer")).toBe("Flyer Galicia");
    expect(titleOf(readScreenTitles({ flyer: "Otro" }), "flyer")).toBe("Otro");
    expect(titleOf(readScreenTitles({ flyer: "   " }), "flyer")).toBe("Flyer Galicia");
  });

  it("only read what they know, and clean it", () => {
    const { names } = readScreenTitles({
      promos: ` <b>Promos</b> `,
      inventado: "x",
      estudio: 3,
    });

    expect(names).toEqual({ promos: "bPromos/b" });
    expect(cleanTitle("x".repeat(60))).toHaveLength(40);
  });

  it("do not break with a file that is not an object", () => {
    expect(readScreenTitles(null)).toEqual(NO_TITLES);
    expect(readScreenTitles("texto")).toEqual(NO_TITLES);
  });
});

describe("the order of the tabs", () => {
  const TABS = ["flyer", "rubros", "promos", "estudio"];

  it("stays as it is by default", () => {
    expect(orderTabs(TABS, null)).toEqual(TABS);
    expect(orderTabs(TABS, [])).toEqual(TABS);
  });

  it("follows what was saved, and the new ones go last", () => {
    expect(orderTabs(TABS, ["promos", "flyer"])).toEqual(["promos", "flyer", "rubros", "estudio"]);
  });

  it("reads only ids and only a few of them", () => {
    expect(readScreenTitles({ orden: ["promos", 3, "con espacio"] }).order).toEqual(["promos"]);
    expect(readScreenTitles({ orden: "promos" }).order).toBeNull();
    const many = Array.from({ length: 20 }, (_, index) => `t${String(index)}`);
    expect(readScreenTitles({ orden: many }).order).toHaveLength(12);
  });
});

describe("the file", () => {
  const NOW = new Date("2026-10-30T12:00:00Z");

  it("keeps the names and the order, with the date", () => {
    const text = screenTitlesFile({ names: { promos: "Promos" }, order: ["promos"] }, NOW);

    expect(JSON.parse(text)).toEqual({
      promos: "Promos",
      orden: ["promos"],
      updated_at: "2026-10-30T12:00:00.000Z",
    });
  });

  it("has no order if it was never moved", () => {
    expect(JSON.parse(screenTitlesFile(NO_TITLES, NOW))).toEqual({
      updated_at: "2026-10-30T12:00:00.000Z",
    });
  });
});
