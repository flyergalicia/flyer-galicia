// Tarjetas y salas VIP, and the windows of a card and of a promotion loaded by hand.
import { describe, expect, it } from "vitest";
import { cardTexts, checkCard, isWideField, CARD_FIELDS } from "./card-form.ts";
import {
  announcedChanges,
  bestOfGalicia,
  mostPasses,
  mostPassesCount,
  sortedCards,
} from "./cards.ts";
import { checkHandLoaded, handLoadedTexts, rubroChoices } from "./hand-loaded-form.ts";
import type { PremiumCard } from "./rows.ts";

const TODAY = "2026-10-30";

function card(id: string, banco: string, fields: Partial<PremiumCard> = {}): PremiumCard {
  return { id, banco, tarjeta: `Tarjeta ${id}`, ...fields };
}

describe("the cards", () => {
  const cards = [
    card("m1", "macro", { orden: 10, pases_anio: 10, paquete: "Selecta" }),
    card("g2", "galicia", { orden: 20, pases_anio: 2 }),
    card("g1", "galicia", { orden: 10, pases_anio: 4, paquete: "Éminent" }),
    card("x", "otro", { pases_anio: null }),
    card("b1", "bbva", { pases_anio: 20 }),
  ];

  it("go by bank, in the order of the columns, then by their order", () => {
    expect(sortedCards(cards).map(({ id }) => id)).toEqual(["g1", "g2", "b1", "m1", "x"]);
  });

  it("the three that give the most passes, and the one of Galicia", () => {
    expect(mostPasses(cards).map(({ id }) => id)).toEqual(["b1", "m1", "g1"]);
    expect(bestOfGalicia(cards)?.id).toBe("g1");
    expect(bestOfGalicia([card("b", "bbva", { pases_anio: 3 })])).toBeUndefined();
    expect(mostPassesCount(cards)).toBe(20);
    expect(mostPassesCount([card("a", "bbva")])).toBe(1);
  });

  it("announced changes are only those that have not started", () => {
    const changes = announcedChanges(
      [
        card("a", "macro", { vigencia: "Hasta el 17/11/2026; desde el 18/11/2026, 6 pases." }),
        card("b", "macro", { salas_vip: "desde el 1/2/2026: 4 pases" }),
        card("c", "macro", { notas: "Desde el 5/1/2027 baja; desde el 9/9/2028 otra" }),
        card("d", "macro", { vigencia: null, salas_vip: null, notas: null }),
      ],
      TODAY,
    );
    expect(changes.map(({ card: { id }, date }) => `${id}:${date}`)).toEqual([
      "a:18/11/2026",
      "c:5/1/2027",
    ]);
  });
});

describe("the window of a card", () => {
  it("starts as a new card of Galicia, from the official page", () => {
    expect(cardTexts(null)).toMatchObject({
      banco: "galicia",
      confianza: "oficial",
      tarjeta: "",
      orden: "0",
      pases_anio: "",
    });
    expect(cardTexts(card("a", "bbva", { pases_anio: 8, costo: "Gratis" }))).toMatchObject({
      banco: "bbva",
      pases_anio: "8",
      costo: "Gratis",
      confianza: "",
    });
  });

  it("knows which fields take the whole width", () => {
    const wide = CARD_FIELDS.filter(isWideField).map(({ key }) => key);
    expect(wide).toEqual([
      "salas_vip",
      "fast_pass",
      "acompanantes",
      "parking",
      "seguros",
      "puntos",
      "costo",
      "vigencia",
      "fuente_url",
      "notas",
    ]);
  });

  it("saves it trimmed, with numbers, as reviewed today", () => {
    const texts = { ...cardTexts(null), tarjeta: " Visa ", pases_anio: "6.4", orden: "x" };
    const checked = checkCard(texts, TODAY);
    expect(checked).toEqual({
      ok: true,
      row: expect.objectContaining({ tarjeta: "Visa", pases_anio: 6, orden: 0, revisada: TODAY }),
    });
    expect(checkCard({ ...texts, pases_anio: "" }, TODAY)).toMatchObject({
      ok: true,
      row: { pases_anio: null },
    });
    expect(checkCard({ ...texts, pases_anio: "-3" }, TODAY)).toMatchObject({
      row: { pases_anio: 0 },
    });
  });

  it("asks for the name, an https address and a number of passes", () => {
    const texts = { ...cardTexts(null), tarjeta: "Visa" };
    expect(checkCard({ ...texts, tarjeta: "  " }, TODAY)).toEqual({
      ok: false,
      problem: "Falta el nombre de la tarjeta.",
    });
    expect(checkCard({ ...texts, fuente_url: "http://x.com" }, TODAY)).toEqual({
      ok: false,
      problem: "La dirección de la página tiene que empezar con https://",
    });
    expect(checkCard({ ...texts, pases_anio: "muchos" }, TODAY)).toEqual({
      ok: false,
      problem: "Los pases tienen que ser un número.",
    });
    expect(checkCard({ ...texts, fuente_url: "https://x.com" }, TODAY).ok).toBe(true);
  });
});

const BASE = { ...handLoadedTexts(null), titulo: "Changomas", pct: "20" };

function problem(change: Partial<typeof BASE>): string {
  const checked = checkHandLoaded({ ...BASE, ...change });
  return checked.ok ? "" : checked.problem;
}

describe("the window of a promotion loaded by hand", () => {
  const base = BASE;

  it("starts as one of Santander, for every card and day", () => {
    expect(handLoadedTexts(null)).toMatchObject({
      banco: "santander",
      rubro: "Supermercados",
      dias_n: [],
      credito: true,
      debito: true,
      segmento: "",
      provincias: "",
    });
    expect(
      handLoadedTexts({ id: "a", banco: "macro", titulo: "X", provincias: ["SALTA", "JUJUY"] })
        .provincias,
    ).toBe("SALTA, JUJUY");
  });

  it("offers the rubros, plus the one saved if it is another", () => {
    expect(rubroChoices("Supermercados")).toHaveLength(12);
    expect(rubroChoices("Ópticas").at(-1)).toBe("Ópticas");
    expect(rubroChoices("")).toHaveLength(12);
  });

  it("saves what was typed, with the days in order and the provinces in capitals", () => {
    const checked = checkHandLoaded({
      ...base,
      tope: "15000",
      tope_por: "month",
      dias_n: [4, 2],
      provincias: " salta,  , jujuy ",
      credito: false,
      debito: false,
    });
    expect(checked).toEqual({
      ok: true,
      row: expect.objectContaining({
        pct: 20,
        tope: 15_000,
        tope_por: "month",
        cuotas: 0,
        dias_n: [2, 4],
        provincias: ["SALTA", "JUJUY"],
        credito: true,
        debito: true,
        segmento: null,
        fecha_desde: null,
      }),
    });
    expect(checkHandLoaded({ ...base, provincias: "" })).toMatchObject({
      row: { provincias: null, rubro: "Supermercados" },
    });
    expect(checkHandLoaded({ ...base, rubro: "" })).toMatchObject({ row: { rubro: "Otros" } });
  });

  it("needs a name and a percent or installments that make sense", () => {
    expect(problem({ titulo: " " })).toBe("Falta la marca o el comercio.");
    expect(problem({ pct: "" })).toBe("Poné el % de descuento o las cuotas sin interés.");
    expect(problem({ pct: "", cuotas: "6" })).toBe("");
    expect(problem({ pct: "0" })).toBe("Revisá el % y el tope: tienen que ser números válidos.");
    expect(problem({ pct: "101" })).toBe("Revisá el % y el tope: tienen que ser números válidos.");
    expect(problem({ pct: "x" })).toBe("Revisá el % y el tope: tienen que ser números válidos.");
    expect(problem({ tope: "-1" })).toBe("Revisá el % y el tope: tienen que ser números válidos.");
    expect(problem({ fuente_url: "www.x.com" })).toBe(
      "La dirección de la página tiene que empezar con https://",
    );
    expect(problem({ fecha_desde: "2026-11-02", fecha_hasta: "2026-11-01" })).toBe(
      'La fecha "hasta" es anterior a "desde".',
    );
    expect(problem({ fecha_desde: "2026-11-01", fecha_hasta: "2026-11-02" })).toBe("");
  });
});
