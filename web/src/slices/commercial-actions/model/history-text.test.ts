import { describe, expect, it } from "vitest";
import { hunter } from "../testing/fixtures.ts";
import { historyText } from "./history-text.ts";

const said = (que: string, quien: string | null, detalle: Readonly<Record<string, string>>) =>
  historyText(hunter, { que, quien, detalle });

describe("the history", () => {
  it.each([
    ["registrada", {}, "Sofía Paz la registró."],
    ["derivada", { hunter: "h2" }, "Sofía Paz se la derivó a Tomás Ríos."],
    [
      "por_asignar",
      { lider: "l1" },
      "Sofía Paz la mandó al equipo para que la asigne Laura Méndez.",
    ],
    ["hunter", { de: "h2", a: "h1" }, "Sofía Paz se la pasó de Tomás Ríos a Sofía Paz."],
    ["hunter", { a: "h2" }, "Sofía Paz se la asignó a Tomás Ríos."],
    ["estado", { a: "realizada" }, "Sofía Paz la marcó como realizada."],
    ["estado", { a: "rara" }, "Sofía Paz la marcó como rara."],
    ["no_puede", { motivo: "licencia" }, "Sofía Paz avisó que no puede ir: licencia."],
    ["no_puede", {}, "Sofía Paz avisó que no puede ir."],
    ["alta", { nombre: "Ana", paquete: "caja" }, "Sofía Paz marcó el alta de Ana (Sin paquete)."],
    ["alta", { nombre: "Ana" }, "Sofía Paz marcó el alta de Ana (sin paquete cargado)."],
    [
      "descarte",
      { nombre: "Ana", motivo: "no_contesta" },
      "Sofía Paz descartó a Ana (No contesta).",
    ],
    ["descarte", { nombre: "Ana" }, "Sofía Paz descartó a Ana (sin motivo)."],
    ["otra", {}, "Sofía Paz: otra"],
  ])("%s %j: %s", (what, detail, text) => {
    expect(said(what, "h1", detail)).toBe(text);
  });

  it("says the day or time that changed", () => {
    expect(
      said("horario", "h1", {
        fecha_de: "2026-11-05",
        desde_de: "10:00",
        hasta_de: "12:00",
        fecha_a: "2026-11-06",
        desde_a: "11:00",
      }),
    ).toMatch(/cambió el día u horario: 5 nov 10:00–12:00 → 6 nov 11:00\./);
  });

  it("does not fall over with a detail that is not an object", () => {
    expect(historyText(hunter, { que: "registrada", quien: "h1", detalle: [] })).toMatch(
      /registró/,
    );
  });

  it("uses the name, also one's own, and a person who left says so", () => {
    expect.soft(said("registrada", "h1", {})).not.toMatch(/Vos/);
    expect.soft(said("registrada", "gone", {})).toMatch(/dado de baja/);
    expect.soft(said("registrada", null, {})).toMatch(/^—/);
  });
});
