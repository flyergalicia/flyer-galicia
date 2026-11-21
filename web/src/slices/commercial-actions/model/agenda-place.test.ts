import { describe, expect, it } from "vitest";
import { mondayOf, monthOf } from "./agenda-dates.ts";
import {
  type AgendaPlace,
  atDate,
  dayShown,
  daysShown,
  mondayShown,
  monthShown,
  moved,
  moveWord,
  NO_PLACE,
  rangeOf,
  savedView,
  titleOf,
  viewOf,
  withView,
} from "./agenda-place.ts";
import { addDays, dateLabel, today } from "./formatting.ts";

const MONDAY = "2026-10-19";
const WEEK: AgendaPlace = { ...NO_PLACE, monday: MONDAY };
const SIX_DAYS = [
  "2026-10-19",
  "2026-10-20",
  "2026-10-21",
  "2026-10-22",
  "2026-10-23",
  "2026-10-24",
];

describe("which view", () => {
  it("whoever assigns starts on the day of all the hunters", () => {
    expect.soft(viewOf(NO_PLACE, "vip")).toBe("equipo");
    expect.soft(viewOf(NO_PLACE, "lider")).toBe("equipo");
    expect.soft(viewOf(NO_PLACE, "admin")).toBe("equipo");
  });

  it("a hunter, on their week", () => {
    expect(viewOf(NO_PLACE, "hunter")).toBe("sem");
  });

  it("what was chosen is what stays", () => {
    expect.soft(viewOf({ ...NO_PLACE, view: "mes" }, "hunter")).toBe("mes");
    expect.soft(viewOf({ ...NO_PLACE, view: "sem" }, "vip")).toBe("sem");
  });

  it("only takes as saved what is a view", () => {
    expect.soft(savedView("mes")).toBe("mes");
    expect.soft(savedView("sem")).toBe("sem");
    expect.soft(savedView("equipo")).toBe("equipo");
    expect.soft(savedView("dia")).toBe("dia");
    expect.soft(savedView("otra")).toBeNull();
    expect.soft(savedView(null)).toBeNull();
  });
});

describe("the range", () => {
  it("starts on today's week and month", () => {
    expect.soft(mondayShown(NO_PLACE)).toBe(mondayOf(today()));
    expect.soft(monthShown(NO_PLACE)).toBe(monthOf(today()));
  });

  it("of the week, and of the day, which is the same memory", () => {
    const range = { from: MONDAY, to: "2026-10-25" };
    expect.soft(rangeOf(WEEK, "sem")).toEqual(range);
    expect.soft(rangeOf(WEEK, "dia")).toEqual(range);
    expect.soft(rangeOf(WEEK, "equipo")).toEqual(range);
  });

  it("of the month", () => {
    expect(rangeOf({ ...NO_PLACE, month: "2026-11" }, "mes")).toEqual({
      from: "2026-11-01",
      to: "2026-11-30",
    });
  });
});

describe("the days it shows", () => {
  it("Sunday, only if it has something", () => {
    expect.soft(daysShown(WEEK, [])).toEqual(SIX_DAYS);
    expect.soft(daysShown(WEEK, [{ fecha: "2026-10-25" }])).toHaveLength(7);
    expect.soft(daysShown(WEEK, [{ fecha: "2026-10-22" }])).toHaveLength(6);
  });
});

describe("the day it looks at", () => {
  it("the chosen one, if it is on the week", () => {
    expect(dayShown({ ...WEEK, day: "2026-10-21" }, "equipo", SIX_DAYS)).toBe("2026-10-21");
  });

  it("its Monday, if today is another week", () => {
    expect(dayShown(WEEK, "sem", SIX_DAYS)).toBe(MONDAY);
  });

  it("if the one chosen is not there (a Sunday with nothing), today or Monday", () => {
    expect(dayShown({ ...WEEK, day: "2026-10-25" }, "equipo", SIX_DAYS)).toBe(MONDAY);
  });

  it("today, if it is on the week", () => {
    const monday = mondayOf(today());
    const days = Array.from({ length: 7 }, (_, index) => addDays(monday, index));
    expect(dayShown({ ...NO_PLACE, monday }, "equipo", days)).toBe(today());
  });

  it("on the month, whichever was left", () => {
    expect.soft(dayShown({ ...WEEK, day: "2026-10-21" }, "mes", SIX_DAYS)).toBe("2026-10-21");
    expect.soft(dayShown(WEEK, "mes", SIX_DAYS)).toBeNull();
  });

  it("with no days, none", () => {
    expect(dayShown(WEEK, "sem", [])).toBeNull();
  });
});

describe("the title", () => {
  it("of the month", () => {
    expect(titleOf({ ...NO_PLACE, month: "2026-11" }, "mes", null, [])).toBe("Noviembre 2026");
  });

  it("of one day", () => {
    expect.soft(titleOf(WEEK, "equipo", "2026-10-21", SIX_DAYS)).toBe(dateLabel("2026-10-21"));
    expect.soft(titleOf(WEEK, "dia", "2026-10-21", SIX_DAYS)).toBe(dateLabel("2026-10-21"));
  });

  it("of the week", () => {
    expect(titleOf(WEEK, "sem", MONDAY, SIX_DAYS)).toMatch(/^19 al 24 de oct/);
  });
});

describe("the arrows", () => {
  it("say what they move", () => {
    expect.soft(moveWord("mes")).toBe("Mes");
    expect.soft(moveWord("equipo")).toBe("Día");
    expect.soft(moveWord("dia")).toBe("Día");
    expect.soft(moveWord("sem")).toBe("Semana");
  });

  it("move a week, and forget the day", () => {
    const place = moved({ ...WEEK, day: "2026-10-21" }, "sem", 1);
    expect.soft(place.monday).toBe("2026-10-26");
    expect.soft(place.day).toBeNull();
    expect.soft(moved(WEEK, "sem", -1).monday).toBe("2026-10-12");
  });

  it("move a day, and the week if it goes out of it", () => {
    const place = moved({ ...WEEK, day: "2026-10-19" }, "equipo", -1);
    expect.soft(place.day).toBe("2026-10-18");
    expect.soft(place.monday).toBe("2026-10-12");
  });

  it("move a day from today if none was chosen", () => {
    expect(moved(WEEK, "dia", 1).day).toBe(addDays(today(), 1));
  });

  it("move a month", () => {
    expect.soft(moved({ ...NO_PLACE, month: "2026-12" }, "mes", 1).month).toBe("2027-01");
    expect.soft(moved({ ...NO_PLACE, month: "2026-01" }, "mes", -1).month).toBe("2025-12");
  });

  it("Hoy goes back to today, from any view", () => {
    expect.soft(moved(WEEK, "sem", 0).monday).toBe(mondayOf(today()));
    expect.soft(moved(WEEK, "equipo", 0).day).toBe(today());
    expect.soft(moved({ ...WEEK, month: "2020-01" }, "mes", 0).month).toBe(monthOf(today()));
  });
});

describe("changing the view", () => {
  it("stands on the day that was being looked at", () => {
    const place = withView({ ...WEEK, day: "2026-10-22" }, "sem", "equipo");
    expect.soft(place.view).toBe("equipo");
    expect.soft(place.day).toBe("2026-10-22");
    expect.soft(place.monday).toBe(MONDAY);
  });

  it("from one day to the week, without a day of its own", () => {
    const place = withView({ ...WEEK, day: "2026-10-22" }, "equipo", "sem");
    expect.soft(place.day).toBeNull();
    expect.soft(place.monday).toBe(MONDAY);
  });

  it("to the month, the one of that day", () => {
    const place = withView({ ...WEEK, day: "2026-10-22" }, "equipo", "mes");
    expect.soft(place.view).toBe("mes");
    expect.soft(place.month).toBe("2026-10");
  });

  it("from a month of another time, to its first week", () => {
    const place = withView({ ...NO_PLACE, month: "2026-02" }, "mes", "sem");
    expect.soft(place.monday).toBe(mondayOf("2026-02-01"));
    const day = withView({ ...NO_PLACE, month: "2026-02" }, "mes", "dia");
    expect.soft(day.day).toBe("2026-02-01");
  });

  it("from this month, to today", () => {
    const place = withView({ ...NO_PLACE, month: monthOf(today()) }, "mes", "equipo");
    expect(place.day).toBe(today());
  });

  it("with nothing chosen, from today", () => {
    expect(withView(NO_PLACE, "sem", "equipo").day).toBe(today());
  });

  it("from a week with no day, from its Monday", () => {
    expect(withView(WEEK, "sem", "equipo").day).toBe(MONDAY);
  });
});

describe("what was just saved", () => {
  it("is shown on its date", () => {
    expect(atDate({ ...WEEK, hunter: "h1" }, "2027-03-03")).toEqual({
      ...WEEK,
      hunter: "h1",
      monday: "2027-03-01",
      month: "2027-03",
      day: "2027-03-03",
    });
  });
});
