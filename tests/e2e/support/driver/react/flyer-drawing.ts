import { type Page } from "@playwright/test";
import { type DrawnFlyer, type FlyerDrawingDriver } from "../flyer-drawing.ts";

const PREVIEW_TIMEOUT_MS = 25_000;
const WHEEL_SETTLE_MS = 80;
const DRAWS_SETTLE_MS = 500;
const DRAW_WAIT_MS = 5_000;
const CANVAS = '[data-testid="flyer-canvas"]';

/** Runs in the page: what the app writes while it draws a flyer for download. */
function drawForDownload(): DrawnFlyer {
  const texts: DrawnFlyer["texts"] = [];
  const rectangles: DrawnFlyer["rectangles"] = [];
  const context = CanvasRenderingContext2D.prototype;
  const fillText: CanvasRenderingContext2D["fillText"] = Reflect.get(context, "fillText");
  const fillRect: CanvasRenderingContext2D["fillRect"] = Reflect.get(context, "fillRect");
  context.fillText = function spyText(text, x, y, maxWidth) {
    const color = typeof this.fillStyle === "string" ? this.fillStyle : "";
    texts.push({ text, x, y, font: this.font, color });
    fillText.call(this, text, x, y, maxWidth);
  };
  context.fillRect = function spyRectangle(x, y, width, height) {
    const color = typeof this.fillStyle === "string" ? this.fillStyle : "";
    rectangles.push({ x, y, width, height, color });
    fillRect.call(this, x, y, width, height);
  };
  try {
    const canvas = window["__flyerProbe"]?.flyerWorkspace?.().renderDownload();
    if (!canvas) throw new Error("There is no flyer to download");
    return { width: canvas.width, height: canvas.height, texts, rectangles };
  } finally {
    context.fillText = fillText;
    context.fillRect = fillRect;
  }
}

/** Runs in the page: the average color of a region of the download or of the artwork alone. */
function averageColor({
  source,
  region: { x, y, width, height },
}: {
  source: "download" | "artwork";
  region: { x: number; y: number; width: number; height: number };
}): number[] {
  const workspace = window["__flyerProbe"]?.flyerWorkspace?.();
  const image =
    source === "download" ? workspace?.renderDownload() : workspace?.getState().slot.scene?.art;
  const crop = document.createElement("canvas");
  crop.width = width;
  crop.height = height;
  const context = crop.getContext("2d", { willReadFrequently: true });
  if (!context || !image) return [];
  context.drawImage(image, x, y, width, height, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);
  const pixels = data.length / 4;
  return [0, 1, 2].map((channel) => {
    let sum = 0;
    for (let at = channel; at < data.length; at += 4) sum += data[at] ?? 0;
    return Math.round(sum / pixels);
  });
}

/** Draws again as a person makes it happen, and tells the colors of what was covered. */
async function coverColors(page: Page): Promise<string[]> {
  await page.evaluate(() => {
    const context = CanvasRenderingContext2D.prototype;
    const fillRect: CanvasRenderingContext2D["fillRect"] = Reflect.get(context, "fillRect");
    const drawImage: CanvasRenderingContext2D["drawImage"] = Reflect.get(context, "drawImage");
    const canvas = document.querySelector('[data-testid="flyer-canvas"]');
    const colors: string[] = [];
    const spy = {
      colors,
      restore: () => {
        context.fillRect = fillRect;
        context.drawImage = drawImage;
      },
    };
    let isDone = false;
    context.fillRect = function spyRectangle(x, y, width, height) {
      if (!isDone && typeof this.fillStyle === "string") colors.push(this.fillStyle);
      fillRect.call(this, x, y, width, height);
    };
    // Only one drawing: it ends when it goes up to the canvas, and a busy window can draw twice.
    context.drawImage = function spyPicture(this: CanvasRenderingContext2D, ...args: unknown[]) {
      if (this.canvas === canvas) isDone = true;
      Reflect.apply(drawImage, this, args);
    };
    Reflect.set(window, "__fgCovers", spy);
  });
  const draws = await page.evaluate(
    () => window["__flyerProbe"]?.flyerWorkspace?.().getState().draws ?? 0,
  );
  await page.locator('[data-cashback][aria-pressed="true"]').first().click();
  await page.waitForFunction(
    (before) => (window["__flyerProbe"]?.flyerWorkspace?.().getState().draws ?? 0) > before,
    draws,
    { timeout: DRAW_WAIT_MS },
  );
  return page.evaluate(() => {
    const spy: { colors: string[]; restore: () => void } = Reflect.get(window, "__fgCovers");
    spy.restore();
    return spy.colors;
  });
}

async function previewBox(page: Page) {
  const box = await page.getByTestId("flyer-preview").boundingBox();
  if (!box) throw new Error("The preview is not on screen");
  return box;
}

function previewWindow(page: Page) {
  return page.getByRole("dialog", { name: "Vista previa" });
}

function previewPicture(page: Page) {
  return page.getByTestId("preview-window-picture");
}

async function pictureBox(page: Page) {
  const box = await previewPicture(page).boundingBox();
  if (!box) throw new Error("The preview window is not on screen");
  return box;
}

async function isOnScreen(page: Page): Promise<boolean> {
  return (await previewWindow(page).count()) > 0 && previewWindow(page).isVisible();
}

function createPreviewWindow(page: Page) {
  return {
    openPreviewWindow: async () => {
      const opener = page.getByRole("button", { name: "Vista previa", exact: true }).first();
      await opener.click();
      await page
        .locator('[data-testid="preview-window-picture"][src^="data:"]')
        .waitFor({ timeout: PREVIEW_TIMEOUT_MS });
      await previewPicture(page).evaluate((picture) =>
        picture instanceof HTMLImageElement ? picture.decode() : undefined,
      );
      await page.waitForTimeout(WHEEL_SETTLE_MS);
    },
    closePreviewWindow: () =>
      previewWindow(page).getByRole("button", { name: "Cerrar" }).first().click(),
    previewWindowZoom: async () => {
      const open = await isOnScreen(page);
      if (!open) return { percent: 0, open };
      const label = await page.getByTestId("preview-window-percent").innerText();
      return { percent: Number(label.replace(/\D/g, "")), open };
    },
    wheelOverPreviewWindow: async ({ ctrl, times }: { ctrl: boolean; times: number }) => {
      const box = await pictureBox(page);
      await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 200));
      if (ctrl) await page.keyboard.down("Control");
      for (let turn = 0; turn < times; turn += 1) {
        await page.mouse.wheel(0, -120);
        await page.waitForTimeout(WHEEL_SETTLE_MS);
      }
      if (ctrl) await page.keyboard.up("Control");
    },
    doubleClickPreviewWindow: () => previewPicture(page).dblclick(),
    clickPreviewWindowBackground: () => page.mouse.click(5, 5),
    dragOutOfPreviewWindow: async () => {
      const box = await pictureBox(page);
      await page.mouse.move(box.x + box.width / 2, box.y + 100);
      await page.mouse.down();
      await page.mouse.move(5, 5, { steps: 5 });
      await page.mouse.up();
    },
  };
}

export function createReactFlyerDrawingDriver(page: Page): FlyerDrawingDriver {
  return {
    ...createPreviewWindow(page),
    draw: () => page.evaluate(drawForDownload),
    drawsWhile: async (action) => {
      await page.evaluate((selector) => {
        const context = CanvasRenderingContext2D.prototype;
        const real: CanvasRenderingContext2D["drawImage"] = Reflect.get(context, "drawImage");
        const canvas = document.querySelector(selector);
        const counter = { draws: 0, restore: () => (context.drawImage = real) };
        context.drawImage = function spy(this: CanvasRenderingContext2D, ...args: unknown[]) {
          if (this.canvas === canvas) counter.draws += 1;
          Reflect.apply(real, this, args);
        };
        Reflect.set(window, "__fgDrawCounter", counter);
      }, CANVAS);
      await action();
      await page.waitForTimeout(DRAWS_SETTLE_MS);
      return page.evaluate(() => {
        const counter: { draws: number; restore: () => void } = Reflect.get(
          window,
          "__fgDrawCounter",
        );
        counter.restore();
        return counter.draws;
      });
    },
    previewCoverColors: () => coverColors(page),
    downloadRegionColor: (region) =>
      page.evaluate(averageColor, { source: "download" as const, region }),
    artworkRegionColor: (region) =>
      page.evaluate(averageColor, { source: "artwork" as const, region }),
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
  };
}
