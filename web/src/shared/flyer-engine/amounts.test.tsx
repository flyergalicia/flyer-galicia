import { describe, expect, it } from "vitest";
import { amountOf, formatAmount, hasNoAmounts, largestAmount, sumAmounts } from "./amounts.ts";
import { testScene } from "./testing/test-scene.ts";

const AMOUNTS = { empresa: "X", m1: "$250.000", m2: "$180.000", m3: "$80.000", m4: "$30.000" };

describe("formatAmount", () => {
  it.each([
    ["24000", "$24.000"],
    ["$ 1.234.567", "$1.234.567"],
    ["0024000", "$24.000"],
    ["0", "$0"],
    ["", ""],
    [null, ""],
    [undefined, ""],
    [999, "$999"],
  ])("%s becomes %s", (raw, expected) => {
    expect(formatAmount(raw)).toBe(expected);
  });
});

describe("sumAmounts", () => {
  it("adds the two caps", () => {
    expect(sumAmounts("$24.000", "$30.000")).toBe("$54.000");
    expect(sumAmounts("$24.000", undefined)).toBe("$24.000");
    expect(sumAmounts(undefined, "$30.000")).toBe("$30.000");
  });

  it("is nothing when there is nothing", () => {
    expect(sumAmounts("", undefined)).toBe("");
  });
});

describe("the amounts of a flyer", () => {
  it("come as they are written", () => {
    expect(amountOf(AMOUNTS, 3, testScene())).toBe("$80.000");
    expect(amountOf({ empresa: "X", m1: " $1 " }, 1, testScene())).toBe("$1");
    expect(amountOf({ empresa: "X", m1: 250 }, 1, testScene())).toBe("250");
    expect(amountOf({ empresa: "X" }, 1, testScene())).toBe("");
  });

  it("the largest one is compared by digits and written as it came", () => {
    expect(
      largestAmount({ empresa: "X", m1: "$9.000", m2: "$10.000", m3: "$5" }, testScene()),
    ).toBe("$10.000");
    expect(largestAmount({ empresa: "X", m1: "$0" }, testScene())).toBe("");
  });

  it("are all empty sin cashback", () => {
    expect(amountOf({ ...AMOUNTS, nocb: true }, 1, testScene())).toBe("");
    expect(largestAmount({ ...AMOUNTS, nocb: true }, testScene())).toBe("");
  });

  it("are all empty once the band of amounts was cropped", () => {
    const cropped = testScene({ calibration: { montos: { off: true } } });
    expect(hasNoAmounts(cropped)).toBe(true);
    expect(amountOf(AMOUNTS, 1, cropped)).toBe("");
    expect(largestAmount(AMOUNTS, cropped)).toBe("");
  });

  it("the single amount of a salary flyer looks at its own zone", () => {
    const single = { calibration: { cashback: { off: true } }, singleCashback: true };
    expect(hasNoAmounts(testScene(single))).toBe(true);
    expect(hasNoAmounts(testScene({ ...single, singleCashback: false }))).toBe(false);
    expect(hasNoAmounts(testScene({ singleCashback: true }))).toBe(false);
  });
});
