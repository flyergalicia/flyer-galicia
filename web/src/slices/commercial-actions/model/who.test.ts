import { describe, expect, it } from "vitest";
import { administrator, anAction, hunter, leader, officer, whoIs } from "../testing/fixtures.ts";
import {
  canDelete,
  canEdit,
  canForce,
  canReassign,
  canSendToLeader,
  commandsFor,
  huntersOf,
  isOfMyTeam,
  leaderChoices,
  leadersOf,
  nameOf,
  ownerText,
  subtitleOf,
  tabsOf,
} from "./who.ts";

const FORWARDED = anAction();
const otherLeader = whoIs("lider", "l9");

describe("the solapas of each profile", () => {
  it.each([
    ["hunter", ["Mi agenda", "Mis gestiones", "Tablero"]],
    ["lider", ["Agenda del equipo", "Tablero del equipo", "Gestiones del equipo"]],
    ["vip", ["Mis empresas", "Agenda", "Gestiones", "Tablero"]],
    ["admin", ["Mis empresas", "Agenda", "Gestiones", "Tablero"]],
  ])("%s has these", (role, labels) => {
    expect(tabsOf(role).map(([, label]) => label)).toEqual(labels);
  });

  it.each([
    ["hunter", /Tu agenda/],
    ["lider", /Cómo viene tu equipo/],
    ["vip", /Lo que se hizo con tus empresas/],
  ])("%s reads what is theirs", (role, text) => {
    expect(subtitleOf(role)).toMatch(text);
  });
});

describe("how a person reads", () => {
  it("is oneself as Vos, and somebody who left says so", () => {
    expect.soft(nameOf(officer, "o1")).toBe("Vos");
    expect.soft(nameOf(officer, "h1")).toBe("Sofía Paz");
    expect.soft(nameOf(officer, "nobody")).toBe("Usuario dado de baja");
    expect.soft(nameOf(officer, null)).toBe("—");
  });

  it('says "Tu empresa", never "Empresa de Vos"', () => {
    expect.soft(ownerText(hunter, "h1")).toBe("Tu empresa");
    expect.soft(ownerText(hunter, "o1")).toBe("Empresa de Mariana Costa");
  });
});

describe("who edits and who deletes", () => {
  it("edits: the hunter, who created it and the administrator", () => {
    expect.soft(canEdit(hunter, FORWARDED)).toBe(true);
    expect.soft(canEdit(officer, FORWARDED)).toBe(true);
    expect.soft(canEdit(administrator, FORWARDED)).toBe(true);
    expect.soft(canEdit(leader, FORWARDED)).toBe(false);
  });

  it("deletes: who created it and the administrator, not the hunter it was forwarded to", () => {
    expect.soft(canDelete(officer, FORWARDED)).toBe(true);
    expect.soft(canDelete(administrator, FORWARDED)).toBe(true);
    expect.soft(canDelete(hunter, FORWARDED)).toBe(false);
  });
});

describe("who changes the hunter and who forces a time", () => {
  it("the officer who forwarded it, while it is not done", () => {
    expect.soft(canReassign(officer, FORWARDED)).toBe(true);
    expect.soft(canReassign(officer, anAction({ estado: "realizada" }))).toBe(false);
  });

  it("the officer who owns it but did not forward it, no", () => {
    expect(canReassign(officer, anAction({ origen: "propia", creada_por: "h1" }))).toBe(false);
  });

  it("the hunter never, not even on what the hunter registered", () => {
    expect.soft(canReassign(hunter, FORWARDED)).toBe(false);
    expect.soft(canReassign(hunter, anAction({ origen: "propia", creada_por: "h1" }))).toBe(false);
  });

  it("the leader, on the team and on what was sent to assign", () => {
    expect.soft(canReassign(leader, FORWARDED)).toBe(true);
    expect.soft(canReassign(leader, anAction({ hunter_id: null, lider_id: "l1" }))).toBe(true);
    expect.soft(canReassign(leader, anAction({ estado: "realizada" }))).toBe(false);
  });

  it("not another leader", () => {
    expect(canReassign(otherLeader, FORWARDED)).toBe(false);
  });

  it("the administrator always", () => {
    expect(canReassign(administrator, anAction({ estado: "realizada" }))).toBe(true);
  });

  it("the leader can save over an overlap only on the team, and the administrator always", () => {
    expect.soft(canForce(leader, "h1")).toBe(true);
    expect.soft(canForce(leader, "h9")).toBe(false);
    expect.soft(canForce(administrator, "h9")).toBe(true);
    expect.soft(canForce(officer, "h1")).toBe(false);
    expect.soft(canForce(hunter, "h1")).toBe(false);
  });

  it("knows who is on the team", () => {
    expect.soft(isOfMyTeam(leader, "h1")).toBe(true);
    expect.soft(isOfMyTeam(leader, "h9")).toBe(false);
    expect.soft(isOfMyTeam(leader, null)).toBe(false);
  });
});

describe("the leader who will assign", () => {
  it("is offered to an officer, not to the hunter, the leader or the administrator", () => {
    expect.soft(canSendToLeader(officer)).toBe(true);
    expect.soft(canSendToLeader(hunter)).toBe(false);
    expect.soft(canSendToLeader(leader)).toBe(false);
    expect.soft(canSendToLeader(administrator)).toBe(false);
  });

  it("is not offered when there are no leaders", () => {
    expect(canSendToLeader({ ...officer, people: {} })).toBe(false);
  });

  it("lists them by name, one's own first", () => {
    expect.soft(leadersOf(officer)).toEqual(["l1", "l9"]);
    expect.soft(leaderChoices(officer, "l9").map(({ id }) => id)).toEqual(["l9", "l1"]);
    expect.soft(leaderChoices(officer, "l9")[0]?.label).toBe("Otra Líder (tu líder)");
    expect.soft(leaderChoices(officer, null)[0]?.label).toBe("Laura Méndez");
    expect.soft(leaderChoices(officer, "gone").map(({ id }) => id)).toEqual(["l1", "l9"]);
  });
});

describe("the hunters to choose from", () => {
  it("are all of them for an officer, by name", () => {
    expect(huntersOf(officer, false).map(({ id }) => id)).toEqual(["h9", "h1", "h2"]);
  });

  it("are only the team for a leader who is limited to it", () => {
    expect.soft(huntersOf(leader, true).map(({ id }) => id)).toEqual(["h1", "h2"]);
    expect.soft(huntersOf(leader, false)).toHaveLength(3);
  });

  it("are all of them for an administrator, even asked for the team", () => {
    expect(huntersOf({ ...administrator, role: "lider" }, true)).toHaveLength(3);
  });
});

describe("the buttons of an action", () => {
  const LOOKS_UP = true;

  it("the officer who forwarded it", () => {
    expect(commandsFor(officer, FORWARDED, LOOKS_UP)).toEqual([
      "complete",
      "assign",
      "flyer",
      "unread",
      "edit",
      "delete",
    ]);
  });

  it("the hunter: no change of hunter, and they can say they cannot attend", () => {
    const commands = commandsFor(hunter, FORWARDED, false);
    expect.soft(commands).not.toContain("assign");
    expect.soft(commands).toContain("cannot");
    expect.soft(commands, "the hunter goes to their screen").toContain("flyer");
    expect.soft(commands, "and does not delete what was forwarded").not.toContain("delete");
  });

  it("the hunter who already warned does not warn again", () => {
    expect(commandsFor(hunter, anAction({ no_puede_at: "2026-11-01" }), false)).not.toContain(
      "cannot",
    );
  });

  it("nothing to complete without a hunter, or once done", () => {
    expect
      .soft(commandsFor(officer, anAction({ hunter_id: null }), true))
      .not.toContain("complete");
    expect
      .soft(commandsFor(officer, anAction({ estado: "realizada" }), true))
      .not.toContain("complete");
  });

  it("no change of hunter on what was cancelled", () => {
    expect(commandsFor(administrator, anAction({ estado: "cancelada" }), true)).not.toContain(
      "assign",
    );
  });

  it("no flyer for who cannot search companies and is not a hunter", () => {
    expect(commandsFor(leader, FORWARDED, false)).not.toContain("flyer");
  });

  it("creates the next one only where the series has no number of times", () => {
    const repeated = anAction({ frecuencia: "repite", cada_dias: 7 });
    expect.soft(commandsFor(officer, repeated, true)).toContain("repeat");
    expect.soft(commandsFor(officer, { ...repeated, veces: 3 }, true)).not.toContain("repeat");
    expect.soft(commandsFor(leader, repeated, false), "only who edits").not.toContain("repeat");
  });
});
