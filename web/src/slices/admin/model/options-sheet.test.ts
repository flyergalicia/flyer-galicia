// Config → Opciones, the copy that is edited: as today, without what each one replaces, its category
// or its version without cashback (an error of the current version, ported as it is); a new one has
// the next number; option 1 stays.
import { describe, expect, it } from "vitest";
import { sanitizeFlyerOptions } from "@/shared/domain/flyer-options.ts";
import {
  activeNameOf,
  activeText,
  categoryByNameLabel,
  draftsOf,
  isCurrentOfCategory,
  listToSave,
  removeOptionQuestion,
  replaceableBy,
  savedOptionsText,
  withDraftField,
  withNewOption,
  withoutOption,
} from "./options-sheet.ts";

const SAVED = sanitizeFlyerOptions([
  { n: 1, nombre: "Opción 1" },
  { n: 9, nombre: "Combustible", color: "#AABBCC" },
  { n: 8, nombre: "Combustible 2025", solapa: "rubros", rubro: "combustible" },
  { n: 11, nombre: "Combustible 2026", solapa: "rubros", reemplaza: 8 },
  { n: 12, nombre: "Sin cashback", sinCB: 9 },
  { n: 13, nombre: "Ninguno", solapa: "rubros", rubro: "ninguno" },
]);

describe("the copy of the list", () => {
  it("has each one with its color and, as today, not what it replaces, its category or its version without cashback", () => {
    const drafts = draftsOf(SAVED);
    expect(drafts.map(({ n }) => n)).toEqual([1, 8, 9, 11, 12, 13]);
    expect(drafts.find(({ n }) => n === 9)?.color).toBe("#aabbcc");
    expect(drafts.find(({ n }) => n === 1)?.color).toBe("#1d4070");
    expect(drafts.find(({ n }) => n === 11)?.reemplaza).toBe(0);
    expect(drafts.find(({ n }) => n === 8)?.rubro).toBe("");
    expect(drafts.find(({ n }) => n === 12)).not.toHaveProperty("sinCB");
  });

  it("saves the whole list in the order of the page, and as today without what the rows had not", () => {
    const saved = listToSave(withDraftField(draftsOf(SAVED), 2, "nombre", "Nafta"));
    expect(saved.map(({ orden }) => orden)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(saved[2]).toMatchObject({ n: 9, nombre: "Nafta" });
    expect(saved.find(({ n }) => n === 11)).toMatchObject({ reemplaza: 0 });
    expect(saved.find(({ n }) => n === 8)).toMatchObject({ rubro: "" });
    expect(saved.find(({ n }) => n === 12)).not.toHaveProperty("sinCB");
    const touched = withDraftField(
      withDraftField(draftsOf(SAVED), 3, "reemplaza", "8"),
      1,
      "rubro",
      "ambos",
    );
    expect(listToSave(touched)[3]).toMatchObject({ n: 11, reemplaza: 8 });
    expect(listToSave(touched)[1]).toMatchObject({ n: 8, rubro: "ambos" });
  });

  it("another tab leaves what it replaced: the candidates are others", () => {
    const moved = withDraftField(draftsOf(SAVED), 3, "solapa", "sueldo");
    expect(moved[3]).toMatchObject({ solapa: "sueldo", reemplaza: 0 });
    expect(withDraftField(draftsOf(SAVED), 3, "solapa", "otra")[3]?.solapa).toBe("rubros");
  });

  it("reads what it replaces as a number and a category only among the known ones", () => {
    const drafts = draftsOf(SAVED);
    expect(withDraftField(drafts, 2, "reemplaza", "11")[2]?.reemplaza).toBe(11);
    expect(withDraftField(drafts, 2, "reemplaza", "x")[2]?.reemplaza).toBe(0);
    expect(withDraftField(drafts, 2, "rubro", "ambos")[2]?.rubro).toBe("ambos");
    expect(withDraftField(drafts, 2, "rubro", "")[2]?.rubro).toBe("");
    expect(withDraftField(drafts, 2, "color", "#123456")[2]?.color).toBe("#123456");
  });

  it("a new one takes the next number, its color and the first tab", () => {
    const added = withNewOption(draftsOf(SAVED)).at(-1);
    expect(added).toEqual({
      n: 14,
      nombre: "Opción 14",
      color: "#00838f",
      solapa: "flyer",
      orden: 6,
      reemplaza: 0,
      rubro: "",
    });
    expect(withNewOption([]).at(-1)?.n).toBe(1);
  });

  it("option 1, the one of every advisor, is never taken out", () => {
    const drafts = draftsOf(SAVED);
    expect(withoutOption(drafts, 0)).toEqual(drafts);
    expect(withoutOption(drafts, 1).map(({ n }) => n)).toEqual([1, 9, 11, 12, 13]);
  });

  it("only another one of the same tab can be replaced", () => {
    const drafts = draftsOf(SAVED);
    const latest = drafts.find(({ n }) => n === 11);
    if (!latest) throw new Error("No option 11");
    expect(replaceableBy(drafts, latest).map(({ n }) => n)).toEqual([8, 13]);
  });
});

describe("what each row says", () => {
  it("the category by its name, or that the name does not say it", () => {
    expect(categoryByNameLabel("Combustible 2026")).toBe("Rubro: según el nombre (Combustible)");
    expect(categoryByNameLabel("Súper y nafta")).toBe(
      "Rubro: según el nombre (Súper y combustible)",
    );
    expect(categoryByNameLabel("Hipermercado")).toBe("Rubro: según el nombre (Supermercado)");
    expect(categoryByNameLabel("Ropa")).toBe("Rubro: según el nombre (no lo dice)");
  });

  it("the current one of its category follows what is saved, not what is edited", () => {
    const drafts = draftsOf(SAVED);
    const current = drafts.filter((draft) => isCurrentOfCategory(draft, SAVED)).map(({ n }) => n);
    expect(current).toEqual([11]);
    const notSaved = withNewOption(drafts).at(-1);
    if (!notSaved) throw new Error("No new option");
    expect(isCurrentOfCategory({ ...notSaved, solapa: "rubros", nombre: "Nafta" }, SAVED)).toBe(
      false,
    );
  });

  it("what it has active, and nothing while it is not known (invariant 24)", () => {
    const active = new Map([
      [9, "flyer_1_op9.jpg"],
      [8, ""],
    ]);
    expect(activeText(active, 9)).toBe("Flyer activo: flyer_1_op9.jpg");
    expect(activeText(active, 8)).toBe("Sin flyer activo todavía (se sube desde Config → Flyer).");
    expect(activeText(active, 40)).toBe("Sin flyer activo todavía (se sube desde Config → Flyer).");
    expect(activeText(undefined, 9)).toBe("");
    expect(activeNameOf({ name: "a.jpg", imageUrl: "https://x/a.jpg" })).toBe("a.jpg");
    expect(activeNameOf({ name: "", imageUrl: "https://x/a.jpg" })).toBe("flyer activo");
    expect(activeNameOf({ name: "a.jpg", imageUrl: null })).toBe("");
    expect(activeNameOf(null)).toBe("");
  });

  it("asks before taking one out, saying if it has a flyer today", () => {
    const nine = draftsOf(SAVED).find(({ n }) => n === 9);
    if (!nine) throw new Error("No option 9");
    expect(removeOptionQuestion(nine, "")).toEqual({
      title: '¿Quitar "Combustible"?',
      body: "Deja de verse para todos los perfiles. Su flyer y su legal quedan guardados por si la volvés a agregar con el mismo número (9).",
    });
    expect(removeOptionQuestion(nine, "flyer_1_op9.jpg").body).toMatch(
      /\(9\)\.\nOjo: hoy tiene un flyer activo \(flyer_1_op9\.jpg\)\.$/,
    );
  });

  it("says where to enable a new one", () => {
    expect(savedOptionsText([1, 9], SAVED)).toBe(
      "Opciones guardadas. Para que un perfil vea la nueva, habilitala en Admin → Facultades.",
    );
    expect(savedOptionsText([1, 9, 8, 11, 12, 13], SAVED)).toBe("Opciones guardadas");
  });
});
