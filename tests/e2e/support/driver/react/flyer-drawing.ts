import { type Page } from "@playwright/test";
import { type FlyerDrawingDriver } from "../flyer-drawing.ts";
import { partialDriver } from "./pending.ts";

const WHEEL_SETTLE_MS = 80;

async function previewBox(page: Page) {
  const box = await page.getByTestId("flyer-preview").boundingBox();
  if (!box) throw new Error("The preview is not on screen");
  return box;
}

/** For now, what the skeleton of the flyer editor has: the preview and its zoom. */
export function createReactFlyerDrawingDriver(page: Page): FlyerDrawingDriver {
  return partialDriver<FlyerDrawingDriver>("flyerDrawing", {
    preview: () =>
      page.evaluate(() => ({
        zoom: window["__flyerProbe"]?.flyerWorkspace?.().getState().zoom ?? 0,
        scrollTop: document.querySelector('[data-testid="flyer-canvas-box"]')?.scrollTop ?? 0,
      })),
    wheelOverPreview: async ({ ctrl, times, direction }) => {
      const box = await previewBox(page);
      await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 300));
      if (ctrl) await page.keyboard.down("Control");
      for (let turn = 0; turn < times; turn += 1) {
        await page.mouse.wheel(0, direction === "in" ? -120 : 120);
        await page.waitForTimeout(WHEEL_SETTLE_MS);
      }
      if (ctrl) await page.keyboard.up("Control");
    },
    pointUnderMouseAfterZoom: async () => {
      const box = await previewBox(page);
      const mouse = { x: box.x + box.width / 2, y: box.y + Math.min(box.height / 2, 250) };
      await page.getByTestId("flyer-preview").evaluate((preview) => {
        preview.scrollTop = 900;
      });
      const fractionUnderMouse = () =>
        page.getByTestId("flyer-canvas").evaluate((canvas, { x, y }) => {
          const rect = canvas.getBoundingClientRect();
          return { x: (x - rect.left) / rect.width, y: (y - rect.top) / rect.height };
        }, mouse);
      await page.mouse.move(mouse.x, mouse.y);
      const before = await fractionUnderMouse();
      await page.keyboard.down("Control");
      await page.mouse.wheel(0, -120);
      await page.waitForTimeout(WHEEL_SETTLE_MS * 2);
      await page.keyboard.up("Control");
      return { before, after: await fractionUnderMouse() };
    },
  });
}
