import { describe, expect, it } from "vitest";
import { listStatus } from "./list-status.ts";

describe("the line above the list", () => {
  it("says how many there are, with no search", () => {
    expect(listStatus("", 1, 1, 40)).toBe("1 empresa cargada");
    expect(listStatus(" ", 3, 3, 40)).toBe("3 empresas cargadas");
    expect(listStatus("", 40, 41, 40)).toBe(
      "41 empresas cargadas — se muestran las primeras 40, escribí para filtrar",
    );
  });

  it("says how many it found, with a search", () => {
    expect(listStatus("acme", 2, 50, 40)).toBe("2 de 50");
    expect(listStatus("sa", 40, 50, 40)).toBe("40 de 50 — se muestran las primeras 40");
  });
});
