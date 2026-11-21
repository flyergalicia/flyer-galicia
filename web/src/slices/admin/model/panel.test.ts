import { describe, expect, it } from "vitest";
import {
  FIRST_PLACE,
  goToPillar,
  goToSheet,
  isSheet,
  pillarOf,
  rememberedPlace,
  rememberPlace,
} from "./panel.ts";

describe("the place in the panel", () => {
  it("knows the pillar of each sheet", () => {
    expect([pillarOf("uso"), pillarOf("padronlog"), pillarOf("vigiladas")]).toEqual([
      "admin",
      "data",
      "config",
    ]);
    expect(isSheet("facultades")).toBe(true);
    expect(isSheet("otra")).toBe(false);
  });

  it("goes to the last sheet seen of a pillar", () => {
    const onUsers = goToSheet(FIRST_PLACE, "usuarios");
    const onData = goToSheet(goToPillar(onUsers, "data"), "padronlog");
    expect(onData.sheet).toBe("padronlog");
    expect(goToPillar(onData, "admin").sheet).toBe("usuarios");
    expect(goToPillar(goToPillar(onData, "admin"), "data").sheet).toBe("padronlog");
    expect(goToPillar(FIRST_PLACE, "config").sheet).toBe("subir");
    expect(goToPillar(onData, "otra")).toBe(onData);
    expect(goToSheet(onData, "otra")).toBe(onData);
  });

  it("is remembered while the page lives", () => {
    const place = goToSheet(FIRST_PLACE, "auditoria");
    rememberPlace(place);
    expect(rememberedPlace()).toBe(place);
    rememberPlace(FIRST_PLACE);
  });
});
