import { describe, expect, it } from "vitest";
import { outcomeOf, writeProblem } from "./benchmark-writes.ts";

describe("what writing answers", () => {
  it("is done, a refusal with its words, or a connection that dropped", async () => {
    expect(await outcomeOf(Promise.resolve({ error: null }))).toEqual({ ok: true });
    expect(await outcomeOf(Promise.resolve({ error: { message: "permiso denegado" } }))).toEqual({
      ok: false,
      kind: "error",
      message: "permiso denegado",
    });
    expect(await outcomeOf(Promise.resolve({ error: { message: "" } }))).toEqual({
      ok: false,
      kind: "error",
      message: "error",
    });
    expect(await outcomeOf(Promise.reject(new TypeError("Failed to fetch")))).toEqual({
      ok: false,
      kind: "network",
    });
  });

  it("is said on screen", () => {
    expect(writeProblem({ ok: true }, "guardar")).toBeNull();
    expect(writeProblem({ ok: false, kind: "error", message: "x" }, "guardar")).toBe(
      "No se pudo guardar: x",
    );
    expect(writeProblem({ ok: false, kind: "network" }, "quitar")).toBe(
      "No se pudo quitar. Revisá la conexión.",
    );
  });
});
