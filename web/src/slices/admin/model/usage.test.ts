import { describe, expect, it } from "vitest";
import {
  barWidth,
  studioInPeriod,
  type UsageFlyers,
  type UsageLog,
  usageBoard,
  usageSince,
} from "./usage.ts";

const NOW = new Date("2026-10-30T12:00:00-03:00");
const DAY_MS = 86_400_000;
const FLYERS: UsageFlyers = {
  label: (option) => (option === 9 ? "Combustible" : `Opción ${String(option)}`),
  color: () => "#123456",
  exists: (option) => option === 1 || option === 9,
};

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * DAY_MS).toISOString();
}

function log(fields: Partial<UsageLog>): UsageLog {
  return {
    user_id: "u1",
    is_bulk: false,
    bulk_count: 0,
    flyer_type: JSON.stringify({ opcion: 9 }),
    created_at: daysAgo(1),
    ...fields,
  };
}

const PEOPLE = [
  { id: "u1", full_name: "Ana", email_asesor: null, role: "asesor" },
  { id: "u2", full_name: null, email_asesor: "h@b", role: "hunter" },
];

describe("the period", () => {
  it("is the last 30 or 90 days, or since the first of January", () => {
    expect(usageSince("30", NOW).getTime()).toBe(NOW.getTime() - 30 * DAY_MS);
    expect(usageSince("90", NOW).getTime()).toBe(NOW.getTime() - 90 * DAY_MS);
    expect(usageSince("anio", NOW)).toEqual(new Date(2026, 0, 1));
  });
});

describe("the board", () => {
  const since = usageSince("30", NOW);

  it("counts a batch by how many came out of it, and a flyer one by one as one", () => {
    const board = usageBoard(
      [log({}), log({ is_bulk: true, bulk_count: 10 }), log({ is_bulk: true, bulk_count: 0 })],
      PEOPLE,
      FLYERS,
      since,
      NOW,
    );
    expect([board.total, board.oneByOne, board.inBatches, board.people]).toEqual([11, 1, 10, 1]);
    expect(board.perPerson).toBe("11,0");
  });

  it("says each flyer by its name, the one that is gone, and the log that has none", () => {
    const board = usageBoard(
      [
        log({}),
        log({ flyer_type: JSON.stringify({ opcion: 4 }) }),
        log({ flyer_type: null }),
        log({ flyer_type: "roto" }),
      ],
      PEOPLE,
      FLYERS,
      since,
      NOW,
    );
    expect(board.byFlyer).toEqual([
      { label: "Sin dato", count: 2 },
      { label: "Opción 4 (ya no está)", count: 1 },
      { label: "Combustible", count: 1, color: "#123456" },
    ]);
  });

  it("puts the most first, and on a tie the flyers in their order", () => {
    const board = usageBoard(
      [
        log({ flyer_type: JSON.stringify({ opcion: 9 }) }),
        log({ flyer_type: JSON.stringify({ opcion: 1 }) }),
      ],
      PEOPLE,
      FLYERS,
      since,
      NOW,
    );
    expect(board.byFlyer.map(({ label }) => label)).toEqual(["Opción 1", "Combustible"]);
  });

  it("counts by profile, with whoever is not known as ?", () => {
    const board = usageBoard(
      [log({}), log({}), log({ user_id: "u2" }), log({ user_id: "u9" }), log({ user_id: null })],
      PEOPLE,
      FLYERS,
      since,
      NOW,
    );
    expect(board.byRole).toEqual([
      { label: "Asesor", count: 2 },
      { label: "?", count: 2 },
      { label: "Hunter", count: 1 },
    ]);
    expect(board.top.map(({ label }) => label)).toEqual(["Ana", "h@b", "Usuario", "Usuario"]);
  });

  it("keeps the ten that downloaded the most", () => {
    const logs = Array.from({ length: 12 }, (_, at) => log({ user_id: `p${String(at)}` }));
    expect(usageBoard(logs, PEOPLE, FLYERS, since, NOW).top).toHaveLength(10);
  });

  it("goes week by week from Monday, twelve weeks at most", () => {
    const board = usageBoard(
      [log({ created_at: daysAgo(0) })],
      PEOPLE,
      FLYERS,
      usageSince("anio", NOW),
      NOW,
    );
    expect(board.byWeek).toHaveLength(12);
    expect(board.byWeek.at(-1)).toEqual({ label: "Sem. 26/10", count: 1 });
    const month = usageBoard([], PEOPLE, FLYERS, since, NOW);
    expect(month.byWeek[0]?.label).toBe("Sem. 28/09");
    expect(month.perPerson).toBe("0");
  });
});

describe("Estudio in the period", () => {
  it("counts what was saved, asked for and published since the start", () => {
    const since = usageSince("30", NOW);
    expect(
      studioInPeriod(
        [
          {
            estado: "publicado",
            created_at: daysAgo(2),
            pedido_at: daysAgo(2),
            revisado_at: daysAgo(1),
          },
          { estado: "pedido", created_at: daysAgo(60), pedido_at: daysAgo(3), revisado_at: null },
          {
            estado: "publicado",
            created_at: daysAgo(60),
            pedido_at: null,
            revisado_at: daysAgo(40),
          },
        ],
        since,
      ),
    ).toEqual({ saved: 1, asked: 2, published: 1 });
  });
});

describe("a bar", () => {
  it("goes against the longest, and never under 2%", () => {
    const bars = [
      { label: "a", count: 200 },
      { label: "b", count: 1 },
    ];
    expect(barWidth(200, bars)).toBe(100);
    expect(barWidth(1, bars)).toBe(2);
    expect(barWidth(0, [])).toBe(2);
  });
});
