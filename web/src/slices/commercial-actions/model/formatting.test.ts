import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addDays,
  dateLabel,
  dateTimeLabel,
  minutesOf,
  number,
  overlaps,
  percent,
  timeOf,
  timeProblem,
  timeRange,
  today,
} from "./formatting.ts";

beforeEach(() => {
  vi.useFakeTimers({ now: new Date(2026, 10, 5, 12) });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("dates", () => {
  it("say the year only when it is not this one", () => {
    expect.soft(dateLabel("2026-03-05")).toBe("5 mar");
    expect.soft(dateLabel("2025-12-01")).toBe("1 dic 2025");
    expect.soft(dateLabel("2026-03-05T10:00:00Z")).toBe("5 mar");
    expect.soft(dateLabel(null)).toBe("");
  });

  it("add days, across months", () => {
    expect.soft(addDays("2026-11-28", 7)).toBe("2026-12-05");
    expect.soft(addDays("2026-03-01", 0)).toBe("2026-03-01");
  });

  it("know today", () => {
    expect(today()).toBe("2026-11-05");
  });

  it("with the time, or nothing if they cannot be read", () => {
    expect.soft(dateTimeLabel("2026-03-05T09:07:00")).toBe("5 mar 09:07");
    expect.soft(dateTimeLabel("not a date")).toBe("");
    expect.soft(dateTimeLabel(null)).toBe("");
  });
});

describe("times", () => {
  it("read without their seconds", () => {
    expect.soft(timeOf("10:00:00")).toBe("10:00");
    expect.soft(timeOf(null)).toBe("");
    expect.soft(timeRange({ hora_desde: "10:00:00", hora_hasta: "12:30:00" })).toBe("10:00–12:30");
    expect.soft(timeRange({ hora_desde: "10:00:00", hora_hasta: null })).toBe("desde 10:00");
    expect.soft(timeRange({ hora_desde: null, hora_hasta: "12:00" })).toBe("");
  });

  it("are minutes to compare", () => {
    expect.soft(minutesOf("10:30")).toBe(630);
    expect.soft(minutesOf("")).toBeNull();
  });

  it("overlap when their spans cross, not when they touch", () => {
    const morning = { hora_desde: "10:00", hora_hasta: "12:00" };
    expect.soft(overlaps(morning, { hora_desde: "11:00", hora_hasta: "13:00" })).toBe(true);
    expect.soft(overlaps(morning, { hora_desde: "12:00", hora_hasta: "13:00" })).toBe(false);
    expect.soft(overlaps(morning, { hora_desde: "08:00", hora_hasta: "10:00" })).toBe(false);
  });

  it('take an hour with no "hasta"', () => {
    expect.soft(overlaps({ hora_desde: "10:00" }, { hora_desde: "10:30" })).toBe(true);
    expect.soft(overlaps({ hora_desde: "10:00" }, { hora_desde: "11:00" })).toBe(false);
  });

  it("compare nothing without a time", () => {
    expect(overlaps({ hora_desde: null }, { hora_desde: "10:00" })).toBe(false);
  });

  it("have to make sense", () => {
    expect.soft(timeProblem({ hora_hasta: "12:00" })).toMatch(/hora de inicio/);
    expect.soft(timeProblem({ hora_desde: "12:00", hora_hasta: "12:00" })).toMatch(/después/);
    expect.soft(timeProblem({ hora_desde: "10:00", hora_hasta: "12:00" })).toBeNull();
    expect.soft(timeProblem({})).toBeNull();
  });
});

describe("numbers", () => {
  it("say a percentage only of something", () => {
    expect.soft(percent(1, 3)).toBe("33%");
    expect.soft(percent(1, 0)).toBe("—");
  });

  it("have the dots of here", () => {
    expect.soft(number(1234)).toBe("1.234");
    expect.soft(number(null)).toBe("0");
  });
});
