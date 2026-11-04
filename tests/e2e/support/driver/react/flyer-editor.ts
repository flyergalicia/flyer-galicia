import { createHash } from "node:crypto";
import { type Page } from "@playwright/test";
import { bucketUrl } from "../../cloud/index.ts";
import { type FlyerEditorDriver, type FlyerRegion } from "../flyer-editor.ts";
import { partialDriver } from "./pending.ts";

const OPTION_TIMEOUT_MS = 25_000;
const ZOOM_TIMEOUT_MS = 2_000;
const ZOOM_CEILING = 1.3;
const SAME_ZOOM = 0.001;

function preview(page: Page) {
  return page.getByTestId("flyer-preview");
}

export function flyerOptionButton(page: Page, option: number) {
  return page.getByTestId("flyer-options").locator(`button[data-option="${String(option)}"]`);
}

async function currentZoom(page: Page): Promise<number> {
  return page.evaluate(() => window["__flyerProbe"]?.flyerWorkspace?.().getState().zoom ?? 0);
}

/** One step of Ctrl + wheel over the preview, as a person zooms: up to the ceiling a person has. */
async function wheelToward(page: Page, wanted: number): Promise<void> {
  const box = await preview(page).boundingBox();
  if (!box) throw new Error("The preview is not on screen");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const target = Math.min(wanted, ZOOM_CEILING);
  await page.keyboard.down("Control");
  try {
    for (let current = await currentZoom(page); ; current = await currentZoom(page)) {
      if (Math.abs(current - target) < SAME_ZOOM) return;
      const goesUp = current < target;
      // It would go past: a person stays at the nearest step.
      const next = goesUp ? current * 1.25 : current / 1.25;
      const passes = goesUp ? next > target + SAME_ZOOM : next < target - SAME_ZOOM;
      if (passes && Math.abs(next - target) > Math.abs(current - target)) return;
      await page.mouse.wheel(0, goesUp ? -100 : 100);
      await page.waitForFunction(
        (before) => window["__flyerProbe"]?.flyerWorkspace?.().getState().zoom !== before,
        current,
        { timeout: ZOOM_TIMEOUT_MS },
      );
    }
  } finally {
    await page.keyboard.up("Control");
  }
}

async function downloadRegionDigest(page: Page, region: FlyerRegion): Promise<string> {
  const pixels = await page.evaluate(({ x, y, width, height }) => {
    const full = window["__flyerProbe"]?.flyerWorkspace?.().renderDownload();
    if (!full) throw new Error("There is no flyer to download");
    const crop = document.createElement("canvas");
    crop.width = width;
    crop.height = height;
    crop.getContext("2d")?.drawImage(full, x, y, width, height, 0, 0, width, height);
    return crop.toDataURL("image/png");
  }, region);
  return createHash("sha256").update(pixels).digest("hex");
}

/** Waits for that option to be on screen, finished loading, with its picture and its size. */
export async function waitForOptionShown(page: Page, option: number): Promise<void> {
  await page.waitForFunction(
    (wanted) => {
      const slot = window["__flyerProbe"]?.flyerWorkspace?.().getState().slot;
      const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="flyer-canvas"]');
      return (
        slot?.option === wanted &&
        !slot.loading &&
        !slot.failure &&
        Boolean(slot.scene) &&
        (canvas?.height ?? 0) > 1000
      );
    },
    option,
    { timeout: OPTION_TIMEOUT_MS },
  );
}

/** What that option published is what is on screen: its picture, and it is that option. */
async function showsArtworkOf(page: Page, option: number): Promise<boolean> {
  const file = bucketUrl(option === 1 ? "_active.json" : `_active${String(option)}.json`);
  return page.evaluate(
    async ({ wanted, address }) => {
      const slot = window["__flyerProbe"]?.flyerWorkspace?.().getState().slot;
      if (slot?.option !== wanted || !slot.scene) return false;
      const published: unknown = await (await fetch(address)).json();
      const imageUrl: unknown = Reflect.get(Object(published), "imageUrl");
      return typeof imageUrl === "string" && slot.scene.artKey === new URL(imageUrl).href;
    },
    { wanted: option, address: file },
  );
}

/** The slice of the flyer editor brings the rest: for now, the skeleton Cambiar logos works on. */
export function createReactFlyerEditorDriver(page: Page): FlyerEditorDriver {
  return partialDriver<FlyerEditorDriver>("flyerEditor", {
    latestNotice: async () => {
      const notice = page.getByRole("status").and(page.locator("[data-visible]"));
      return (await notice.textContent()) ?? "";
    },
    scriptRan: () => page.evaluate(() => Reflect.has(window, "__xss")),
    selectOption: async (option) => {
      // A person who is somewhere else goes back to the flyer to change it.
      if (!(await flyerOptionButton(page, option).isVisible())) {
        await page.getByRole("banner").getByRole("tab").first().click();
      }
      await flyerOptionButton(page, option).click();
    },
    waitForOptionShown: (option) => waitForOptionShown(page, option),
    waitForLoadProblem: async () => {
      const notice = page.getByTestId("flyer-load-problem");
      await notice.waitFor({ timeout: OPTION_TIMEOUT_MS });
      return (await notice.innerText()).replace(/\s+/g, " ").trim();
    },
    waitForNoLoadProblem: () =>
      page
        .getByTestId("flyer-load-problem")
        .waitFor({ state: "detached", timeout: OPTION_TIMEOUT_MS }),
    hasLoadProblem: async () => (await page.getByTestId("flyer-load-problem").count()) > 0,
    retryLoading: () =>
      page
        .getByTestId("flyer-load-problem")
        .getByRole("button", { name: /Reintentar/ })
        .click(),
    activeOption: () =>
      page.evaluate(() => window["__flyerProbe"]?.flyerWorkspace?.().getState().slot.option ?? 0),
    showsArtworkOf: (option) => showsArtworkOf(page, option),
    activeCalibration: () =>
      page.evaluate(
        () => window["__flyerProbe"]?.flyerWorkspace?.().getState().slot.scene?.calibration ?? {},
      ),
    setZoom: (zoom) => wheelToward(page, zoom),
    restoreDefaults: async () => {
      await page.getByRole("button", { name: "Restaurar", exact: true }).click();
    },
    downloadRegionDigest: (region) => downloadRegionDigest(page, region),
    downloadBlockReason: () =>
      page.evaluate(() => window["__flyerProbe"]?.flyerReadings?.().blockText() ?? ""),
    optionCalibration: (option) =>
      page.evaluate(
        (n) => window["__flyerProbe"]?.flyerReadings?.().optionCalibration(n) ?? {},
        option,
      ),
  });
}
