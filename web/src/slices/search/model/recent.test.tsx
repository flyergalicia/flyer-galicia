import { afterEach, describe, expect, it, vi } from "vitest";
import { readRecent, RECENT_KEY, rememberRecent } from "./recent.ts";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("the recent ones", () => {
  it("keep only the ids, the last one first, without repeats, up to five", () => {
    for (const id of ["a", "b", "c", "a", "d", "e", "f"]) rememberRecent(id);
    expect(readRecent()).toEqual(["f", "e", "d", "a", "c"]);
    expect(JSON.parse(localStorage.getItem(RECENT_KEY) ?? "")).toEqual(["f", "e", "d", "a", "c"]);
  });

  it("read nothing from something that is not a list of ids", () => {
    localStorage.setItem(RECENT_KEY, "{roto");
    expect(readRecent()).toEqual([]);
    localStorage.setItem(RECENT_KEY, JSON.stringify({ id: "a" }));
    expect(readRecent()).toEqual([]);
    localStorage.setItem(RECENT_KEY, JSON.stringify(["a", { id: "b" }, 3]));
    expect(readRecent()).toEqual(["a"]);
  });

  it("without a place to keep them, the search works the same", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    expect(readRecent()).toEqual([]);
    expect(() => {
      rememberRecent("a");
    }).not.toThrow();
  });
});
