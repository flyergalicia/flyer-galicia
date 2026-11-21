import { describe, expect, it } from "vitest";
import {
  type CommercialNotice,
  noticesOf,
  noticeText,
  type NewActionRow,
} from "./commercial-notices.ts";
import type { CommercialPeople } from "./people-query.ts";

const PEOPLE: CommercialPeople = {
  o1: { id: "o1", nombre: "Mariana", rol: "vip" },
  h1: { id: "h1", nombre: "Sofía", rol: "hunter" },
};

const ROW: NewActionRow = {
  serie_id: "s1",
  empresa: "ACME",
  origen: "derivada",
  creada_por: "o1",
  hunter_id: "me",
  dueno_id: "o1",
  visto_hunter: false,
  visto_dueno: true,
};

const only = (kind: CommercialNotice["kind"], fields: Partial<CommercialNotice> = {}) => ({
  key: "s",
  empresa: "ACME",
  kind,
  who: "o1",
  ...fields,
});

const fourOf = (kind: CommercialNotice["kind"]) =>
  ["A", "B", "C", "D"].map((empresa) => only(kind, { empresa }));

describe("what is new", () => {
  it("a series of three dates is one notice", () => {
    const rows = [ROW, { ...ROW, empresa: "OTRA" }, { ...ROW, serie_id: "s2" }];
    const notices = noticesOf({ newActions: rows, messages: [], toAssign: [] }, "me");

    expect(notices.map(({ key }) => key)).toEqual(["s1", "s2"]);
    expect(notices[0]).toMatchObject({ kind: "derivada", who: "o1" });
  });

  it("the owner hears what a hunter registered or completed", () => {
    const row = { ...ROW, hunter_id: "h1", dueno_id: "me", visto_dueno: false };
    const of = (origen: string) =>
      noticesOf({ newActions: [{ ...row, origen }], messages: [], toAssign: [] }, "me")[0];

    expect.soft(of("derivada")).toMatchObject({ kind: "completada", who: "h1" });
    expect.soft(of("propia")).toMatchObject({ kind: "registro", who: "h1" });
  });

  it("being both, hears both", () => {
    const row = { ...ROW, dueno_id: "me", visto_dueno: false };
    expect(noticesOf({ newActions: [row], messages: [], toAssign: [] }, "me")).toHaveLength(2);
  });

  it("what was seen is not new", () => {
    const row = { ...ROW, visto_hunter: true };
    expect(noticesOf({ newActions: [row], messages: [], toAssign: [] }, "me")).toEqual([]);
  });

  it("a new message on the same action warns again: its key has the time", () => {
    const message = {
      gestion_id: "g",
      empresa: "ACME",
      n: 1,
      ultimo_at: "2026-11-01",
      ultimo_autor: "h1",
    };
    const [first] = noticesOf({ newActions: [], messages: [message], toAssign: [] }, "me");
    const [second] = noticesOf(
      { newActions: [], messages: [{ ...message, ultimo_at: "2026-11-02" }], toAssign: [] },
      "me",
    );
    expect(first?.key).not.toBe(second?.key);
    expect(first).toMatchObject({ kind: "mensaje", cannotAttend: false });
  });

  it("a leader hears what is to assign, once per series", () => {
    const row = { serie_id: "s", empresa: "ACME", creada_por: "o1" };
    expect(noticesOf({ newActions: [], messages: [], toAssign: [row, row] }, "me")).toHaveLength(1);
  });
});

describe("what the notice says", () => {
  it.each([
    [[only("derivada")], "Mariana te derivó una acción en ACME. Está en Gestiones."],
    [
      [only("derivada", { who: null })],
      "Un hunter te derivó una acción en ACME. Está en Gestiones.",
    ],
    [[only("completada")], "Mariana completó la acción que derivaste en ACME. Está en Gestiones."],
    [[only("registro")], "Mariana registró una acción en ACME. Está en Gestiones."],
    [[only("mensaje")], "Mariana te escribió sobre ACME. Está en Gestiones."],
    [[only("mensaje", { who: "gone" })], "Alguien te escribió sobre ACME. Está en Gestiones."],
    [
      [only("mensaje", { cannotAttend: true })],
      "Mariana avisó que no puede ir a ACME. Está en Gestiones.",
    ],
    [[only("por_asignar")], "Hay una acción para asignar en ACME. Está en Gestiones."],
  ])("%#", (notices, text) => {
    expect(noticeText(notices, PEOPLE)).toBe(text);
  });

  it("several of each go together, up to three names", () => {
    expect
      .soft(noticeText(fourOf("derivada"), PEOPLE))
      .toBe("Te derivaron 4 acciones nuevas: A, B, C…. Están en Gestiones.");
    expect
      .soft(noticeText(fourOf("registro").slice(0, 2), PEOPLE))
      .toBe("Hay novedades en 2 acciones de tus empresas: A, B. Están en Gestiones.");
    expect
      .soft(noticeText(fourOf("mensaje").slice(0, 2), PEOPLE))
      .toMatch(/Tenés mensajes nuevos en 2 acciones/);
    expect
      .soft(noticeText(fourOf("por_asignar").slice(0, 2), PEOPLE))
      .toMatch(/Hay 2 acciones para asignar: A, B/);
  });

  it("different things are joined", () => {
    expect(noticeText([only("derivada"), only("por_asignar")], PEOPLE)).toBe(
      "Mariana te derivó una acción en ACME. Hay una acción para asignar en ACME. Están en Gestiones.",
    );
  });

  it("nothing says nothing", () => {
    expect(noticeText([], PEOPLE)).toBe("");
  });
});
