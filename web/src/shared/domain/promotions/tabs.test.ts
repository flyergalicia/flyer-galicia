import { describe, expect, it } from "vitest";
import { isPromotionsTab, PROMOTIONS_TABS } from "./tabs.ts";

describe("the solapas of Promociones", () => {
  it("are Buscar and Activas", () => {
    expect(PROMOTIONS_TABS.map(([, label]) => label)).toEqual(["Buscar", "Activas"]);
    expect([isPromotionsTab("active"), isPromotionsTab("activas")]).toEqual([true, false]);
  });
});
