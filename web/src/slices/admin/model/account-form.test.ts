import { describe, expect, it } from "vitest";
import {
  accessToSend,
  becomesActive,
  editAccountForm,
  editProblem,
  newAccountForm,
  newAccountProblem,
} from "./account-form.ts";
import type { Account } from "./accounts.ts";

function account(fields: Partial<Account>): Account {
  return {
    id: "u1",
    full_name: null,
    email: null,
    email_asesor: null,
    role: null,
    status: null,
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

function before(status: string): Account {
  return account({
    full_name: "Ana",
    email: "ana@bancogalicia.com.ar",
    role: "pro",
    status,
    lider_id: "l1",
  });
}

describe("a new account", () => {
  it("starts as an active advisor, with nothing written", () => {
    expect(newAccountForm()).toMatchObject({ role: "asesor", status: "active", name: "" });
  });

  it("needs a name, a mail with an at and a password of eight", () => {
    const form = newAccountForm();
    expect(newAccountProblem(form)).toMatch(/nombre completo es requerido/);
    expect(newAccountProblem({ ...form, name: "  " })).toMatch(/nombre completo/);
    expect(newAccountProblem({ ...form, name: "Ana", email: "sin-arroba" })).toMatch(
      /email válido/,
    );
    expect(newAccountProblem({ ...form, name: "Ana", email: "  " })).toMatch(/email válido/);
    expect(newAccountProblem({ ...form, name: "Ana", email: "a@b", password: "1234567" })).toMatch(
      /al menos 8 caracteres/,
    );
    expect(newAccountProblem({ ...form, name: "Ana", email: "a@b", password: "12345678" })).toBe(
      "",
    );
  });
});

describe("editing an account", () => {
  it("starts with what the account has, and the access to send to its own mail", () => {
    const form = editAccountForm(before("inactive"));
    expect(form).toMatchObject({
      name: "Ana",
      email: "ana@bancogalicia.com.ar",
      role: "pro",
      status: "inactive",
      leader: "l1",
      sendAccess: false,
      sendTo: "ana@bancogalicia.com.ar",
    });
    const empty = editAccountForm(account({}));
    expect(empty).toMatchObject({ name: "", email: "", role: "asesor", status: "active" });
  });

  it("a new password is optional, but of eight when there is one", () => {
    const form = editAccountForm(before("active"));
    expect(editProblem(form)).toBe("");
    expect(editProblem({ ...form, name: "" })).toMatch(/nombre completo/);
    expect(editProblem({ ...form, password: "corta" })).toMatch(/nueva contraseña/);
  });

  it("the user and the password go only with a new password and the option ticked", () => {
    const form = { ...editAccountForm(before("active")), password: "ClaveNueva123" };
    expect(accessToSend(form)).toBeNull();
    expect(
      accessToSend({ ...form, sendAccess: true, sendTo: " jefe@b.com ", sendName: " Carlos " }),
    ).toEqual({
      to: "jefe@b.com",
      name: "Carlos",
    });
    expect(accessToSend({ ...form, password: "", sendAccess: true })).toBeNull();
    expect(editProblem({ ...form, sendAccess: true, sendTo: "jefe-sin-arroba" })).toMatch(
      /a qué mail/,
    );
  });

  it("going to active approves it, which sends its mail; an account already active does not", () => {
    expect(becomesActive(before("inactive"), "active")).toBe(true);
    expect(becomesActive(before("pending"), "active")).toBe(true);
    expect(becomesActive(before("active"), "active")).toBe(false);
    expect(becomesActive(before("reset_pending"), "active")).toBe(false);
    expect(becomesActive(before("inactive"), "inactive")).toBe(false);
    expect(becomesActive(undefined, "active")).toBe(false);
  });
});
