import { describe, expect, it } from "vitest";
import { sanitizeFlyerOptions } from "@/shared/domain/flyer-options.ts";
import {
  facultyMatrix,
  facultyRows,
  groupCount,
  isTicked,
  leavesNoFlyer,
  OWN_COLUMN,
  ownApplies,
  roleApplies,
  tabsInOrder,
  tick,
} from "./faculties.ts";

const OPTIONS = sanitizeFlyerOptions([
  { n: 1, nombre: "Opción 1" },
  { n: 8, nombre: "Combustible rubro", solapa: "rubros" },
  { n: 7, nombre: "Super rubro", solapa: "rubros" },
  { n: 5, nombre: "Sueldo", solapa: "sueldo" },
]);
const TAB_NAMES = { flyer: "Flyer Galicia", rubros: "Flyer Rubros", sueldo: "Flyer Sueldo" };

describe("the rows of the matrix", () => {
  it("put the flyers after the first two, grouped by tab in the order of the header", () => {
    const rows = facultyRows(OPTIONS, ["sueldo", "flyer"], (tab) => TAB_NAMES[tab]);
    expect(rows.map(({ key }) => key)).toEqual([
      "padron_buscar",
      "pegar_oficial",
      "opcion_5",
      "opcion_1",
      "opcion_7",
      "opcion_8",
      "notas",
      "asesores_guardados",
      "promos_buscar",
      "guardar_trabajo",
      "oficiales_sede",
      "benchmark",
      "estudio",
      "tutorial_auto",
      "proponer_oficiales",
      "gestiones",
    ]);
    expect(rows.find(({ key }) => key === "opcion_1")?.name).toBe("Ver «Opción 1» (opción 1)");
    expect(rows.find(({ key }) => key === "opcion_8")).toMatchObject({
      name: "Ver «Combustible rubro» (opción 8, solapa Flyer Rubros)",
      tab: "rubros",
      otherTab: "Flyer Rubros",
    });
    expect(tabsInOrder(null)).toEqual(["flyer", "rubros", "sueldo"]);
  });
});

describe("the matrix", () => {
  const matrix = facultyMatrix({ asesor: { opcion_8: true, notas: true } }, OPTIONS, {
    notas: false,
  });

  it("keeps what is saved over the defaults, and the column of the administrator whole", () => {
    expect(isTicked(matrix, "asesor", "opcion_8")).toBe(true);
    expect(isTicked(matrix, "asesor", "opcion_1")).toBe(true);
    expect(isTicked(matrix, "vip", "notas")).toBe(true);
    expect(isTicked(matrix, "hunter", "opcion_1")).toBe(false);
    expect(isTicked(matrix, OWN_COLUMN, "notas")).toBe(false);
    expect(isTicked(matrix, OWN_COLUMN, "benchmark")).toBe(true);
    expect(isTicked(matrix, "nadie", "notas")).toBe(false);
    expect(Object.keys(matrix.own)).toContain("opcion_5");
  });

  it("is a profile with nothing saved: what it always had", () => {
    const fresh = facultyMatrix(null, OPTIONS, null);
    expect(isTicked(fresh, "asesor", "notas")).toBe(false);
    expect(isTicked(fresh, "lider", "gestiones")).toBe(true);
    expect(isTicked(fresh, OWN_COLUMN, "notas")).toBe(true);
  });

  it("changes a copy, cell by cell", () => {
    const changed = tick(tick(matrix, "asesor", "notas", false), OWN_COLUMN, "notas", true);
    expect(isTicked(changed, "asesor", "notas")).toBe(false);
    expect(isTicked(changed, OWN_COLUMN, "notas")).toBe(true);
    expect(isTicked(matrix, "asesor", "notas")).toBe(true);
  });

  it("counts the flyers of a tab that each column has", () => {
    expect(groupCount(matrix, "asesor", "rubros", OPTIONS)).toBe("1/2");
    expect(groupCount(tick(matrix, "asesor", "opcion_7", true), "asesor", "rubros", OPTIONS)).toBe(
      "2/2",
    );
    expect(groupCount(matrix, OWN_COLUMN, "rubros", OPTIONS)).toBe("2/2");
  });
});

describe("what can be ticked", () => {
  it("for a hunter only the flyers and a short list; for a leader, notes, tutorial and Gestiones", () => {
    expect(roleApplies("hunter", "opcion_8")).toBe(true);
    expect(roleApplies("hunter", "promos_buscar")).toBe(true);
    expect(roleApplies("hunter", "pegar_oficial")).toBe(false);
    expect(roleApplies("lider", "opcion_1")).toBe(false);
    expect(roleApplies("lider", "gestiones")).toBe(true);
    expect(roleApplies("asesor", "pegar_oficial")).toBe(true);
  });

  it("for the administrator everything but the automatic tutorial", () => {
    expect(ownApplies("tutorial_auto")).toBe(false);
    expect(ownApplies("notas")).toBe(true);
  });

  it("never leaves the administrator without any flyer", () => {
    const onlyOne = facultyMatrix(null, OPTIONS, {
      opcion_1: true,
      opcion_5: false,
      opcion_7: false,
      opcion_8: false,
    });
    expect(leavesNoFlyer(onlyOne, "opcion_1", OPTIONS)).toBe(true);
    expect(leavesNoFlyer(onlyOne, "opcion_5", OPTIONS)).toBe(false);
    expect(leavesNoFlyer(onlyOne, "notas", OPTIONS)).toBe(false);
  });
});
