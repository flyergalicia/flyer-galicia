import { describe, expect, it } from "vitest";
import { initialsOf } from "./initials.ts";

describe("the initials of a person", () => {
  it("take the first and the last word", () => {
    expect(initialsOf("Asesor Prueba")).toBe("AP");
    expect(initialsOf("  ana maria perez ")).toBe("AP");
  });

  it("take two letters of a single word", () => {
    expect(initialsOf("Nicolas")).toBe("NI");
  });

  it("use the mail when there is no name", () => {
    expect(initialsOf("", "ana@bancogalicia.com.ar")).toBe("AN");
    expect(initialsOf("")).toBe("??");
  });
});
