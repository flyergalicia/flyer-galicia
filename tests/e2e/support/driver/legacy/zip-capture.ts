import { type Page } from "@playwright/test";

const TOAST_SELECTORS = "#toast-el, #toast";

export async function toastText(page: Page): Promise<string> {
  return page.evaluate(
    (selectors) => document.querySelector(selectors)?.textContent ?? "",
    TOAST_SELECTORS,
  );
}

/** ZIPs stop reaching the disk and stay in the page, where they can be read. */
export async function startCapturingZips(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__fgRealZipDownload ??= window._fgBajarBlob;
    window.__fgCapturedZips = [];
    window._fgBajarBlob = (blob) => {
      window.__fgCapturedZips.push(blob);
    };
  });
}

export async function stopCapturingZips(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (window.__fgRealZipDownload) window._fgBajarBlob = window.__fgRealZipDownload;
  });
}

export async function waitForCapturedZip(page: Page, timeout: number): Promise<void> {
  await page.waitForFunction(() => window.__fgCapturedZips.length > 0, null, { timeout });
}

export interface CapturedZip {
  zips: number;
  files: string[];
  summary: string;
}

/** Files of the last captured ZIP, without folders, and its Resumen.txt. */
export async function readCapturedZip(page: Page): Promise<CapturedZip> {
  return page.evaluate(async () => {
    const zips = window.__fgCapturedZips.length;
    const last = window.__fgCapturedZips.at(-1);
    if (!last) return { zips, files: [], summary: "" };
    const zip = await JSZip.loadAsync(last);
    const files = Object.keys(zip.files).filter((name) => !zip.files[name]?.dir);
    const summary = (await zip.file("Resumen.txt")?.async("string")) ?? "";
    return { zips, files, summary };
  });
}
