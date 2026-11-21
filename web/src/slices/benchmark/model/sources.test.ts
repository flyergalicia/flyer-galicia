import { describe, expect, it } from "vitest";
import type { HandLoadedPromotion, SourceMeta } from "./rows.ts";
import { sourceLabels } from "./sources.ts";

const NOW = Date.parse("2026-10-30T15:00:00Z");
const TODAY = "2026-10-30";

function daysAgo(days: number): string {
  return new Date(NOW - days * 86_400_000).toISOString();
}

function labelOf(
  meta: readonly SourceMeta[],
  bank: string,
  handLoaded: HandLoadedPromotion[] = [],
) {
  const label = sourceLabels(meta, handLoaded, TODAY, NOW).find((one) => one.bank === bank);
  if (!label) throw new Error(`No label for ${bank}`);
  return label;
}

function by(id: string, fecha_hasta: string | null): HandLoadedPromotion {
  return { id, banco: "santander", titulo: id, fecha_hasta };
}

describe("the label of a bank", () => {
  it("one per bank, in the order of the columns", () => {
    expect(sourceLabels([], [], TODAY, NOW).map(({ name }) => name)).toEqual([
      "Galicia",
      "BBVA",
      "Macro",
      "Supervielle",
      "Santander",
      "ICBC",
    ]);
  });

  it("says it comes through MODO and when it was read", () => {
    const label = labelOf([{ banco: "galicia", last_sync_at: daysAgo(0) }], "galicia");
    expect(label.detail).toBe(" · vía MODO · act. 30/10");
    expect(label.stale).toBe(false);
    expect(label.title).toBe("vía MODO");
  });

  it("goes red after 10 days, or with nothing read", () => {
    expect(labelOf([{ banco: "bbva", last_sync_at: daysAgo(11) }], "bbva").stale).toBe(true);
    expect(labelOf([{ banco: "bbva", last_sync_at: daysAgo(9) }], "bbva").stale).toBe(false);
    const nothing = labelOf([], "icbc");
    expect(nothing.stale).toBe(true);
    expect(nothing.detail).toBe(" · vía MODO · act. sin datos");
  });

  it("warns of an error, and tells it on hovering", () => {
    const label = labelOf(
      [{ banco: "macro", last_sync_at: daysAgo(0), error: "MODO respondió 500" }],
      "macro",
    );
    expect(label.detail).toMatch(/⚠$/);
    expect(label.warns).toBe(true);
    expect(label.title).toBe("Último error: MODO respondió 500");
  });

  it("with its own website says so, and the oldest of the two dates counts", () => {
    const label = labelOf(
      [
        { banco: "bbva", last_sync_at: daysAgo(1) },
        { banco: "bbva_web", last_sync_at: daysAgo(12) },
      ],
      "bbva",
    );
    expect(label.detail).toBe(" · MODO + web propia · act. 18/10");
    expect(label.stale).toBe(true);
  });

  it("a monthly load is not old until 35 days, and is not an error", () => {
    const label = labelOf(
      [
        { banco: "macro", last_sync_at: daysAgo(1) },
        { banco: "macro_web", last_sync_at: daysAgo(20), error: "carga asistida" },
      ],
      "macro",
    );
    expect(label.detail).toBe(" · MODO + web propia (carga asistida) · act. 10/10");
    expect(label.stale).toBe(false);
    expect(label.warns).toBe(false);
  });

  it("a website that blocks the reading is pending, not an error", () => {
    const label = labelOf(
      [
        { banco: "santander", last_sync_at: daysAgo(1) },
        { banco: "santander_web", last_sync_at: null, error: "Santander bloquea la lectura" },
      ],
      "santander",
    );
    expect(label.detail).toBe(
      " · vía MODO · su web se carga una vez por mes (pendiente) · act. 29/10",
    );
    expect(label.warns).toBe(false);
  });

  it("counts the current promotions loaded by hand", () => {
    expect(labelOf([], "santander", [by("a", null)]).detail).toBe(
      " · vía MODO · 1 cargada a mano · act. sin datos",
    );
    expect(
      labelOf([], "santander", [by("a", null), by("b", "2027-01-01"), by("c", "2026-01-01")])
        .detail,
    ).toBe(" · vía MODO · 2 cargadas a mano · act. sin datos");
  });
});
