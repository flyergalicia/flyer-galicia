import { describe, expect, it } from "vitest";
import { relativeDate } from "./relative-date.ts";

const NOW = new Date("2026-10-20T12:00:00");

describe("when something happened", () => {
  it("nothing known is a dash", () => {
    expect(relativeDate("", NOW)).toBe("—");
    expect(relativeDate(null, NOW)).toBe("—");
    expect(relativeDate(undefined, NOW)).toBe("—");
  });

  it("near now it says how long ago", () => {
    expect(relativeDate("2026-10-20T11:59:30", NOW)).toBe("hace un momento");
    expect(relativeDate("2026-10-20T11:30:00", NOW)).toBe("hace 30 min");
    expect(relativeDate("2026-10-20T07:00:00", NOW)).toBe("hace 5h");
    expect(relativeDate("2026-10-19T07:00:00", NOW)).toBe("ayer");
  });

  it("further back it says the date", () => {
    expect(relativeDate("2026-03-05T07:00:00", NOW)).toBe("05/03/2026");
  });

  it("without a date to compare with, it uses today", () => {
    expect(relativeDate(new Date().toISOString())).toBe("hace un momento");
  });
});
