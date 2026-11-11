import { describe, expect, it } from "vitest";
import { type CallEdge, failure, success } from "@/shared/supabase/index.ts";
import { refreshBenchmark } from "./refresh.ts";

type Answer = (action: string, payload: Readonly<Record<string, unknown>>) => ReturnType<CallEdge>;

interface Recorded {
  readonly calls: string[];
  readonly said: string[];
}

async function run(answer: Answer): Promise<Recorded & { readonly result: string }> {
  const calls: string[] = [];
  const said: string[] = [];
  const callEdge: CallEdge = (_fn, action, ...args) => {
    const payload: Readonly<Record<string, unknown>> = args[0] ?? {};
    calls.push(typeof payload.banco === "string" ? `${action}:${payload.banco}` : action);
    return answer(action, payload);
  };
  const result = await refreshBenchmark(callEdge, {
    say: (text) => {
      said.push(text);
    },
  });
  return { calls, said, result };
}

const done: Answer = (action) =>
  Promise.resolve(
    success(
      action === "sync"
        ? { data: { resultados: [{ total: 1 }] } }
        : { data: { hechas: 0, pendientes: 0 } },
    ),
  );

describe("Actualizar ahora", () => {
  it("asks bank by bank, then the websites, the catalog of Galicia and at last the places", async () => {
    const { calls, said, result } = await run(done);
    expect(calls).toEqual([
      "sync:galicia",
      "sync:bbva",
      "sync:macro",
      "sync:supervielle",
      "sync:santander",
      "sync:icbc",
      "bbva",
      "supervielle",
      "galicia",
      "marcas",
    ]);
    expect(said).toEqual([
      "Actualizando Galicia…",
      "Actualizando BBVA…",
      "Actualizando Macro…",
      "Actualizando Supervielle…",
      "Actualizando Santander…",
      "Actualizando ICBC…",
      "Actualizando la web de BBVA…",
      "Actualizando la web de Supervielle…",
      "Galicia (detalle de cada promo)…",
      "Actualizando lugares y logos…",
    ]);
    expect(result).toBe("Benchmark actualizado.");
  });

  it("sends a short budget, under the cut of the call, and goes on while some are left", async () => {
    const left = { galicia: [3, 0], marcas: [2, 1, 0] };
    const budgets: unknown[] = [];
    const { calls, said } = await run((action, payload) => {
      if (action === "galicia" || action === "marcas") {
        budgets.push(payload.presupuestoMs);
        return Promise.resolve(success({ data: { pendientes: left[action].shift() } }));
      }
      return done(action, payload);
    });
    expect(calls.filter((call) => call === "galicia")).toHaveLength(2);
    expect(calls.filter((call) => call === "marcas")).toHaveLength(3);
    expect(new Set(budgets)).toEqual(new Set([18_000]));
    expect(said).toContain("Galicia (faltan 3)…");
    expect(said).toContain("Lugares y logos (faltan 1)…");
  });

  it("stops after 41 rounds even if the server says some are left", async () => {
    const { calls } = await run((action, payload) =>
      action === "marcas"
        ? Promise.resolve(success({ data: { pendientes: 5 } }))
        : done(action, payload),
    );
    expect(calls.filter((call) => call === "marcas")).toHaveLength(41);
  });

  it("goes on after what fails, and at the end says what could not be updated", async () => {
    const { calls, result } = await run((action, payload) => {
      if (payload.banco === "macro") {
        return Promise.resolve(
          success({ data: { resultados: [{ error: "MODO respondió 500" }] } }),
        );
      }
      if (payload.banco === "icbc" || action === "marcas") {
        return Promise.resolve(failure({ kind: "network", message: "Error de red" }));
      }
      if (action === "bbva" || action === "supervielle" || action === "galicia") {
        return Promise.resolve(
          failure({ kind: "http", status: 500, message: "falló", data: null }),
        );
      }
      return done(action, payload);
    });
    expect(calls.at(-1)).toBe("marcas");
    expect(result).toBe(
      "Algo no se pudo actualizar: Macro: MODO respondió 500 · ICBC: sin conexión · BBVA propio: falló · Supervielle propio: falló · Galicia propio: falló · lugares y logos",
    );
  });

  it("an answer without results or with an unknown shape is not an error", async () => {
    const { result } = await run(() => Promise.resolve(success(null)));
    expect(result).toBe("Benchmark actualizado.");
  });
});
