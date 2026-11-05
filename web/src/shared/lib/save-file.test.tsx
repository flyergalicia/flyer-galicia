import { afterEach, describe, expect, it, vi } from "vitest";
import { saveFile, SHEET_TYPE } from "./save-file.ts";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("a file made in memory", () => {
  it("is given to the browser with its name and type, and its address let go later", () => {
    vi.useFakeTimers();
    const made: Blob[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      if (blob instanceof Blob) made.push(blob);
      return "blob:file";
    });
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const clicked: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this.download);
    });
    saveFile("hola", "lista.xlsx", SHEET_TYPE);
    expect(clicked).toEqual(["lista.xlsx"]);
    expect(made[0]?.type).toBe(SHEET_TYPE);
    expect(document.querySelector('a[download="lista.xlsx"]')).toBeNull();
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(4000);
    expect(revoke).toHaveBeenCalledWith("blob:file");
  });
});
