import { afterEach, describe, expect, it, vi } from "vitest";
import { markTourSeen, tourKey, tourSeen } from "./seen.ts";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("what was seen", () => {
  it("is remembered by person, under the key of today", () => {
    expect(tourKey("u1")).toBe("fg_tour_done_u1");
    expect(tourKey(null)).toBe("fg_tour_done_anon");
    expect(tourSeen("u1")).toBe(false);

    markTourSeen("u1");

    expect(localStorage.getItem("fg_tour_done_u1")).toBe("1");
    expect(tourSeen("u1")).toBe(true);
    expect(tourSeen("u2")).toBe(false);
  });

  it("without a place to keep it, it still works: it just does not remember", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(() => {
      markTourSeen("u1");
    }).not.toThrow();
    expect(tourSeen("u1")).toBe(false);
  });
});
