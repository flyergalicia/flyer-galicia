import { describe, expect, it } from "vitest";
import { roleLabel, roleTone } from "./role-labels.ts";

describe("the roles", () => {
  it("are called as the user reads them", () => {
    expect(roleLabel("vip")).toBe("Payroll");
    expect(roleLabel("pro")).toBe("Payroll 2");
    expect(roleLabel("lider")).toBe("Líder");
    expect(roleLabel("inventado")).toBe("inventado");
  });

  it("have a color each, and an unknown one looks like an advisor", () => {
    expect(roleTone("admin")).toBe("blue");
    expect(roleTone("inventado")).toBe(roleTone("asesor"));
  });
});
