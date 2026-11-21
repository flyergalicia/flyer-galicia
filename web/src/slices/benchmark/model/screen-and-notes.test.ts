// What the screen remembers, its dates, the reference purchases and what it warns about the data.
import { describe, expect, it } from "vitest";
import { argentinaDay, shortDate, todayWeekday, validOnDay } from "./dates.ts";
import { brandIndex } from "./filters.ts";
import { hiddenWithoutPlace, othersNote, sharedPromotions } from "./notes.ts";
import { readReferences, REFERENCE_DEFAULTS, referenceOf, typedAmount } from "./reference.ts";
import { bankName, bankOrder, type BenchPromotion } from "./rows.ts";
import { firstScreen, screenReducer } from "./screen-state.ts";

const DAYS = { today: "2026-10-30", upcomingLimit: "2026-11-14" };

describe("the dates", () => {
  it("are those of Argentina", () => {
    const now = Date.parse("2026-10-31T02:00:00Z");
    expect(argentinaDay(0, now)).toBe("2026-10-30");
    expect(argentinaDay(15, now)).toBe("2026-11-14");
  });

  it("are written short", () => {
    expect(shortDate("2026-11-05")).toBe("5/11");
    expect(shortDate("2026-10-30T15:00:00Z")).toBe("30/10");
    expect(shortDate("no es una fecha")).toBe("");
    expect(shortDate(null)).toBe("");
  });

  it("know the day of the week, Monday first", () => {
    expect(todayWeekday(Date.parse("2026-11-02T15:00:00Z"))).toBe(0);
    expect(todayWeekday(Date.parse("2026-11-08T15:00:00Z"))).toBe(6);
    expect(validOnDay([], 3)).toBe(true);
    expect(validOnDay(null, 3)).toBe(true);
    expect(validOnDay([1, 3], 3)).toBe(true);
    expect(validOnDay([1], 3)).toBe(false);
  });
});

describe("the reference purchases", () => {
  it("are the defaults, or what the browser remembers over them", () => {
    expect(readReferences(null)).toEqual(REFERENCE_DEFAULTS);
    expect(readReferences("roto{")).toEqual(REFERENCE_DEFAULTS);
    expect(readReferences("7")).toEqual(REFERENCE_DEFAULTS);
    expect(readReferences('{"Supermercados":20000,"Otros":"x"}')).toEqual({
      ...REFERENCE_DEFAULTS,
      Supermercados: 20_000,
    });
  });

  it("a rubro without its own takes the one of the rest", () => {
    expect(referenceOf(REFERENCE_DEFAULTS, "Combustible")).toBe(60_000);
    expect(referenceOf(REFERENCE_DEFAULTS, "Hogar")).toBe(50_000);
    expect(referenceOf({ ...REFERENCE_DEFAULTS, Combustible: 0 }, "Combustible")).toBe(50_000);
    expect(referenceOf({ Otros: 0 }, null)).toBe(50_000);
  });

  it("what is typed is a whole amount, never negative", () => {
    expect(typedAmount("20000.6")).toBe(20_001);
    expect(typedAmount("-5")).toBe(0);
    expect(typedAmount("")).toBe(0);
  });
});

describe("the banks", () => {
  it("have their name and their column", () => {
    expect(bankName("bbva")).toBe("BBVA");
    expect(bankName("otro")).toBe("otro");
    expect(bankName(null)).toBe("");
    expect(bankOrder("galicia")).toBe(0);
    expect(bankOrder("otro")).toBe(99);
  });
});

describe("what the screen is showing", () => {
  const first = firstScreen(null);

  it("starts on the summary, against BBVA", () => {
    expect(first).toMatchObject({
      view: "rubro",
      versus: "bbva",
      merchantDay: null,
      dayPick: null,
    });
    expect(firstScreen('{"Combustible":1}').references.Combustible).toBe(1);
  });

  it("changing the view closes the listing of a day, and Por comercio starts today", () => {
    const picked = screenReducer(first, { type: "day-pick", pick: { day: 1, bank: "bbva" } });
    expect(picked.dayPick).toEqual({ day: 1, bank: "bbva" });
    const merchant = screenReducer(picked, { type: "view", view: "comercio" });
    expect(merchant.dayPick).toBeNull();
    expect(merchant.merchantDay).toBe(todayWeekday());
    const chosen = screenReducer(merchant, { type: "merchant-day", day: -1 });
    expect(screenReducer(chosen, { type: "view", view: "comercio" }).merchantDay).toBe(-1);
    expect(screenReducer(first, { type: "view", view: "semana" }).merchantDay).toBeNull();
  });

  it("pressing the open listing again closes it; another one opens", () => {
    const pick = { day: 1, bank: "bbva" };
    const open = screenReducer(first, { type: "day-pick", pick });
    expect(screenReducer(open, { type: "day-pick", pick }).dayPick).toBeNull();
    expect(
      screenReducer(open, { type: "day-pick", pick: { day: 2, bank: "bbva" } }).dayPick,
    ).toEqual({ day: 2, bank: "bbva" });
  });

  it("keeps filters, the bank compared, the merchant and the purchases", () => {
    let state = screenReducer(first, { type: "filter", change: { rubro: "Combustible" } });
    state = screenReducer(state, { type: "versus", bank: "macro" });
    state = screenReducer(state, { type: "merchant-text", text: "ypf" });
    state = screenReducer(state, { type: "reference", references: { Otros: 1 } });
    expect(state).toMatchObject({
      filters: { rubro: "Combustible", seg: "todos" },
      versus: "macro",
      merchantText: "ypf",
      references: { Otros: 1 },
    });
  });
});

function of(id: string, fields: BenchPromotion): BenchPromotion {
  return { id, ...fields };
}

function many(count: number): BenchPromotion[] {
  return Array.from({ length: count }, (_unused, index) =>
    of(String(index), { banco: "bbva", fuente: "bbva", rubro: "Otros" }),
  );
}

function shared(id: string, fields: BenchPromotion): BenchPromotion {
  return of(id, { bancos_n: 5, rubro: "Combustible", ...fields });
}

describe("what it warns about the data", () => {
  const brands = brandIndex([{ marca_clave: "coto", provincias: ["CAPITAL FEDERAL"] }]);

  it("with a province, how many of MODO are hidden for lack of places, by bank", () => {
    const rows = [
      of("a", { banco: "macro" }),
      of("b", { banco: "macro", fuente: "modo" }),
      of("c", { banco: "bbva" }),
      of("d", { banco: "macro", marca_clave: "coto" }),
      of("e", { banco: "macro", fuente: "macro" }),
      of("f", { banco: "macro", proximamente: true }),
      of("g", { banco: "macro", fecha_hasta: "2020-01-01" }),
      of("h", { banco: "otro" }),
    ];
    expect(hiddenWithoutPlace(rows, brands, "SALTA", DAYS.today)).toEqual(["BBVA 1", "Macro 2"]);
    expect(hiddenWithoutPlace(rows, brands, "", DAYS.today)).toEqual([]);
  });

  it("warns of BBVA without rubro only past 50", () => {
    expect(othersNote(many(50))).toBe("");
    expect(othersNote(many(51))).toMatch(/^La web de BBVA no informa el rubro de sus promos: 51 /);
  });

  it("lists the shared ones once, the highest percent first", () => {
    const rows = [
      shared("galicia:w", { banco: "galicia", pct: 15 }),
      shared("bbva:w", { banco: "bbva", pct: 15 }),
      shared("galicia:y", { pct: 30 }),
      shared("galicia:old", { fecha_hasta: "2020-01-01" }),
      shared("galicia:far", { fecha_desde: "2026-12-30" }),
      shared("galicia:soon", { fecha_desde: "2026-11-10", pct: 1 }),
      shared("galicia:super", { rubro: "Supermercados" }),
      of("galicia:own", { pct: 90 }),
    ];
    expect(sharedPromotions(rows, { rubro: "" }, DAYS).map(({ id }) => id)).toEqual([
      "galicia:y",
      "galicia:w",
      "galicia:soon",
      "galicia:super",
    ]);
    expect(sharedPromotions(rows, { rubro: "Supermercados" }, DAYS)).toHaveLength(1);
  });
});
