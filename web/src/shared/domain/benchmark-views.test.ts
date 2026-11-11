import { describe, expect, it } from "vitest";
import { BENCHMARK_VIEWS, isBenchView } from "./benchmark-views.ts";

describe("the views of Benchmark", () => {
  it("go in the order of their solapas", () => {
    expect(BENCHMARK_VIEWS.map(([view]) => view)).toEqual([
      "rubro",
      "marca",
      "semana",
      "comercio",
      "versus",
      "tarjetas",
    ]);
  });

  it("are only these", () => {
    expect([isBenchView("tarjetas"), isBenchView("cargadas")]).toEqual([true, false]);
  });
});
