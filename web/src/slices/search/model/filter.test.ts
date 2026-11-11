import { describe, expect, it } from "vitest";
import type { SearchEntry } from "./entry.ts";
import { RECENT_GROUP, searchRows, titleParts } from "./filter.ts";

const ENTRIES: readonly SearchEntry[] = [
  { id: "app:flyer", group: "Pantallas", title: "Flyer Galicia", keywords: "armador inicio" },
  { id: "app:promos", group: "Pantallas", title: "Promociones", keywords: "marcas beneficios" },
  { id: "tab:masivo", group: "Armador", title: "Masivo", keywords: "excel zip varios" },
  { id: "pro:buscar", group: "Promociones", title: "Buscar", keywords: "pegar marcas validar" },
  { id: "adm:auditoria", group: "Admin", title: "Auditoría", keywords: "panel acciones log" },
  { id: "fn:clave", group: "Cuenta", title: "Cambiar mi clave", keywords: "contrasena password" },
];

function titles(typed: string, recent: readonly string[] = []): string[] {
  return searchRows(ENTRIES, typed, recent).map(({ entry }) => entry.title);
}

describe("with nothing written", () => {
  it("lists everything by its group", () => {
    const rows = searchRows(ENTRIES, "  ", []);
    expect(rows.map(({ group }) => group)).toEqual([
      "Pantallas",
      "Pantallas",
      "Armador",
      "Promociones",
      "Admin",
      "Cuenta",
    ]);
  });

  it("puts the recent ones first, in their order, and only there", () => {
    const rows = searchRows(ENTRIES, "", ["tab:masivo", "gone", "app:flyer"]);
    expect(rows.slice(0, 2).map(({ entry, group }) => [entry.title, group])).toEqual([
      ["Masivo", RECENT_GROUP],
      ["Flyer Galicia", RECENT_GROUP],
    ]);
    expect(rows.filter(({ entry }) => entry.title === "Masivo")).toHaveLength(1);
    expect(rows).toHaveLength(ENTRIES.length);
  });
});

describe("writing", () => {
  it("does not mind capitals nor accents, in both directions", () => {
    expect(titles("AUDITORIA")).toEqual(["Auditoría"]);
    expect(titles("auditoría")).toEqual(["Auditoría"]);
  });

  it("needs every word, wherever it is: title, group or other words", () => {
    expect(titles("cambiar clave")).toEqual(["Cambiar mi clave"]);
    expect(titles("contraseña")).toEqual(["Cambiar mi clave"]);
    expect(titles("excel")).toEqual(["Masivo"]);
    expect(titles("clave zip")).toEqual([]);
  });

  it("puts first what is the whole title, then what starts the same, then a word, then inside", () => {
    const list: readonly SearchEntry[] = [
      { id: "a", group: "G", title: "Un promo dentro" },
      { id: "b", group: "G", title: "Xpromo" },
      { id: "c", group: "Promo", title: "Otra" },
      { id: "d", group: "G", title: "Promociones" },
      { id: "e", group: "G", title: "Promo" },
    ];
    expect(searchRows(list, "promo", []).map(({ entry }) => entry.id)).toEqual([
      "e",
      "d",
      "a",
      "b",
      "c",
    ]);
  });

  it("keeps the order of the list between equals, and says nothing of groups", () => {
    const rows = searchRows(ENTRIES, "marcas", []);
    expect(rows.map(({ entry }) => entry.title)).toEqual(["Promociones", "Buscar"]);
    expect(rows.every(({ group }) => group === null)).toBe(true);
  });

  it("with nothing found, it tries the letters in order inside the title, shortest first", () => {
    expect(titles("prmociones")).toEqual(["Promociones"]);
    expect(titles("ms")).toEqual(["Masivo", "Promociones"]);
    expect(titles("zzzzq")).toEqual([]);
  });
});

describe("the mark of what was written", () => {
  it("goes around the first place the title has it", () => {
    expect(titleParts("Auditoría", "DITO")).toEqual({ before: "Au", match: "dito", after: "ría" });
    expect(titleParts("Cambiar mi clave", "mi c")).toEqual({
      before: "Cambiar ",
      match: "mi c",
      after: "lave",
    });
  });

  it("is not there with nothing written, nothing found, or letters that do not line up", () => {
    const whole = { before: "Masivo", match: "", after: "" };
    expect(titleParts("Masivo", " ")).toEqual(whole);
    expect(titleParts("Masivo", "excel")).toEqual(whole);
    expect(titleParts("Masivo", "ms")).toEqual(whole);
    expect(titleParts("Café", "caf")).toEqual({ before: "Café", match: "", after: "" });
  });
});
