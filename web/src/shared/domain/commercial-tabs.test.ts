import { describe, expect, it } from "vitest";
import { isInnerTab, tabsOf } from "./commercial-tabs.ts";

describe("the solapas of Gestiones", () => {
  it.each([
    ["hunter", ["agenda", "lista", "tablero"]],
    ["lider", ["agenda", "tablero", "lista"]],
    ["asesor", ["empresas", "agenda", "lista", "tablero"]],
  ])("of a %s go in their order", (role, ids) => {
    expect(tabsOf(role).map(([id]) => id)).toEqual(ids);
  });

  it("knows which are solapas", () => {
    expect([isInnerTab("agenda"), isInnerTab("empresas"), isInnerTab("otra")]).toEqual([
      true,
      true,
      false,
    ]);
  });
});
