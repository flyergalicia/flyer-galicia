// The sentences the views build, and what the probe lets a test read.
import { describe, expect, it } from "vitest";
import { benchmarkProbe } from "./benchmark-probe.ts";
import type { BenchmarkValue } from "./benchmark-context.ts";
import { dayName } from "./dates.ts";
import { audienceOf, brandIndex, cardTypeOf, FIRST_FILTERS } from "./filters.ts";
import { bestLine, foundLine } from "./merchant.ts";
import { sharedLine } from "./notes.ts";
import { REFERENCE_DEFAULTS } from "./reference.ts";
import type { BenchPromotion } from "./rows.ts";
import { firstScreen } from "./screen-state.ts";
import { dayListing, listingNote, listingTitle, ranked } from "./week.ts";

const TODAY = "2026-10-30";

describe("the sentences", () => {
  it("name the days, and nothing for another number", () => {
    expect(dayName(0)).toBe("Lunes");
    expect(dayName(6)).toBe("Domingo");
    expect(dayName(7)).toBe("");
  });

  it("of a list of the filters fall back to all", () => {
    expect(audienceOf("premium")).toBe("premium");
    expect(audienceOf("otra")).toBe("todos");
    expect(cardTypeOf("american_express")).toBe("american_express");
    expect(cardTypeOf("otra")).toBe("todas");
  });

  it("of a promotion valid with any bank", () => {
    expect(
      sharedLine(
        { beneficio: "15% de reintegro", pct: 15, tope: 5000, tope_por: "month", dias: "Jueves" },
        TODAY,
      ),
    ).toBe(": 15% de reintegro, tope $5.000 por mes · Jueves");
    expect(sharedLine({ pct: 10, fecha_desde: "2026-11-05" }, TODAY)).toBe(
      ": 10% · Empieza el 5/11",
    );
    expect(sharedLine({}, TODAY)).toBe(": ");
  });

  it("of the best one found at a merchant", () => {
    const best = {
      row: { banco: "bbva", titulo: "Coto", tope: 30_000, tope_por: "month" },
      value: 30_000,
    };
    expect(bestLine(best, -1)).toEqual({
      lead: "La que más devuelve:",
      rest: " BBVA · Coto — $30.000 en una compra de referencia (tope $30.000 por mes).",
    });
    expect(bestLine({ row: {}, value: 1 }, 3)).toEqual({
      lead: "La que más devuelve el jueves:",
      rest: "  ·  — $1 en una compra de referencia (sin tope informado).",
    });
    expect(foundLine(2)).toBe(
      "2 promos. «Devuelve» usa la compra de referencia de cada rubro, ajustable arriba.",
    );
    expect(foundLine(151)).toMatch(/^151 promos \(se muestran las primeras 150\)\./);
  });

  it("of the listing of a day", () => {
    expect(listingTitle({ day: 1, bank: "bbva" }, 3)).toBe("BBVA · Martes: 3 promos");
    expect(listingNote(120)).not.toMatch(/Se muestran/);
    expect(listingNote(121)).toMatch(/ Se muestran las primeras 120\.$/);
  });

  it("ranks by what is given back, then by installments", () => {
    const list: BenchPromotion[] = [
      { titulo: "a", banco: "x", pct: 10 },
      { titulo: "b", banco: "x", cuotas: 3 },
      { titulo: "c", banco: "x" },
      { titulo: "d", banco: "x", cuotas: 6 },
    ];
    expect(ranked(list, REFERENCE_DEFAULTS).map(({ row }) => row.titulo)).toEqual([
      "a",
      "d",
      "b",
      "c",
    ]);
    expect(
      dayListing(list, REFERENCE_DEFAULTS, { day: 0, bank: "x" }).map(({ row }) => row.titulo),
    ).toEqual(["a", "d", "b", "c"]);
  });
});

describe("what the probe reads", () => {
  const filtered: BenchPromotion[] = [
    {
      id: "a",
      banco: "galicia",
      titulo: "Coto",
      rubro: "Supermercados",
      pct: 25,
      tope: 10_000,
      fuente: "galicia",
      marca_clave: "coto",
      dias: "Martes",
      bancos_n: 1,
    },
    { id: "b", banco: "bbva", titulo: "Coto", rubro: "Supermercados", cuotas: 12 },
  ];
  const value: BenchmarkValue = {
    screen: firstScreen(null),
    data: { rows: filtered, brands: [], meta: [], handLoaded: [] },
    cards: [],
    brands: brandIndex([]),
    filtered,
    days: { today: TODAY, upcomingLimit: "2026-11-14" },
    isAdmin: true,
  };
  const probe = benchmarkProbe(value);

  it("the promotions that count, as the screen counts them", () => {
    expect(probe.promotions()).toEqual([
      {
        title: "Coto",
        bank: "galicia",
        rubro: "Supermercados",
        source: "galicia",
        days: "Martes",
        brandKey: "coto",
        banksSharing: 1,
        returned: 10_000,
        cap: 10_000,
        audience: "",
      },
      {
        title: "Coto",
        bank: "bbva",
        rubro: "Supermercados",
        source: null,
        days: "",
        brandKey: "",
        banksSharing: null,
        returned: null,
        cap: null,
        audience: "",
      },
    ]);
  });

  it("the best offer of what matches, and the longest installments", () => {
    expect(probe.bestOffer({ bank: "galicia", rubro: "Supermercados", titles: ["Coto"] })).toEqual({
      title: "Coto",
      returned: 10_000,
      cap: 10_000,
      audience: "",
      source: "galicia",
    });
    expect(probe.bestOffer({ bank: "bbva" })).toBeNull();
    expect(probe.bestOffer({ rubro: "Otros" })).toBeNull();
    expect(probe.bestOffer({ titles: ["Otra"] })).toBeNull();
    expect(probe.mostInstallments("bbva")).toBe(12);
    expect(probe.mostInstallments("macro")).toBeNull();
  });

  it("how the screen presents a row", () => {
    expect(
      probe.present({
        fuente: "galicia",
        id: "galicia:g1",
        fecha_desde: "2026-11-10",
        fecha_hasta: "2026-11-10",
        tope: 1,
        tope_por: "total",
      }),
    ).toEqual({
      link: "https://beneficios.galicia.ar/promocion/1",
      schedule: "Sólo el 10/11 (un solo día)",
      cap: "tope $1 en total",
      audience: "",
    });
    expect(FIRST_FILTERS.solo2).toBe(true);
  });
});
