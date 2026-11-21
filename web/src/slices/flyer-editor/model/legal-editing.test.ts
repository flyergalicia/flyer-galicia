import { describe, expect, it } from "vitest";
import { isInsideBold, toggleBold } from "./legal-editing.ts";

describe("the bold of the legal", () => {
  it("puts the marks around what is selected", () => {
    expect(toggleBold({ value: "uno dos tres", start: 4, end: 7 })).toEqual({
      value: "uno **dos** tres",
      start: 6,
      end: 9,
    });
  });

  it("takes them away when it already was in bold", () => {
    expect(toggleBold({ value: "uno **dos** tres", start: 6, end: 9 })).toEqual({
      value: "uno dos tres",
      start: 4,
      end: 7,
    });
  });

  it("takes them away when they were selected too", () => {
    expect(toggleBold({ value: "uno **dos** tres", start: 4, end: 11 })).toEqual({
      value: "uno dos tres",
      start: 4,
      end: 7,
    });
  });

  it("with nothing selected it takes the word under the cursor", () => {
    expect(toggleBold({ value: "uno dos tres", start: 5, end: 5 })?.value).toBe("uno **dos** tres");
  });

  it("with no word there, there is nothing to do", () => {
    expect(toggleBold({ value: "uno  dos", start: 4, end: 4 })).toBeNull();
    expect(toggleBold({ value: "", start: 0, end: 0 })).toBeNull();
  });

  it("leaves the outer spaces out, and does not nest marks", () => {
    expect(toggleBold({ value: "uno dos tres", start: 3, end: 8 })?.value).toBe("uno **dos** tres");
    expect(toggleBold({ value: "a **b** c", start: 0, end: 9 })?.value).toBe("**a b c**");
  });

  it("knows when the cursor is inside a bold part", () => {
    expect(isInsideBold("uno **dos** tres", 2)).toBe(false);
    expect(isInsideBold("uno **dos** tres", 7)).toBe(true);
    expect(isInsideBold("uno **dos** tres", 13)).toBe(false);
  });
});
