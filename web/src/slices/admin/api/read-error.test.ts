import { describe, expect, it } from "vitest";
import { messageOf } from "./read-error.ts";

describe("what a failure says", () => {
  it("is the message of the server, or that there was no connection", () => {
    expect(messageOf(new Error("sin permiso"))).toBe("sin permiso");
    expect(messageOf({ message: "relation does not exist" })).toBe("relation does not exist");
    expect(messageOf("texto")).toBe("texto");
    expect(messageOf({ message: "" })).toBe("sin conexión");
    expect(messageOf(null)).toBe("sin conexión");
    expect(messageOf({ message: 5 })).toBe("sin conexión");
  });
});
