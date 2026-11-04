import { describe, expect, it } from "vitest";
import {
  forgotProblem,
  loginFailureMessage,
  loginProblem,
  NO_CONNECTION,
  passwordChangeProblem,
  registerProblem,
} from "./entry-rules.ts";

describe("what is asked before going to the server", () => {
  it("signing in needs both fields", () => {
    expect(loginProblem("", "x")).toMatch(/Complet/);
    expect(loginProblem("a@b", "")).toMatch(/Complet/);
    expect(loginProblem("a@b", "x")).toBeNull();
  });

  it("asking for an account needs a mail of the bank and a long password", () => {
    expect(registerProblem("", "a@bancogalicia.com.ar", "secreto123")).toMatch(/todos los campos/);
    expect(registerProblem("Ana", "ana@gmail.com", "secreto123")).toMatch(/@bancogalicia/);
    expect(registerProblem("Ana", "ana@bancogalicia.com.ar", "corta")).toMatch(/8 caracteres/);
    expect(registerProblem("Ana", "ANA@BancoGalicia.com.ar", "secreto123")).toBeNull();
  });

  it("asking for a new password checks the three fields", () => {
    expect(forgotProblem("", "secreto123", "secreto123")).toMatch(/tu email/);
    expect(forgotProblem("a@b", "corta", "corta")).toMatch(/8 caracteres/);
    expect(forgotProblem("a@b", "secreto123", "otra123456")).toMatch(/no coinciden/);
    expect(forgotProblem("a@b", "secreto123", "secreto123")).toBeNull();
  });

  it("changing the password asks for one that is new", () => {
    expect(passwordChangeProblem("", "secreto123", "secreto123")).toMatch(/actual/);
    expect(passwordChangeProblem("vieja", "corta", "corta")).toMatch(/8 caracteres/);
    expect(passwordChangeProblem("vieja", "secreto123", "otra123456")).toMatch(/no coinciden/);
    expect(passwordChangeProblem("secreto123", "secreto123", "secreto123")).toMatch(/distinta/);
    expect(passwordChangeProblem("vieja", "secreto123", "secreto123")).toBeNull();
  });
});

describe("what a refusal of the login means", () => {
  const CASES = [
    ["Invalid login credentials", 400, /incorrectos/],
    ["invalid_grant", 400, /incorrectos/],
    ["Email not confirmed", 400, /no está confirmada/],
    ["anything", 429, /Demasiados intentos/],
    ["For security purposes, wait", 400, /Demasiados intentos/],
    ["User is banned", 400, /deshabilitada/],
    ["boom", 500, /No se pudo ingresar/],
  ] as const;

  for (const [message, status, expected] of CASES) {
    it(`"${message}" with ${String(status)}`, () => {
      expect(loginFailureMessage({ message, status })).toMatch(expected);
    });
  }

  it("no answer at all is a problem of the connection", () => {
    expect(loginFailureMessage({ message: "", status: null })).toBe(NO_CONNECTION);
    expect(loginFailureMessage({ message: "Failed to fetch", status: 500 })).toBe(NO_CONNECTION);
  });
});
