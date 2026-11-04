// Replaces pruebas/t29_franja_mover_tamano.cjs.
import { expect, test } from "../../support/test.ts";

const LOGOS_STRIP = { x: 140, y: 2650, width: 1000, height: 230 };
const INSIDE_THE_SAME_STRIP = { x: 150, y: 2660, width: 980, height: 210 };
const BRANDS = ["farmacia del pueblo", "puppis", "freddo", "nike"];
const TOLERANCE_PX = 4;

function rounded(box: { x: number; y: number; width: number; height: number } | null): string {
  if (!box) return "none";
  return [box.x, box.y, box.width, box.height].map((value) => Math.round(value)).join(",");
}

test(
  "a logo is moved and resized in the preview, and the flyer comes out the same",
  { tag: "@react" },
  async ({ openApp }) => {
    const app = await openApp();
    const strip = app.logoStrip;
    await app.logoEditor.enter();
    await strip.open(LOGOS_STRIP, { province: "" });
    for (const brand of BRANDS) await strip.tickBySearch(brand);
    await strip.search("");
    await strip.waitForPreviewLogos();

    expect
      .soft(await strip.adjustmentsText(), "with no logo marked, it explains how to adjust")
      .toContain("Tocá un logo");

    const scale = await strip.previewScale();
    await strip.dragPreviewLogo(1, [
      { x: 15, y: 6 },
      { x: 30, y: 12 },
    ]);
    const dragged = await strip.state();
    expect.soft(dragged.marked, "touching a logo marks it").toBe(1);
    expect
      .soft(Math.abs((dragged.brands[1]?.moved.x ?? 0) - 30 / scale), "dragging moves it sideways")
      .toBeLessThan(TOLERANCE_PX);
    expect
      .soft(Math.abs((dragged.brands[1]?.moved.y ?? 0) - 12 / scale), "dragging moves it down")
      .toBeLessThan(TOLERANCE_PX);
    expect.soft(await strip.markedSizeVisible(), "its size control appears").toBe(true);

    await strip.pressMarkedBigger();
    await strip.pressMarkedBigger();
    expect
      .soft((await strip.state()).brands[1]?.size, '"+" makes the logo bigger (120%)')
      .toBeCloseTo(1.2, 3);

    await strip.setSizeOfAll(90);
    expect
      .soft((await strip.state()).sizeOfAll, '"Tamaño de todos" takes all to 90%')
      .toBeCloseTo(0.9, 3);

    await strip.waitForPreviewLogos();
    const inPreview = (await strip.previewPlacement()).boxes.map(rounded);
    await strip.put();
    const onFlyer = (await strip.changes())
      .filter(({ strip: id, isCover }) => id !== null && !isCover)
      .map(({ box }) => rounded(box));
    expect.soft(onFlyer, "the flyer is exactly as in the preview").toEqual(inPreview);

    await strip.open(INSIDE_THE_SAME_STRIP);
    const resumed = await strip.state();
    expect.soft(resumed.sizeOfAll, "resuming brings the size of all back").toBeCloseTo(0.9, 3);
    expect.soft(resumed.brands[1]?.size, "and the size of that logo").toBeCloseTo(1.2, 3);
    expect.soft(resumed.brands[1]?.moved.x, "and where it was moved").not.toBe(0);

    await strip.clickBrandRow(1);
    await strip.pressBackToPlace();
    const back = (await strip.state()).brands[1];
    expect.soft(back?.moved, '"Volver a su lugar" undoes the move').toEqual({ x: 0, y: 0 });
    expect.soft(back?.size, "and the size").toBe(1);

    await strip.clickPreviewCorner();
    await app.page.waitForTimeout(100);
    expect.soft((await strip.state()).marked, "touching off the logos releases them").toBe(-1);
  },
);
