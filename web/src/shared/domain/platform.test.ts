import { describe, expect, it } from "vitest";
import { isApplePlatform } from "./platform.ts";

describe("the platform", () => {
  it("is told by its name", () => {
    expect(isApplePlatform("MacIntel")).toBe(true);
    expect(isApplePlatform("iPhone")).toBe(true);
    expect(isApplePlatform("Win32")).toBe(false);
  });
});
