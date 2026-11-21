import { describe, expect, it } from "vitest";
import { officer } from "../testing/fixtures.ts";
import type { ActionFormValues } from "./action-form.ts";
import { assignedText } from "./assigned-text.ts";

const VALUES: ActionFormValues = {
  tipo: "accion",
  modalidad: "presencial",
  frecuencia: "unica",
  fecha: "2026-11-10",
  nota: null,
  hora_desde: "10:00",
  hora_hasta: null,
  lugar: null,
  vence: null,
  estado: "planificada",
  cada_dias: null,
  hunter_id: "h1",
};

const person = {
  ok: true,
  nombre: "Ana",
  contacto: null,
  cuil: null,
  referencia: null,
  motivo: "",
  paquete: null,
};

describe("what the notice says", () => {
  it("to a hunter", () => {
    expect(assignedText(officer, VALUES, 0, null)).toBe(
      "Derivada a Sofía Paz. Le aparece en su agenda y en la marca de su avatar.",
    );
  });

  it("to the leader", () => {
    expect(assignedText(officer, { ...VALUES, hunter_id: null, lider_id: "l1" }, 0, null)).toBe(
      'Queda para que la asigne Laura Méndez. Le aparece en su bandeja "Por asignar".',
    );
  });

  it("with the dates and the people", () => {
    expect
      .soft(assignedText(officer, VALUES, 2, null))
      .toMatch(/^Derivada a Sofía Paz, con las 3 fechas planificadas\./);
    expect
      .soft(assignedText(officer, VALUES, 0, [person]))
      .toMatch(/, con 1 persona para contactar\./);
    expect
      .soft(assignedText(officer, VALUES, 0, [person, person]))
      .toMatch(/, con 2 personas para contactar\./);
  });
});
