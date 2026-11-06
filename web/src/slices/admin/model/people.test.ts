import { describe, expect, it } from "vitest";
import { avatarColor, peopleNames } from "./people.ts";

describe("the color of a person", () => {
  it("is the one the current app gives to the same text", () => {
    // Worked out with _avatarColor of auth.js.
    expect(avatarColor("x")).toBe("#c62828");
    expect(avatarColor("00000000-0000-4000-8000-0000000000a1")).toBe("#e65100");
    expect(avatarColor("Ana Perez")).toBe("#4527a0");
    expect(avatarColor("")).toBe("#c62828");
  });

  it("counts the units of a text as the current app does, not its characters", () => {
    // An emoji is two units: the hash goes over both.
    expect(avatarColor("🙂")).toBe(avatarColor("🙂"));
  });
});

describe("the names of the logs", () => {
  it("are the full name, the mail or Usuario", () => {
    const names = peopleNames([
      { id: "1", full_name: "Ana", email_asesor: "a@b" },
      { id: "2", full_name: null, email_asesor: "b@b" },
      { id: "3", full_name: "", email_asesor: null },
    ]);
    expect([names.get("1"), names.get("2"), names.get("3")]).toEqual(["Ana", "b@b", "Usuario"]);
  });
});
