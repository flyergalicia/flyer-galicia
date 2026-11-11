import { describe, expect, it } from "vitest";
import { sanitizeFlyerOptions } from "@/shared/domain/flyer-options.ts";
import {
  byUser,
  changeDetails,
  type CompanyLogRow,
  detailsText,
  isRelevant,
} from "./company-log.ts";

const OPTIONS = sanitizeFlyerOptions([
  { n: 1, nombre: "Opción 1" },
  { n: 7, nombre: "Combustible", solapa: "rubros", rubro: "combustible" },
]);

function row(fields: Partial<CompanyLogRow>): CompanyLogRow {
  return {
    id: 1,
    user_id: "u1",
    usuario: "Ana Perez",
    accion: "modificacion",
    empresa: "ACME SA",
    cambios: {},
    total: 3,
    created_at: "2026-10-20T10:00:00Z",
    ...fields,
  };
}

const ANA = { nombre: "Ana", celular: "11 1", email: "ana@b.com" };

describe("a company that came in or went out", () => {
  it("is told whole: its tax ids, cashback, officers and rubro", () => {
    const added = row({
      accion: "alta",
      cambios: {
        cuits: { despues: ["30711111111", ""] },
        config: { despues: "" },
        asesores: { despues: [ANA, { nombre: "Luis" }] },
        rubro: { despues: { opcion: 7, importe: "24000" } },
      },
    });
    expect(changeDetails(added, OPTIONS)).toEqual([
      ["CUIT", "30-71111111-1"],
      ["Cashback", "sin cashback"],
      ["Oficiales", "2 oficiales"],
      ["Rubro", "Combustible · $24.000"],
    ]);
    const removed = row({
      accion: "baja",
      cambios: {
        cuits: { antes: [] },
        asesores: { antes: [{ nombre: "" }] },
        config: { antes: 3 },
      },
    });
    expect(detailsText(removed, OPTIONS)).toBe(
      "CUIT: sin CUIT · Cashback: 3 · Oficiales: sin oficiales",
    );
    expect(
      changeDetails(row({ accion: "alta", cambios: { asesores: { despues: [ANA] } } }), OPTIONS),
    ).toEqual([["Oficiales", "1 oficial"]]);
  });
});

describe("a modification", () => {
  it("tells which tax ids came in and went out", () => {
    const changed = row({
      cambios: { cuits: { antes: ["30-71111111-1"], despues: ["30711111111", "30722222222"] } },
    });
    expect(changeDetails(changed, OPTIONS)).toEqual([["CUIT", "+ 30-72222222-2"]]);
    const swapped = row({
      cambios: { cuits: { antes: ["30711111111"], despues: ["30722222222"] } },
    });
    expect(changeDetails(swapped, OPTIONS)).toEqual([["CUIT", "+ 30-72222222-2  − 30-71111111-1"]]);
  });

  it("tells the cashback before and after, only when it changed", () => {
    expect(
      changeDetails(row({ cambios: { config: { antes: "BAU", despues: "Config 1" } } }), OPTIONS),
    ).toEqual([["Cashback", "BAU → Config 1"]]);
    expect(
      changeDetails(row({ cambios: { config: { antes: null, despues: " " } } }), OPTIONS),
    ).toEqual([]);
  });

  it("tells each officer added, taken out, replaced or corrected", () => {
    const officers = row({
      cambios: {
        asesores: {
          antes: [ANA, { nombre: "Luis", celular: "1" }, {}, { nombre: "Sara", email: "s@b" }, ANA],
          despues: [
            { ...ANA, celular: "11 2" },
            {},
            { nombre: "Nuevo" },
            { nombre: "Otra", email: "o@b" },
            { nombre: "Anita", celular: "22", email: "anita@b" },
          ],
        },
      },
    });
    expect(changeDetails(officers, OPTIONS)).toEqual([
      ["Oficial", "Ana · celular 11 1 → 11 2"],
      ["Oficial quitado", "Luis"],
      ["Oficial agregado", "Nuevo"],
      ["Oficial reemplazado", "Sara → Otra"],
      ["Oficial reemplazado", "Ana → Anita"],
    ]);
  });

  it("names the officer by the new data only when the three fields changed", () => {
    const renamed = row({
      cambios: { asesores: { antes: [{ nombre: "Ana" }], despues: [{ nombre: "Ana Perez" }] } },
    });
    expect(changeDetails(renamed, OPTIONS)).toEqual([["Oficial", "Ana · nombre Ana → Ana Perez"]]);
    const emptyName = row({
      cambios: {
        asesores: { antes: [{ celular: "1" }], despues: [{ celular: "1", email: "x@b" }] },
      },
    });
    expect(changeDetails(emptyName, OPTIONS)).toEqual([["Oficial", "1 · mail — → x@b"]]);
    const untouched = row({ cambios: { asesores: { antes: [ANA], despues: [{ ...ANA }] } } });
    expect(changeDetails(untouched, OPTIONS)).toEqual([]);
  });

  it("tells the rubro only when it changed for real, and says when there is none", () => {
    const changed = row({ cambios: { rubro: { antes: {}, despues: { opcion: 7 } } } });
    expect(changeDetails(changed, OPTIONS)).toEqual([["Rubro", "sin rubro → Combustible"]]);
    const same = row({ cambios: { rubro: { antes: { opcion: 0, txt: "" }, despues: {} } } });
    expect(changeDetails(same, OPTIONS)).toEqual([]);
  });

  it("with only a change of format is neither shown nor exported", () => {
    expect(isRelevant(row({ cambios: { rubro: { antes: {}, despues: {} } } }), OPTIONS)).toBe(
      false,
    );
    expect(isRelevant(row({ cambios: "roto" }), OPTIONS)).toBe(false);
    expect(isRelevant(row({ accion: "alta", cambios: null }), OPTIONS)).toBe(true);
  });
});

describe("the user filter", () => {
  it("looks for the name kept in the row, without minding capitals", () => {
    const rows = [row({ id: 1 }), row({ id: 2, usuario: "Luis" }), row({ id: 3, usuario: null })];
    expect(byUser(rows, "ANA").map(({ id }) => id)).toEqual([1]);
    expect(byUser(rows, "")).toHaveLength(3);
  });
});
