import { describe, expect, it } from "vitest";
import {
  byTypeOrder,
  chartScale,
  chosenMonths,
  type DashboardFilters,
  funnelWidth,
  hunterPackagesText,
  initialDashboardFilters,
  isWholeQuarter,
  monthsOfChart,
  periodMonths,
  periodStart,
  periodText,
  quarterMonths,
  quartersText,
  ranked,
  signupsPerAction,
  touchedMonths,
  withAndWithout,
  withPeriod,
} from "./dashboard.ts";
import { addDays, thisYear, today } from "./formatting.ts";

function of(period: string): string {
  return periodText({ ...BY_QUARTER, period });
}

function months(filters: DashboardFilters): readonly string[] {
  return filters.months;
}

function read(chosen: readonly string[]): string {
  return quartersText({ ...BY_QUARTER, months: chosen });
}

function person(id: string | null, altas: number, visitas: number) {
  return { id, altas, visitas, prospectos: 0 };
}

function typeRow(tipo: string, modalidad: string) {
  return { tipo, modalidad, visitas: 0, prospectos: 0, altas: 0 };
}

const BY_QUARTER: DashboardFilters = {
  ...initialDashboardFilters(),
  period: "q",
  year: 2026,
  months: ["01", "02", "03"],
};

describe("the period", () => {
  it("starts where it says", () => {
    expect.soft(periodStart("30")).toBe(addDays(today(), -30));
    expect.soft(periodStart("90")).toBe(addDays(today(), -90));
    expect.soft(periodStart("anio")).toBe(`${String(thisYear())}-01-01`);
    expect.soft(periodStart("q")).toBeNull();
    expect.soft(periodStart("todo")).toBeNull();
  });

  it("starts on 90 days, this year and counting tests", () => {
    expect(initialDashboardFilters()).toMatchObject({
      period: "90",
      year: thisYear(),
      months: [],
      trials: true,
    });
  });

  it("says what it counts", () => {
    expect.soft(of("30")).toBe("los últimos 30 días");
    expect.soft(of("90")).toBe("los últimos 90 días");
    expect.soft(of("anio")).toBe("este año");
    expect.soft(of("todo")).toBe("todo");
    expect.soft(of("q")).toBe("1Q de 2026");
  });
});

describe("the quarters", () => {
  it("have their months", () => {
    expect.soft(quarterMonths(1)).toEqual(["01", "02", "03"]);
    expect.soft(quarterMonths(4)).toEqual(["10", "11", "12"]);
  });

  it("are whole only with all of them", () => {
    expect.soft(isWholeQuarter(1, ["01", "02", "03", "05"])).toBe(true);
    expect.soft(isWholeQuarter(1, ["01", "02"])).toBe(false);
  });

  it("with nothing chosen, the one of today", () => {
    const month = String(new Date().getMonth() + 1).padStart(2, "0");
    const chosen = chosenMonths({ ...BY_QUARTER, months: [] });
    expect.soft(chosen).toHaveLength(3);
    expect.soft(chosen).toContain(month);
  });

  it("go to the database with the year, and null if the period is another", () => {
    expect.soft(periodMonths(BY_QUARTER)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect.soft(periodMonths({ ...BY_QUARTER, period: "90" })).toBeNull();
  });

  it("choosing the period by quarter starts on the one of today", () => {
    const next = withPeriod(initialDashboardFilters(), "q");
    expect.soft(next.period).toBe("q");
    expect.soft(next.months).toHaveLength(3);
    expect
      .soft(withPeriod(BY_QUARTER, "q").months, "what was chosen stays")
      .toEqual(BY_QUARTER.months);
    expect.soft(withPeriod(BY_QUARTER, "todo").months).toEqual(BY_QUARTER.months);
  });
});

describe("touching", () => {
  it("without Shift, only what was touched", () => {
    expect(months(touchedMonths(BY_QUARTER, ["04", "05", "06"], false))).toEqual([
      "04",
      "05",
      "06",
    ]);
  });

  it("with Shift, it adds", () => {
    expect(months(touchedMonths(BY_QUARTER, ["07", "08", "09"], true))).toEqual([
      "01",
      "02",
      "03",
      "07",
      "08",
      "09",
    ]);
  });

  it("with Shift on what was there, it goes away", () => {
    const both = { ...BY_QUARTER, months: ["01", "02", "03", "07", "08", "09"] };
    expect(months(touchedMonths(both, ["01", "02", "03"], true))).toEqual(["07", "08", "09"]);
  });

  it("with Shift on part of it, it completes it", () => {
    const part = { ...BY_QUARTER, months: ["01"] };
    expect(months(touchedMonths(part, ["01", "02", "03"], true))).toEqual(["01", "02", "03"]);
  });

  it("the last one cannot be taken away", () => {
    const one = { ...BY_QUARTER, months: ["05"] };
    expect(months(touchedMonths(one, ["05"], true))).toEqual(["05"]);
  });

  it("a whole quarter that was all there is, leaves its first month", () => {
    expect(months(touchedMonths(BY_QUARTER, ["01", "02", "03"], true))).toEqual(["01"]);
  });

  it("the months go in order", () => {
    const later = { ...BY_QUARTER, months: ["09"] };
    expect(months(touchedMonths(later, ["02"], true))).toEqual(["02", "09"]);
  });
});

describe("what the period reads", () => {
  it("one or two quarters", () => {
    expect.soft(read(["01", "02", "03"])).toBe("1Q de 2026");
    expect.soft(read(["01", "02", "03", "07", "08", "09"])).toBe("1Q y 3Q de 2026");
  });

  it("three quarters with a comma", () => {
    expect(read(["01", "02", "03", "04", "05", "06", "07", "08", "09"])).toBe(
      "1Q, 2Q y 3Q de 2026",
    );
  });

  it("months if a quarter is not whole", () => {
    expect.soft(read(["05", "06"])).toBe("mayo y junio de 2026");
    expect.soft(read(["05"])).toBe("mayo de 2026");
    expect.soft(read(["01", "02", "03", "05"])).toBe("enero, febrero, marzo y mayo de 2026");
  });
});

describe("the packages", () => {
  it("counts with one, without one and not loaded", () => {
    expect(
      withAndWithout([
        { paquete: "plus", altas: 3 },
        { paquete: "caja", altas: 2 },
        { paquete: null, altas: 1 },
        { paquete: "otro", altas: 4 },
      ]),
    ).toEqual({ withPackage: 3, without: 2, notLoaded: 5 });
  });

  it("writes under each hunter which ones and how many without", () => {
    expect
      .soft(hunterPackagesText({ plus: 2, gold: 1, caja: 1 }))
      .toBe("3 con paquete (2 Plus · 1 Plus Gold) · 1 sin paquete");
    expect.soft(hunterPackagesText({ plus: 2 })).toBe("2 con paquete (2 Plus)");
    expect.soft(hunterPackagesText({ caja: 1 })).toBe("1 sin paquete");
    expect.soft(hunterPackagesText({})).toBe("");
    expect.soft(hunterPackagesText(null)).toBe("");
  });
});

describe("the chart", () => {
  it.each([
    [4, 2, 4],
    [10, 2, 10],
    [11, 10, 20],
    [50, 10, 50],
    [51, 50, 100],
    [200, 50, 200],
    [201, 200, 400],
    [1000, 200, 1000],
    [1001, 1000, 2000],
  ])("for %i goes every %i up to %i", (highest, step, top) => {
    expect(chartScale(highest)).toEqual({ step, top });
  });

  it("shows the last 12 months", () => {
    const rows = Array.from({ length: 14 }, (_, index) => ({
      mes: `m${String(index)}`,
      prospectos: 0,
      altas: 0,
    }));
    const shown = monthsOfChart(rows);
    expect.soft(shown).toHaveLength(12);
    expect.soft(shown[0]?.mes).toBe("m2");
  });
});

describe("the rest of the numbers", () => {
  it("the funnel never hides a small number, and nothing has no bar", () => {
    expect.soft(funnelWidth(0, 100)).toBe(0);
    expect.soft(funnelWidth(1, 100)).toBe(8);
    expect.soft(funnelWidth(50, 100)).toBe(50);
  });

  it("signups per action, with a comma", () => {
    expect.soft(signupsPerAction(3, 2)).toBe("1,5");
    expect.soft(signupsPerAction(3, 0)).toBe("—");
  });

  it("the ranking leaves out what has no owner, and goes by signups and then actions", () => {
    const rows = [person(null, 9, 9), person("a", 1, 5), person("b", 2, 1), person("c", 1, 7)];
    expect(ranked(rows).map(({ id }) => id)).toEqual(["b", "c", "a"]);
  });

  it("the types go in their order", () => {
    const shown = byTypeOrder([typeRow("feria", "virtual"), typeRow("posicion", "presencial")]);
    expect(shown.map(({ tipo }) => tipo)).toEqual(["posicion", "feria"]);
  });
});
