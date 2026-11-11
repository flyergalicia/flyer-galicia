import { describe, expect, it } from "vitest";
import { hasOpenWindow } from "./has-open-window.ts";

describe("a window on top", () => {
  it("is recognized by what makes it one", () => {
    const page = document.createElement("div");
    expect(hasOpenWindow(page)).toBe(false);

    page.innerHTML = '<div role="alertdialog"></div>';
    expect(hasOpenWindow(page)).toBe(true);
  });

  it("looks in the document by default", () => {
    expect(hasOpenWindow()).toBe(false);
  });
});
