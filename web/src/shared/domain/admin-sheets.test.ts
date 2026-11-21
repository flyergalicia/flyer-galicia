import { describe, expect, it } from "vitest";
import { isSheet, pillarOf, PILLARS, SHEETS } from "./admin-sheets.ts";

describe("the sheets of the panel", () => {
  it("go in three pillars, each sheet in one", () => {
    const all = PILLARS.flatMap(([pillar]) => SHEETS[pillar].map(([id]) => id));
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(15);
  });

  it("know the pillar of each sheet", () => {
    expect([pillarOf("uso"), pillarOf("padronlog"), pillarOf("vigiladas")]).toEqual([
      "admin",
      "data",
      "config",
    ]);
    expect([isSheet("facultades"), isSheet("otra")]).toEqual([true, false]);
    expect(pillarOf("otra")).toBe("admin");
  });
});
