import { describe, expect, it } from "vitest";
import { needsNoCheck, takenText } from "./use-overlap-check.ts";

const AT_TEN = { tipo: "accion", estado: "planificada", fecha: "2026-11-10", hora_desde: "10:00" };

describe("a time that overlaps", () => {
  it("is only looked for with a hunter, a day and a time", () => {
    expect.soft(needsNoCheck("h1", AT_TEN)).toBe(false);
    expect.soft(needsNoCheck(null, AT_TEN)).toBe(true);
    expect.soft(needsNoCheck("h1", { ...AT_TEN, hora_desde: null })).toBe(true);
    expect.soft(needsNoCheck("h1", { ...AT_TEN, fecha: "" })).toBe(true);
  });

  it("does not stop what is cancelled nor a data list", () => {
    expect.soft(needsNoCheck("h1", { ...AT_TEN, estado: "cancelada" })).toBe(true);
    expect.soft(needsNoCheck("h1", { ...AT_TEN, tipo: "datos" })).toBe(true);
  });

  it("says what is there, without the company of somebody else", () => {
    const taken = { hora_desde: "10:00:00", hora_hasta: "12:00:00" };
    expect.soft(takenText({ ...taken, empresa: "ACME" })).toBe("10:00–12:00 en ACME");
    expect.soft(takenText({ ...taken, empresa: null })).toBe("10:00–12:00 (otra acción)");
    expect
      .soft(takenText({ hora_desde: null, hora_hasta: null, empresa: "ACME" }))
      .toBe("sin horario en ACME");
  });
});
