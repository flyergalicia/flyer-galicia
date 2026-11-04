// Protects how a strip shares out its logos: in the rows of the original, one more only if needed.
import { expect, test } from "../../support/test.ts";

const LOGOS_STRIP = { x: 140, y: 2650, width: 1000, height: 230 };
const CASES = [
  { brands: 14, rows: 2, why: "as many as the original fit in its two rows" },
  { brands: 20, rows: 2, why: "ten per row is still under one and a half times the original" },
  { brands: 22, rows: 3, why: "eleven per row would be too many: one more row" },
] as const;

for (const { brands, rows, why } of CASES) {
  test(
    `${String(brands)} brands go in ${String(rows)} rows: ${why}`,
    { tag: "@react" },
    async ({ openApp }) => {
      const app = await openApp();
      const strip = app.logoStrip;
      await app.logoEditor.enter();
      await strip.open(LOGOS_STRIP, { province: "" });

      await strip.tickNext(brands);
      await strip.waitForPreviewLogos();

      const { boxes } = await strip.previewPlacement();
      const drawn = boxes.filter((box) => box !== null);
      expect.soft(drawn.length, "all of them are placed").toBe(brands);
      // In the order of the selection: each row starts again from the left.
      const startsOfRow = drawn.filter((box, at) => at > 0 && box.x < (drawn[at - 1]?.x ?? 0));
      expect.soft(startsOfRow.length + 1, "in those rows").toBe(rows);
    },
  );
}
