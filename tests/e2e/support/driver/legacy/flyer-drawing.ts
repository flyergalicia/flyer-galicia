import { type Page } from "@playwright/test";
import { type DrawnFlyer, type FlyerDrawingDriver } from "../flyer-drawing.ts";

const WHEEL_SETTLE_MS = 80;
const DRAWS_SETTLE_MS = 500;

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
    const canvas = fullRes(getVals());
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
  const image = source === "download" ? fullRes(getVals()) : baseImg;
  const crop = document.createElement("canvas");
  crop.width = width;
  crop.height = height;
  const context = crop.getContext("2d", { willReadFrequently: true });
  if (!context || !image) return [];
  context.drawImage(image, x, y, width, height, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);
  const sum = [0, 0, 0];
  for (let at = 0; at < data.length; at += 4) {
    sum[0] = (sum[0] ?? 0) + (data[at] ?? 0);
    sum[1] = (sum[1] ?? 0) + (data[at + 1] ?? 0);
    sum[2] = (sum[2] ?? 0) + (data[at + 2] ?? 0);
  }
  const pixels = data.length / 4;
  return sum.map((value) => Math.round(value / pixels));
}

export function createLegacyFlyerDrawingDriver(page: Page): FlyerDrawingDriver {
  const previewBox = async () => {
    const box = await page.locator(".cw").first().boundingBox();
    if (!box) throw new Error("The preview is not on screen");
    return box;
  };
  return {
    draw: () => page.evaluate(drawForDownload),
    drawsWhile: async (action) => {
      await page.evaluate(() => {
        const context = CanvasRenderingContext2D.prototype;
        window.__fgRealDraw ??= Reflect.get(context, "drawImage");
        window.__fgDraws = 0;
        const real = window.__fgRealDraw;
        context.drawImage = function spy(this: CanvasRenderingContext2D, ...args: unknown[]) {
          if (this.canvas === cv) window.__fgDraws = (window.__fgDraws ?? 0) + 1;
          Reflect.apply(real, this, args);
        };
      });
      await action();
      await page.waitForTimeout(DRAWS_SETTLE_MS);
      return page.evaluate(() => {
        if (window.__fgRealDraw) CanvasRenderingContext2D.prototype.drawImage = window.__fgRealDraw;
        return window.__fgDraws ?? 0;
      });
    },
    previewCoverColors: () =>
      page.evaluate(() => {
        const colors: string[] = [];
        const context = CanvasRenderingContext2D.prototype;
        const fillRect: CanvasRenderingContext2D["fillRect"] = Reflect.get(context, "fillRect");
        context.fillRect = function spyRectangle(x, y, width, height) {
          if (typeof this.fillStyle === "string") colors.push(this.fillStyle);
          fillRect.call(this, x, y, width, height);
        };
        try {
          redrawNow();
        } finally {
          context.fillRect = fillRect;
        }
        return colors;
      }),
    pointUnderMouseAfterZoom: async () => {
      const box = await previewBox();
      const mouse = { x: box.x + box.width / 2, y: box.y + Math.min(box.height / 2, 250) };
      await page.locator(".prev").evaluate((preview) => {
        preview.scrollTop = 900;
      });
      const fractionUnderMouse = () =>
        page.evaluate(({ x, y }) => {
          const rect = cv.getBoundingClientRect();
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
    preview: () =>
      page.evaluate(() => ({
        zoom: ZOOM,
        scrollTop: document.querySelector(".cw")?.scrollTop ?? 0,
      })),
    wheelOverPreview: async ({ ctrl, times, direction }) => {
      const box = await previewBox();
      await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 300));
      if (ctrl) await page.keyboard.down("Control");
      for (let turn = 0; turn < times; turn += 1) {
        await page.mouse.wheel(0, direction === "in" ? -120 : 120);
        await page.waitForTimeout(WHEEL_SETTLE_MS);
      }
      if (ctrl) await page.keyboard.up("Control");
    },
    openPreviewWindow: async () => {
      await page.locator('button[onclick="openPreview()"]').first().click();
      await page.locator(".modal.fg-mz").waitFor();
      await page.waitForTimeout(WHEEL_SETTLE_MS);
    },
    closePreviewWindow: async () => {
      await page.locator("#modal .modal-close").click();
    },
    previewWindowZoom: () =>
      page.evaluate(() => {
        const label = document.querySelector("#fg-mzoom-pct")?.textContent ?? "";
        const modal = document.querySelector(".modal.fg-mz");
        return {
          percent: Number(label.replace(/\D/g, "")),
          open: Boolean(modal) && (modal?.getClientRects().length ?? 0) > 0,
        };
      }),
    wheelOverPreviewWindow: async ({ ctrl, times }) => {
      const box = await page.locator(".modal.fg-mz img").first().boundingBox();
      if (!box) throw new Error("The preview window is not on screen");
      await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 200));
      if (ctrl) await page.keyboard.down("Control");
      for (let turn = 0; turn < times; turn += 1) {
        await page.mouse.wheel(0, -120);
        await page.waitForTimeout(WHEEL_SETTLE_MS);
      }
      if (ctrl) await page.keyboard.up("Control");
    },
    doubleClickPreviewWindow: () => page.locator(".modal.fg-mz img").first().dblclick(),
    clickPreviewWindowBackground: () => page.mouse.click(5, 5),
    dragOutOfPreviewWindow: async () => {
      const box = await page.locator(".modal.fg-mz img").first().boundingBox();
      if (!box) throw new Error("The preview window is not on screen");
      await page.mouse.move(box.x + box.width / 2, box.y + 100);
      await page.mouse.down();
      await page.mouse.move(5, 5, { steps: 5 });
      await page.mouse.up();
    },
    downloadRegionColor: (region) =>
      page.evaluate(averageColor, { source: "download" as const, region }),
    artworkRegionColor: (region) =>
      page.evaluate(averageColor, { source: "artwork" as const, region }),
  };
}
