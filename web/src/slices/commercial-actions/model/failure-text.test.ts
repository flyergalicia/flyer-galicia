import { describe, expect, it } from "vitest";
import { failureText, messageOf } from "./failure-text.ts";

describe("the refusals of the database", () => {
  it("are told in Spanish", () => {
    const overlap = { message: "GES_PISA: ese hunter ya tiene algo de 15:00 a 17:00 ese día" };

    expect.soft(failureText(overlap)).toMatch(/se pisa con otra acción/);
    expect.soft(failureText(overlap)).toMatch(/15:00 a 17:00/);
    expect.soft(failureText({ message: "GES_PISA" })).not.toMatch(/\(/);
    expect.soft(failureText({ message: "GES_PAQ: x" })).toMatch(/paquete/);
    expect.soft(failureText({ message: "GES_MOT: x" })).toMatch(/por qué se descarta/);
    expect.soft(failureText(new Error("otra cosa"))).toBe("otra cosa");
  });

  it("read whatever comes", () => {
    expect.soft(messageOf("texto")).toBe("texto");
    expect.soft(messageOf(null)).toBe("");
    expect.soft(messageOf({ other: 1 })).toBe("");
  });
});
