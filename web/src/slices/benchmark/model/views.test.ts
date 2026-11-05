// The numbers of each view: summary, brands, week, merchant and Galicia vs X.
import { describe, expect, it } from "vitest";
import { brandRows, MAX_BRAND_ROWS, outcomeCounts } from "./brands.ts";
import { merchantSearch } from "./merchant.ts";
import { REFERENCE_DEFAULTS } from "./reference.ts";
import type { BenchPromotion } from "./rows.ts";
import { bankBars, rubroRows, rubroScore } from "./summary.ts";
import { offerLine, versusOf } from "./versus.ts";
import { dayListing, weekRows } from "./week.ts";

const REFS = REFERENCE_DEFAULTS;

function promo(id: string, fields: BenchPromotion): BenchPromotion {
  return { id, rubro: "Supermercados", dias: "Todos los días", ...fields };
}

const LIST: readonly BenchPromotion[] = [
  promo("g1", {
    banco: "galicia",
    titulo: "Coto",
    marca_clave: "coto",
    pct: 25,
    tope: 10_000,
    dias: "Martes",
    dias_n: [1],
  }),
  promo("b1", { banco: "bbva", titulo: "Coto", marca_clave: "coto", pct: 20, tope: 30_000 }),
  promo("m1", { banco: "macro", titulo: "Coto", marca_clave: "coto", pct: 30, tope: 5000 }),
  promo("g2", {
    banco: "galicia",
    titulo: "Farmacity",
    marca_clave: "farmacity",
    rubro: "Salud y Bienestar",
    pct: 30,
    tope: 15_000,
    dias_n: [0],
  }),
  promo("b2", {
    banco: "bbva",
    titulo: "Farmacity",
    marca_clave: "farmacity",
    rubro: "Salud y Bienestar",
    pct: 20,
    tope: 5000,
    dias_n: [0],
  }),
  promo("s1", {
    banco: "santander",
    titulo: "Fravega",
    marca_clave: "fravega",
    rubro: "Electrónica",
    cuotas: 12,
  }),
  promo("g3", { banco: "galicia", titulo: "Mas Go", marca_clave: "masgo", cuotas: 18 }),
];

describe("Resumen por rubro", () => {
  it("has the rubro with the most promotions first, and the best of each bank", () => {
    const rows = rubroRows(LIST, REFS);
    expect(rows.map(({ rubro }) => rubro)).toEqual([
      "Supermercados",
      "Salud y Bienestar",
      "Electrónica",
    ]);
    const supermarkets = rows[0];
    expect(supermarkets?.top).toBe(30_000);
    expect(supermarkets?.cells.find(({ bank }) => bank === "bbva")?.offer?.value).toBe(30_000);
    expect(supermarkets?.cells.find(({ bank }) => bank === "galicia")?.count).toBe(2);
    expect(supermarkets?.topInstallments).toBe(18);
    expect(rows[2]?.top).toBe(0);
  });

  it("counts the rubros won and lost against the bank compared", () => {
    expect(rubroScore(rubroRows(LIST, REFS), "bbva")).toEqual({
      compared: 2,
      galiciaWins: 1,
      otherWins: 1,
      ties: 0,
    });
    const tie = [
      promo("a", { banco: "galicia", pct: 10, tope: 1000 }),
      promo("b", { banco: "icbc", pct: 10, tope: 1000.5 }),
    ];
    expect(rubroScore(rubroRows(tie, REFS), "icbc").ties).toBe(1);
    expect(rubroScore(rubroRows(tie, REFS), "macro").compared).toBe(0);
  });

  it("draws a bar per bank, as long as its promotions", () => {
    const bars = bankBars(LIST);
    expect(bars.map(({ count }) => count)).toEqual([3, 2, 1, 0, 1, 0]);
    expect(bars[0]?.share).toBe(1);
    expect(bankBars([]).every(({ share }) => share === 0)).toBe(true);
  });
});

describe("Cara a cara por marca", () => {
  const options = { versus: "bbva", search: "", comparableOnly: true, outcome: "" } as const;

  it("puts losses first and names the result", () => {
    const rows = brandRows(LIST, REFS, options);
    expect(rows.map(({ name, result }) => `${name}:${result}`)).toEqual([
      "Coto:pierde",
      "Farmacity:gana",
    ]);
    expect(outcomeCounts(rows)).toEqual({ gana: 1, pierde: 1, empate: 0 });
  });

  it("without comparing only, also the brands of one bank", () => {
    const rows = brandRows(LIST, REFS, { ...options, comparableOnly: false });
    expect(rows.map(({ name, result }) => `${name}:${result}`)).toEqual([
      "Coto:pierde",
      "Farmacity:gana",
      "Fravega:sin",
      "Mas Go:sin",
    ]);
    const onlyOurs = brandRows(
      [promo("x", { banco: "galicia", titulo: "Solo", marca_clave: "solo", pct: 10 })],
      REFS,
      { ...options, comparableOnly: false },
    );
    expect(onlyOurs[0]?.result).toBe("solo");
  });

  it("two banks other than the one compared make a brand comparable if Galicia is one", () => {
    const rows = brandRows(
      [
        promo("a", { banco: "galicia", titulo: "Dia", marca_clave: "dia", pct: 10 }),
        promo("b", { banco: "macro", titulo: "Dia", marca_clave: "dia", pct: 10 }),
        promo("c", { banco: "macro", titulo: "Vea", marca_clave: "vea", pct: 10 }),
        promo("d", { banco: "icbc", titulo: "Vea", marca_clave: "vea", pct: 10 }),
      ],
      REFS,
      options,
    );
    expect(rows.map(({ name }) => name)).toEqual(["Dia"]);
  });

  it("searches by name and filters by outcome, and the counts are of what is left", () => {
    expect(brandRows(LIST, REFS, { ...options, search: "FARMA" }).map(({ name }) => name)).toEqual([
      "Farmacity",
    ]);
    const lost = brandRows(LIST, REFS, { ...options, outcome: "pierde" });
    expect(lost.map(({ name }) => name)).toEqual(["Coto"]);
    expect(outcomeCounts(lost)).toEqual({ gana: 0, pierde: 1, empate: 0 });
  });

  it("ties within a peso", () => {
    const rows = brandRows(
      [
        promo("a", { banco: "galicia", titulo: "Dia", marca_clave: "dia", pct: 10, tope: 1000 }),
        promo("b", { banco: "bbva", titulo: "Dia", marca_clave: "dia", pct: 10, tope: 1000.6 }),
      ],
      REFS,
      options,
    );
    expect(rows[0]?.result).toBe("empate");
    expect(MAX_BRAND_ROWS).toBe(250);
  });
});

describe("Semana", () => {
  it("each day has the best of each bank valid that day", () => {
    const rows = weekRows(LIST, REFS);
    expect(rows.map(({ name }) => name)).toEqual([
      "Lunes",
      "Martes",
      "Miércoles",
      "Jueves",
      "Viernes",
      "Sábado",
      "Domingo",
    ]);
    const monday = rows[0];
    expect(monday?.cells.find(({ bank }) => bank === "galicia")?.offer?.row.titulo).toBe(
      "Farmacity",
    );
    expect(monday?.cells.find(({ bank }) => bank === "galicia")?.count).toBe(2);
    expect(rows[1]?.cells.find(({ bank }) => bank === "galicia")?.count).toBe(2);
    expect(rows[1]?.top).toBe(30_000);
  });

  it("lists every promotion of a bank on a day, the one that gives back most first", () => {
    const listing = dayListing(LIST, REFS, { day: 1, bank: "galicia" });
    expect(listing.map(({ row }) => row.titulo)).toEqual(["Coto", "Mas Go"]);
    const byName = dayListing(
      [
        promo("a", { banco: "bbva", titulo: "Zeta", cuotas: 3 }),
        promo("b", { banco: "bbva", titulo: "Alfa", cuotas: 3 }),
        promo("c", { banco: "bbva", titulo: "Beta", cuotas: 6 }),
      ],
      REFS,
      { day: 4, bank: "bbva" },
    );
    expect(byName.map(({ row }) => row.titulo)).toEqual(["Beta", "Alfa", "Zeta"]);
  });
});

describe("Por comercio", () => {
  it("asks for two letters of a name", () => {
    expect(merchantSearch(LIST, REFS, "c", -1).kind).toBe("too-short");
    expect(merchantSearch(LIST, REFS, "  ", -1).kind).toBe("too-short");
  });

  it("finds by the key of the brand or the title, the best on top", () => {
    const found = merchantSearch(LIST, REFS, "Coto", -1);
    if (found.kind !== "found") throw new Error("Coto not found");
    expect(found.list.map(({ row }) => row.banco)).toEqual(["bbva", "galicia", "macro"]);
    expect(found.best?.row.banco).toBe("bbva");
    const byTitle = merchantSearch(LIST, REFS, "mas g", -1);
    expect(byTitle.kind === "found" && byTitle.list[0]?.row.titulo).toBe("Mas Go");
    expect(byTitle.kind === "found" && byTitle.best).toBeNull();
  });

  it("on a day, only what is valid that day; nothing found says so", () => {
    const thursday = merchantSearch(LIST, REFS, "coto", 3);
    expect(thursday.kind === "found" && thursday.list.length).toBe(2);
    expect(merchantSearch(LIST, REFS, "zzzz", -1).kind).toBe("none");
  });
});

describe("Galicia vs X", () => {
  it("counts promotions, brands won and lost, and rubros", () => {
    const versus = versusOf(LIST, "bbva", REFS);
    expect(versus).toMatchObject({ galiciaCount: 3, otherCount: 2, brands: 2, ties: 0 });
    expect(versus.wins.map(({ name }) => name)).toEqual(["Farmacity"]);
    expect(versus.losses.map(({ name }) => name)).toEqual(["Coto"]);
    expect(versus.rubrosWon).toBe(1);
    expect(versus.rubrosLost).toBe(1);
    expect(
      versus.rubros.find(({ rubro }) => rubro === "Supermercados")?.galiciaInstallments?.cuotas,
    ).toBe(18);
  });

  it("orders wins and losses by the difference", () => {
    const versus = versusOf(
      [
        promo("a", { banco: "galicia", titulo: "A", marca_clave: "a", pct: 10 }),
        promo("b", { banco: "icbc", titulo: "A", marca_clave: "a", pct: 5 }),
        promo("c", { banco: "galicia", titulo: "B", marca_clave: "b", pct: 20 }),
        promo("d", { banco: "icbc", titulo: "B", marca_clave: "b", pct: 5 }),
        promo("e", { banco: "galicia", titulo: "C", marca_clave: "c", pct: 5 }),
        promo("f", { banco: "icbc", titulo: "C", marca_clave: "c", pct: 6 }),
        promo("g", { banco: "galicia", titulo: "D", marca_clave: "d", pct: 5 }),
        promo("h", { banco: "icbc", titulo: "D", marca_clave: "d", pct: 9 }),
        promo("i", { banco: "galicia", titulo: "E", marca_clave: "e", pct: 7 }),
        promo("j", { banco: "icbc", titulo: "E", marca_clave: "e", pct: 7 }),
      ],
      "icbc",
      REFS,
    );
    expect(versus.wins.map(({ name }) => name)).toEqual(["B", "A"]);
    expect(versus.losses.map(({ name }) => name)).toEqual(["D", "C"]);
    expect(versus.ties).toBe(1);
  });

  it("writes an offer with its cap, its days and when it starts", () => {
    const [coto] = LIST;
    if (!coto) throw new Error("no Coto");
    expect(offerLine({ row: { ...coto, tope_por: "month" }, value: 10_000 }, "2026-10-30")).toBe(
      "$10.000 (25 %, tope $10.000 por mes, martes)",
    );
    expect(
      offerLine(
        { row: { pct: 10, dias: "Todos los días", fecha_desde: "2026-11-05" }, value: 5000 },
        "2026-10-30",
      ),
    ).toBe("$5.000 (10 %, sin tope informado, empieza el 5/11)");
  });
});
