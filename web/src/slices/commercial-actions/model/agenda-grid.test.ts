import { describe, expect, it } from "vitest";
import {
  anHourLater,
  frameOf,
  hourBand,
  hourLabel,
  minutesAtTouch,
  placedBlocks,
  teamCells,
  timeFromMinutes,
} from "./agenda-grid.ts";

const span = (from: string | null, to: string | null, id = `${String(from)}-${String(to)}`) => ({
  id,
  hora_desde: from,
  hora_hasta: to,
});

describe("the band of hours", () => {
  it("goes from 8 to 18 with nothing in it", () => {
    expect(hourBand([])).toEqual({ first: 8, last: 18 });
  });

  it("stretches so that nothing is hidden", () => {
    expect(hourBand([span("07:30:00", "09:00:00"), span("19:00:00", "20:30:00")])).toEqual({
      first: 7,
      last: 21,
    });
  });

  it('counts one hour without "hasta", which still fits the band', () => {
    expect(hourBand([span("10:00:00", null)])).toEqual({ first: 8, last: 18 });
  });

  it("and stretches with that hour when it does not fit", () => {
    expect(hourBand([span("18:00:00", null)])).toEqual({ first: 8, last: 19 });
  });

  it("does not look at what has no time", () => {
    expect(hourBand([span(null, null)])).toEqual({ first: 8, last: 18 });
  });

  it("does not go past the day", () => {
    expect(hourBand([span("23:30:00", null), span("00:30:00", "01:00:00")])).toEqual({
      first: 0,
      last: 24,
    });
  });

  it("an end before the start counts as one hour", () => {
    expect(hourBand([span("20:00:00", "19:00:00")])).toEqual({ first: 8, last: 21 });
  });
});

describe("what overlaps", () => {
  it("goes side by side", () => {
    const [first, second] = placedBlocks([span("10:00", "12:00"), span("11:00", "13:00")]);

    expect.soft(first?.columns).toBe(2);
    expect.soft(second?.columns).toBe(2);
    expect.soft(first?.column).not.toBe(second?.column);
  });

  it("with each action taking the whole width when it does not overlap", () => {
    const blocks = placedBlocks([span("09:00", "10:00"), span("11:00", "12:00")]);

    expect.soft(blocks).toHaveLength(2);
    expect.soft(blocks[0]?.columns).toBe(1);
    expect.soft(blocks[1]?.columns).toBe(1);
  });

  it("one ending when another starts does not overlap", () => {
    const blocks = placedBlocks([span("09:00", "10:00"), span("10:00", "11:00")]);

    expect.soft(blocks[0]?.columns).toBe(1);
    expect.soft(blocks[1]?.columns).toBe(1);
  });

  it("three at once are three columns, and a group apart is its own", () => {
    const blocks = placedBlocks([
      span("09:00", "12:00"),
      span("09:30", "10:00"),
      span("09:45", "11:00"),
      span("15:00", "16:00"),
    ]);

    expect.soft(blocks.slice(0, 3).map(({ columns }) => columns)).toEqual([3, 3, 3]);
    expect.soft(new Set(blocks.slice(0, 3).map(({ column }) => column)).size).toBe(3);
    expect.soft(blocks[3]?.columns).toBe(1);
  });

  it("a column that was left free is used again", () => {
    const blocks = placedBlocks([
      span("09:00", "12:00"),
      span("09:00", "10:00"),
      span("10:30", "11:00"),
    ]);

    expect.soft(blocks.map(({ column }) => column)).toEqual([0, 1, 0]);
    expect.soft(blocks[0]?.columns).toBe(2);
  });

  it("leaves out of the grid what has no time", () => {
    expect(placedBlocks([span(null, null)])).toHaveLength(0);
  });

  it("goes by when it starts", () => {
    const blocks = placedBlocks([span("11:00", "12:00", "b"), span("09:00", "10:00", "a")]);
    expect(blocks.map(({ item }) => item.id)).toEqual(["a", "b"]);
  });
});

describe("where a block goes", () => {
  it("at its time, with its height", () => {
    const [block] = placedBlocks([span("10:00", "12:00")]);
    if (!block) throw new Error("No block");
    expect(frameOf(block, 8)).toEqual({ top: 92, height: 92, left: 0, width: 100 });
  });

  it("even if it is short, it can be read", () => {
    const [block] = placedBlocks([span("10:00", "10:10")]);
    if (!block) throw new Error("No block");
    expect(frameOf(block, 8).height).toBe(20);
  });

  it("on half of the width if there are two", () => {
    const [, second] = placedBlocks([span("10:00", "12:00"), span("11:00", "13:00")]);
    if (!second) throw new Error("No block");
    expect(frameOf(second, 8)).toMatchObject({ left: 50, width: 50 });
  });
});

describe("the times", () => {
  it("are written with two digits", () => {
    expect.soft(timeFromMinutes(630)).toBe("10:30");
    expect.soft(hourLabel(9)).toBe("09:00");
    expect.soft(hourLabel(17)).toBe("17:00");
  });

  it("touching goes down to the half hour", () => {
    expect.soft(minutesAtTouch(0, 460, 8)).toBe(480);
    expect.soft(minutesAtTouch(46 * 2 + 5, 460, 8)).toBe(600);
    expect.soft(minutesAtTouch(46 * 2 + 30, 460, 8)).toBe(630);
  });

  it("touching outside stays in the column", () => {
    expect.soft(minutesAtTouch(-20, 460, 8)).toBe(480);
    expect.soft(minutesAtTouch(900, 460, 8)).toBe(1050);
  });

  it("an hour later stays within the day", () => {
    expect.soft(anHourLater("10:00")).toBe("11:00");
    expect.soft(anHourLater("23:30")).toBe("23:59");
  });
});

describe("a row of the day of the team", () => {
  const band = { first: 8, last: 12 };

  it("is free where there is nothing", () => {
    expect(teamCells([], band)).toEqual([
      { kind: "free", hour: 8 },
      { kind: "free", hour: 9 },
      { kind: "free", hour: 10 },
      { kind: "free", hour: 11 },
    ]);
  });

  it("joins the hours of the same thing, so its name does not repeat", () => {
    const action = span("09:00", "11:00", "a");
    expect(teamCells([action], band)).toEqual([
      { kind: "free", hour: 8 },
      { kind: "taken", item: action, span: 2 },
      { kind: "free", hour: 11 },
    ]);
  });

  it("two things in a row are two places", () => {
    const first = span("08:00", "09:00", "a");
    const second = span("09:00", "10:00", "b");
    expect(teamCells([first, second], { first: 8, last: 10 })).toEqual([
      { kind: "taken", item: first, span: 1 },
      { kind: "taken", item: second, span: 1 },
    ]);
  });

  it('counts one hour without "hasta", and takes any hour it touches', () => {
    const action = span("09:30", null, "a");
    expect(teamCells([action], { first: 9, last: 11 })).toEqual([
      { kind: "taken", item: action, span: 2 },
    ]);
  });

  it("does not place what has no time", () => {
    expect(teamCells([span(null, null, "a")], { first: 9, last: 10 })).toEqual([
      { kind: "free", hour: 9 },
    ]);
  });
});
