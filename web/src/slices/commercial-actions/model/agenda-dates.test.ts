import { describe, expect, it } from "vitest";
import {
  addMonths,
  byDayAndTime,
  daysBetween,
  daysOfWeek,
  mondayOf,
  monthEnd,
  monthOf,
  monthStart,
  monthTitle,
  shortTime,
  weekdayOf,
  weekRangeText,
} from "./agenda-dates.ts";
import { today } from "./formatting.ts";

const THIS_YEAR = today().slice(0, 4);

describe("the weeks", () => {
  it.each(["2026-10-21", "2026-10-25", "2026-10-19"])(
    "the week of %s starts on Monday the 19th",
    (date) => {
      expect(mondayOf(date)).toBe("2026-10-19");
    },
  );

  it("counts the days of the week from Monday", () => {
    expect.soft(weekdayOf("2026-10-19")).toBe(0);
    expect.soft(weekdayOf("2026-10-25")).toBe(6);
  });

  it("goes Monday to Sunday, also across a month", () => {
    expect(daysOfWeek("2026-10-26")).toEqual([
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
    ]);
  });
});

describe("the months", () => {
  it("knows where one starts and ends", () => {
    expect.soft(monthOf("2026-02-11")).toBe("2026-02");
    expect.soft(monthStart("2026-02")).toBe("2026-02-01");
    expect.soft(monthEnd("2026-02")).toBe("2026-02-28");
    expect.soft(monthEnd("2024-02")).toBe("2024-02-29");
    expect.soft(monthEnd("2026-12")).toBe("2026-12-31");
  });

  it("moves across a year", () => {
    expect.soft(addMonths("2026-12", 1)).toBe("2027-01");
    expect.soft(addMonths("2027-01", -1)).toBe("2026-12");
    expect.soft(addMonths("2026-03", 0)).toBe("2026-03");
  });

  it("says its name with a capital", () => {
    expect(monthTitle("2026-11")).toBe("Noviembre 2026");
  });
});

describe("the days between two dates", () => {
  it("are 0 if one is missing", () => {
    expect.soft(daysBetween(null, "2026-11-02")).toBe(0);
    expect.soft(daysBetween("2026-11-02", null)).toBe(0);
  });

  it("go over a change of time without losing one", () => {
    expect.soft(daysBetween("2026-11-01", "2026-11-04")).toBe(3);
    expect.soft(daysBetween("2026-11-04", "2026-11-01")).toBe(-3);
  });
});

describe("what the range says", () => {
  it("with the month once, within one month", () => {
    expect(weekRangeText(`${THIS_YEAR}-10-19`, `${THIS_YEAR}-10-24`)).toBe("19 al 24 de oct");
  });

  it("with both months across two", () => {
    expect(weekRangeText(`${THIS_YEAR}-10-26`, `${THIS_YEAR}-11-01`)).toBe("26 de oct al 1 de nov");
  });

  it("with the year, if it is not this one", () => {
    expect(weekRangeText("2020-03-02", "2020-03-07")).toBe("2 al 7 de mar 2020");
  });
});

describe("a short time", () => {
  it.each([
    ["10:00:00", "12:00:00", "10–12"],
    ["09:30:00", "13:00:00", "9:30–13"],
    ["15:00:00", null, "15"],
    [null, null, ""],
  ])("from %s to %s reads %j", (from, to, text) => {
    expect(shortTime({ hora_desde: from, hora_hasta: to })).toBe(text);
  });
});

function at(fecha: string, time: string | null, empresa = "ACME") {
  return { fecha, hora_desde: time, empresa };
}

describe("the order on the agenda", () => {
  it("goes by day", () => {
    expect.soft(byDayAndTime(at("2026-11-02", "10:00"), at("2026-11-03", "09:00"))).toBe(-1);
    expect.soft(byDayAndTime(at("2026-11-03", "10:00"), at("2026-11-02", "09:00"))).toBe(1);
  });

  it("and by time, with what has no time first", () => {
    expect.soft(byDayAndTime(at("2026-11-02", "09:00"), at("2026-11-02", "10:00"))).toBeLessThan(0);
    expect.soft(byDayAndTime(at("2026-11-02", null), at("2026-11-02", "10:00"))).toBe(-1);
    expect.soft(byDayAndTime(at("2026-11-02", "10:00"), at("2026-11-02", null))).toBe(1);
  });

  it("and at the same time, by company", () => {
    expect
      .soft(byDayAndTime(at("2026-11-02", "10:00", "BETA"), at("2026-11-02", "10:00", "ACME")))
      .toBeGreaterThan(0);
  });
});
