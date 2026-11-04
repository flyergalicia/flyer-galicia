// Replaces pruebas/t36_franja_mas_marcas.cjs.
import { expect, test } from "../../support/test.ts";

const LOGOS_STRIP = { x: 140, y: 2650, width: 1000, height: 230 };

const CASES = [
  { brands: 13, width: 1366, height: 657 },
  { brands: 20, width: 1366, height: 657 },
  { brands: 16, width: 1280, height: 600 },
  { brands: 8, width: 1366, height: 657 },
  { brands: 30, width: 1366, height: 657 },
  { brands: 24, width: 1920, height: 950 },
];

for (const { brands, width, height } of CASES) {
  const name = `${String(brands)} brands on a ${String(width)}x${String(height)} screen`;

  test(`${name} fit in the window and in the strip`, { tag: "@react" }, async ({ openApp }) => {
    const app = await openApp({ viewport: { width, height } });
    const strip = app.logoStrip;
    await app.logoEditor.enter();
    await strip.open(LOGOS_STRIP, { province: "" });
    await strip.tickNext(brands);
    await strip.waitForPreviewLogos();

    const state = await strip.state();
    expect.soft(state.brands.length, "all of them are in the selection").toBe(brands);

    const layout = await strip.layout();
    const { dialog, preview, brandList, selection, actions } = layout;
    expect.soft(dialog.top, "the window starts on screen").toBeGreaterThanOrEqual(0);
    expect
      .soft(dialog.top + dialog.height, "the window ends on screen")
      .toBeLessThanOrEqual(layout.viewport.height);
    expect
      .soft(actions.top + actions.height, "its buttons can be reached")
      .toBeLessThanOrEqual(layout.viewport.height);
    expect.soft(preview.height, "the preview has room").toBeGreaterThan(0);
    expect.soft(brandList.height, "the brand list has room").toBeGreaterThan(0);
    expect.soft(selection.height, "the selection has room").toBeGreaterThan(0);

    const { boxes } = await strip.previewPlacement();
    const drawn = boxes.filter((box) => box !== null);
    expect.soft(drawn.length, "the preview draws one box per brand").toBe(brands);
    const { region } = state;
    for (const box of drawn) {
      const middleX = box.x + box.width / 2;
      const middleY = box.y + box.height / 2;
      expect
        .soft(middleX >= region.x && middleX <= region.x + region.width, "inside, across")
        .toBe(true);
      expect
        .soft(middleY >= region.y && middleY <= region.y + region.height, "inside, down")
        .toBe(true);
    }

    await strip.put();
    const changes = await strip.changes();
    expect.soft(changes.filter(({ isCover }) => isCover).length, "one strip").toBe(1);
    expect
      .soft(changes.filter(({ isCover, kind }) => !isCover && kind === "brand").length, "the logos")
      .toBe(brands);
  });
}
