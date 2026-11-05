// Protects the zoom rules of the preview: the wheel alone scrolls, Ctrl + wheel zooms.
import { expect, test } from "../../support/test.ts";

const MAX_ZOOM = 1.3;

test.describe("the preview beside the form", () => {
  test(
    "the wheel alone does not zoom; with Ctrl it does, up to 130 %",
    { tag: "@react" },
    async ({ openApp }) => {
      const { flyerDrawing } = await openApp();
      const start = await flyerDrawing.preview();

      await flyerDrawing.wheelOverPreview({ ctrl: false, times: 2, direction: "in" });
      expect.soft((await flyerDrawing.preview()).zoom, "the wheel recorre").toBe(start.zoom);

      await flyerDrawing.wheelOverPreview({ ctrl: true, times: 1, direction: "out" });
      expect.soft((await flyerDrawing.preview()).zoom, "Ctrl zooms").toBeLessThan(start.zoom);

      await flyerDrawing.wheelOverPreview({ ctrl: true, times: 8, direction: "in" });
      expect.soft((await flyerDrawing.preview()).zoom, "and it stops").toBeCloseTo(MAX_ZOOM, 5);
    },
  );

  test(
    "zooming keeps under the mouse what was under the mouse",
    { tag: "@react" },
    async ({ openApp }) => {
      const { flyerDrawing } = await openApp();
      const before = await flyerDrawing.pointUnderMouseAfterZoom();

      expect.soft(Math.abs(before.after.x - before.before.x), "across").toBeLessThan(0.03);
      expect.soft(Math.abs(before.after.y - before.before.y), "down").toBeLessThan(0.03);
    },
  );
});

test.describe("the window of Vista previa", () => {
  test(
    "starts whole; Ctrl + wheel and double click zoom, and the wheel alone scrolls",
    { tag: "@react" },
    async ({ openApp }) => {
      const { flyerDrawing } = await openApp();
      await flyerDrawing.openPreviewWindow();
      expect.soft((await flyerDrawing.previewWindowZoom()).percent, "whole").toBe(100);

      await flyerDrawing.wheelOverPreviewWindow({ ctrl: false, times: 2 });
      expect.soft((await flyerDrawing.previewWindowZoom()).percent, "no Ctrl, no zoom").toBe(100);

      await flyerDrawing.wheelOverPreviewWindow({ ctrl: true, times: 2 });
      const zoomed = (await flyerDrawing.previewWindowZoom()).percent;
      expect.soft(zoomed, "with Ctrl").toBeGreaterThan(100);

      await flyerDrawing.doubleClickPreviewWindow();
      expect
        .soft((await flyerDrawing.previewWindowZoom()).percent, "double click goes back")
        .toBe(100);

      await flyerDrawing.doubleClickPreviewWindow();
      expect
        .soft((await flyerDrawing.previewWindowZoom()).percent, "and comes closer")
        .toBeGreaterThan(100);
    },
  );

  test(
    "the keys + − and 0 work, and each opening starts whole",
    { tag: "@react" },
    async ({ openApp }) => {
      const { flyerDrawing, page } = await openApp();
      await flyerDrawing.openPreviewWindow();

      await page.keyboard.press("+");
      expect.soft((await flyerDrawing.previewWindowZoom()).percent).toBeGreaterThan(100);
      await page.keyboard.press("0");
      expect.soft((await flyerDrawing.previewWindowZoom()).percent).toBe(100);

      await page.keyboard.press("+");
      await flyerDrawing.closePreviewWindow();
      await flyerDrawing.openPreviewWindow();
      expect.soft((await flyerDrawing.previewWindowZoom()).percent, "starts whole").toBe(100);
    },
  );

  test("dragging out of the window does not close it", { tag: "@react" }, async ({ openApp }) => {
    const { flyerDrawing, page } = await openApp();
    await flyerDrawing.openPreviewWindow();
    await page.keyboard.press("+");

    await flyerDrawing.dragOutOfPreviewWindow();

    expect.soft((await flyerDrawing.previewWindowZoom()).open).toBe(true);
    await flyerDrawing.clickPreviewWindowBackground();
    expect.soft((await flyerDrawing.previewWindowZoom()).open, "a real click does").toBe(false);
  });
});
