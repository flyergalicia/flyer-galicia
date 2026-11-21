import { describe, expect, it } from "vitest";
import type { AgendaExtras, PersonToContact, TrayAction } from "../api/agenda.ts";
import { contactGroups, traysOf } from "./agenda-trays.ts";
import { addDays, today } from "./formatting.ts";

function action(id: string, hunter: string | null): TrayAction {
  return {
    id,
    empresa: `EMPRESA ${id}`,
    cuit: null,
    tipo: "accion",
    fecha: "2026-11-10",
    vence: null,
    hora_desde: null,
    hora_hasta: null,
    estado: "planificada",
    hunter_id: hunter,
    dueno_id: "o1",
    creada_por: "o1",
    lider_id: null,
    no_puede_at: null,
    no_puede_motivo: null,
    origen: "derivada",
  };
}

function person(id: string, date: string): PersonToContact {
  return {
    id,
    nombre: id,
    contacto: null,
    proximo: date,
    estado: "prospecto",
    gestion_id: "g",
  };
}

const EXTRAS: AgendaExtras = {
  dataLists: [action("list-h1", "h1"), action("list-h2", "h2"), action("list-nobody", null)],
  unassigned: [action("unassigned", null)],
  cannotAttend: [action("cannot-h1", "h1"), action("cannot-h2", "h2")],
  toContact: [person("p", today())],
  progress: {},
  companies: {},
};

function ids(list: readonly TrayAction[]): readonly string[] {
  return list.map(({ id }) => id);
}

describe("the trays", () => {
  it("whoever assigns sees all of it, and no people to contact", () => {
    const trays = traysOf(EXTRAS, { isHunter: false, hunter: "", view: "equipo" });

    expect.soft(ids(trays.unassigned)).toEqual(["unassigned"]);
    expect.soft(ids(trays.reassign)).toEqual(["cannot-h1", "cannot-h2"]);
    expect
      .soft(ids(trays.dataLists), "what has no hunter is not there")
      .toEqual(["list-h1", "list-h2"]);
    expect.soft(trays.toContact).toEqual([]);
  });

  it("looking at one hunter, what is theirs; what has no hunter still shows", () => {
    const trays = traysOf(EXTRAS, { isHunter: false, hunter: "h1", view: "sem" });

    expect.soft(ids(trays.reassign)).toEqual(["cannot-h1"]);
    expect.soft(ids(trays.dataLists)).toEqual(["list-h1"]);
    expect.soft(ids(trays.unassigned)).toEqual(["unassigned"]);
  });

  it("on the month all of it, whoever was chosen", () => {
    const trays = traysOf(EXTRAS, { isHunter: false, hunter: "h1", view: "mes" });

    expect(ids(trays.reassign)).toEqual(["cannot-h1", "cannot-h2"]);
  });

  it("a hunter has people to contact, and nothing to assign", () => {
    const trays = traysOf(EXTRAS, { isHunter: true, hunter: "h1", view: "sem" });

    expect.soft(trays.toContact).toHaveLength(1);
    expect.soft(trays.unassigned).toEqual([]);
    expect
      .soft(ids(trays.reassign), "the database gives them only theirs")
      .toEqual(["cannot-h1", "cannot-h2"]);
  });
});

describe("who to contact", () => {
  it("sets those left behind apart from those of today", () => {
    const late = person("late", addDays(today(), -3));
    const now = person("now", today());

    const { overdue, ofToday } = contactGroups([late, now]);

    expect.soft(overdue).toEqual([late]);
    expect.soft(ofToday).toEqual([now]);
  });
});
