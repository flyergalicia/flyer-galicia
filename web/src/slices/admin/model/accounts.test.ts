import { describe, expect, it } from "vitest";
import {
  type Account,
  accountButtons,
  accountName,
  canBeDeleted,
  filterAccounts,
  isWaiting,
  leaderName,
  leadersFor,
  showsRole,
  statusLabel,
  statusTone,
} from "./accounts.ts";

function account(fields: Partial<Account>): Account {
  return {
    id: "a",
    full_name: null,
    email: null,
    email_asesor: null,
    role: "asesor",
    status: "active",
    celular_asesor: null,
    es_prueba: false,
    facultades: null,
    flyer_fav: null,
    last_login: null,
    last_reset_request_at: null,
    lider_id: null,
    nombre_asesor: null,
    suplente_id: null,
    ...fields,
  };
}

describe("the buttons of an account", () => {
  it("a pending one is approved or rejected, and its role is not shown yet", () => {
    const pending = account({ status: "pending" });
    expect(accountButtons(pending).map(({ label }) => label)).toEqual(["Aprobar", "Rechazar"]);
    expect(showsRole(pending)).toBe(false);
    expect(isWaiting(pending)).toBe(true);
  });

  it("a change of password is applied or discarded, keeping the account as it was", () => {
    const resetting = account({ status: "reset_pending" });
    expect(accountButtons(resetting).map(({ action }) => action)).toEqual([
      "approve-reset",
      "deny-reset",
    ]);
    expect(accountButtons(resetting)[1]?.hint).toMatch(/sigue con su clave anterior/);
    expect(showsRole(resetting)).toBe(true);
    expect(isWaiting(resetting)).toBe(true);
  });

  it("an active one is deactivated and an inactive one activated, and both are edited", () => {
    expect(accountButtons(account({ status: "active" })).map(({ label }) => label)).toEqual([
      "Desactivar",
      "Editar",
    ]);
    expect(accountButtons(account({ status: "inactive" })).map(({ label }) => label)).toEqual([
      "Activar",
      "Editar",
    ]);
    expect(isWaiting(account({ status: "inactive" }))).toBe(false);
  });
});

describe("what an account says", () => {
  it("its status, in words and in color", () => {
    expect([
      statusLabel("active"),
      statusLabel("pending"),
      statusLabel("reset_pending"),
      statusLabel("inactive"),
      statusLabel(null),
    ]).toEqual(["Activo", "Pendiente", "Cambio de clave", "Inactivo", "Inactivo"]);
    expect([statusTone("active"), statusTone("reset_pending"), statusTone("x")]).toEqual([
      "green",
      "amber",
      "red",
    ]);
  });

  it("its name, or its mail, or nothing", () => {
    expect(accountName(account({ full_name: "Ana", email_asesor: "a@b" }))).toBe("Ana");
    expect(accountName(account({ email_asesor: "a@b" }))).toBe("a@b");
    expect(accountName(account({}))).toBe("");
  });

  it("nobody deletes their own account", () => {
    expect(canBeDeleted(account({ id: "yo" }), "yo")).toBe(false);
    expect(canBeDeleted(account({ id: "otro" }), "yo")).toBe(true);
  });
});

describe("the list", () => {
  const list = [
    account({ id: "1", full_name: "Ana Perez", email_asesor: "ana@b.com", status: "active" }),
    account({ id: "2", full_name: "Luis", email_asesor: "LUIS@b.com", status: "pending" }),
    account({ id: "3", full_name: null, email_asesor: null, status: "inactive" }),
  ];

  it("is searched by name or mail, without minding capitals, and filtered by status", () => {
    expect(filterAccounts(list, "ANA", "").map(({ id }) => id)).toEqual(["1"]);
    expect(filterAccounts(list, "luis@", "").map(({ id }) => id)).toEqual(["2"]);
    expect(filterAccounts(list, "", "pending").map(({ id }) => id)).toEqual(["2"]);
    expect(filterAccounts(list, "ana", "pending")).toEqual([]);
    expect(filterAccounts(list, "", "")).toHaveLength(3);
  });

  it("offers as leaders only the leaders, and never the person being edited", () => {
    const leaders = [
      account({ id: "l1", role: "lider", full_name: "Lidia" }),
      account({ id: "l2", role: "lider", email: "l2@b.com" }),
      account({ id: "l3", role: "lider" }),
      account({ id: "x", role: "asesor" }),
    ];
    expect(leadersFor(leaders, "l1").map(({ id }) => id)).toEqual(["l2", "l3"]);
    expect(leadersFor(leaders, null).map(leaderName)).toEqual(["Lidia", "l2@b.com", "Sin nombre"]);
  });
});
