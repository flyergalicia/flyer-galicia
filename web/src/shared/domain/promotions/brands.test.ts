import { describe, expect, it } from "vitest";
import { baseBrand, brandGroupKey } from "./brands.ts";

describe("the same brand under several names", () => {
  it("loses its ending", () => {
    expect(baseBrand("Serú Giran - Neuquén")).toBe("seru giran");
    expect(baseBrand("Babasonicos en Tucumán")).toBe("babasonicos");
    expect(baseBrand("Columbia.com.ar")).toBe("columbia");
    expect(baseBrand("Hoteles (promo)")).toBe("hoteles");
    expect(baseBrand("Coto")).toBe("coto");
    expect(baseBrand(" - ")).toBe("");
  });

  it("joins under a short name only if that name exists alone", () => {
    const bases = new Set(["adidas", "adidas mdq", "farmacia sol", "farmacia luna"]);
    expect(brandGroupKey("adidas mdq", bases)).toBe("adidas");
    expect(brandGroupKey("farmacia sol", bases)).toBe("farmacia sol");
    expect(brandGroupKey("sin grupo", bases)).toBe("sin grupo");
  });
});
