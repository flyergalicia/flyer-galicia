import { type Page } from "@playwright/test";
import { type FlyerPoint, type LogoChange, type LogoEditorDriver } from "../logo-editor.ts";

const PICKER = "#fg-lg-ov";
const PICKER_ITEM = `${PICKER} .fg-lg-it`;
const PICKER_TIMEOUT_MS = 15_000;

/** Brings the point to the middle of the preview and returns where it is on the screen. */
async function touchFlyer(page: Page, at: FlyerPoint): Promise<void> {
  const target = await page.evaluate(({ x, y }) => {
    const preview = document.querySelector(".prev");
    if (!preview) throw new Error("The preview is not on screen");
    const canvasBox = cv.getBoundingClientRect();
    const scale = (canvasBox.width / cv.width) * SC;
    const previewBox = preview.getBoundingClientRect();
    preview.scrollTop += canvasBox.top + y * scale - (previewBox.top + previewBox.height / 2);
    const moved = cv.getBoundingClientRect();
    return { x: moved.left + x * scale, y: moved.top + y * scale };
  }, at);
  await page.mouse.click(target.x, target.y);
}

async function searchPicker(page: Page, text: string): Promise<string[]> {
  await page.locator("#fg-lg-q").fill(text);
  // The search box waits for a pause in the typing before it filters the list.
  await page.waitForFunction((query) => _fgLgV.q === query, text);
  return page.locator(`${PICKER} .fg-lg-it-t`).allTextContents();
}

type ChangeFields = { [Key in keyof LegacyLogoChange]-?: LegacyLogoChange[Key] | undefined };

function describeChange(entry: ChangeFields): LogoChange {
  const kind = entry.tipo === "txt" ? "text" : entry.img ? "brand" : "empty";
  const { tx, ty, tw, th } = entry;
  const hasBox = tx !== undefined && ty !== undefined && tw !== undefined && th !== undefined;
  return {
    kind,
    title: entry.t ?? "",
    box: hasBox
      ? {
          x: Math.round(tx),
          y: Math.round(ty),
          width: Math.round(tw),
          height: Math.round(th),
        }
      : null,
  };
}

export function createLegacyLogoEditorDriver(page: Page): LogoEditorDriver {
  return {
    enter: () => page.locator("#fg-lg-btn").click(),
    replaceWithBrand: async (at, search) => {
      await touchFlyer(page, at);
      await page.locator(PICKER_ITEM).first().waitFor({ timeout: PICKER_TIMEOUT_MS });
      const matches = await searchPicker(page, search);
      await page.locator(PICKER_ITEM).first().click();
      await page.locator(PICKER).waitFor({ state: "detached", timeout: PICKER_TIMEOUT_MS });
      return { matches };
    },
    leaveEmpty: async (at) => {
      await touchFlyer(page, at);
      await page.locator("#fg-lg-nada").click({ timeout: PICKER_TIMEOUT_MS });
      await page.locator(PICKER).waitFor({ state: "detached", timeout: PICKER_TIMEOUT_MS });
    },
    changes: async () => {
      const entries = await page.evaluate(() =>
        _fgLg.list.map(({ tipo, img, t, tx, ty, tw, th }) => ({ tipo, img, t, tx, ty, tw, th })),
      );
      return entries.map(describeChange);
    },
    changesInDownload: () => page.evaluate(() => (getVals().logos ?? []).length),
  };
}
