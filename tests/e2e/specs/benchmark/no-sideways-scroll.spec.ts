// Benchmark on a phone: the page stays in the screen, wide tables slide inside their own box,
// and every tab can be touched with a normal click.
import { type BenchmarkView } from "../../support/driver/benchmark.ts";
import { expect, test } from "../../support/test.ts";
import { seedCards, seedComparison, seedHandLoaded } from "./benchmark-data.ts";

const VIEWS: readonly BenchmarkView[] = ["rubro", "brand", "week", "merchant", "versus", "cards"];
const PHONE = { width: 390, height: 844 };
const SCREENS = [
  { ...PHONE, touch: true },
  { width: 768, height: 900, touch: true },
  { width: 1024, height: 768, touch: false },
  { width: 1366, height: 800, touch: false },
];

for (const { width, height, touch } of SCREENS) {
  test(`every view fits at ${String(width)} px`, { tag: "@react" }, async ({ cloud, openApp }) => {
    seedComparison(cloud);
    seedHandLoaded(cloud);
    seedCards(cloud);
    const { benchmark } = await openApp({
      user: "admin",
      viewport: { width, height },
      touch,
    });
    await benchmark.open();

    for (const view of VIEWS) {
      await benchmark.showView(view);
      await expect.poll(() => benchmark.currentView(), `the tab of ${view} answers`).toBe(view);
      const widths = await benchmark.pageWidths();
      expect.soft(widths.page, `${view}: the page`).toBeLessThanOrEqual(width);
      expect.soft(widths.panel, `${view}: the panel`).toBeLessThanOrEqual(width);
      expect.soft(widths.tabs, `${view}: the last tab, in the screen`).toBeLessThanOrEqual(width);
    }
  });
}

test(
  "on a phone the wide table slides inside its own box",
  { tag: "@react" },
  async ({ cloud, openApp }) => {
    seedComparison(cloud);
    const { benchmark } = await openApp({
      user: "admin",
      viewport: PHONE,
      touch: true,
    });
    await benchmark.open();

    const { table, tableBox } = await benchmark.pageWidths();
    expect.soft(table, "it is wider than the screen").toBeGreaterThan(PHONE.width);
    expect.soft(tableBox, "the box is not").toBeLessThanOrEqual(PHONE.width);
  },
);
