import { createHash } from "node:crypto";
import { type Page } from "@playwright/test";
import { type FlyerEditorDriver, type FlyerRegion } from "../flyer-editor.ts";

const NOTICE = "#fg-flyer-falla";
const NOTICE_TIMEOUT_MS = 25_000;
const SHOWN_TIMEOUT_MS = 25_000;

async function waitForLoadProblem(page: Page): Promise<string> {
  const notice = page.locator(NOTICE);
  await notice.waitFor({ state: "attached", timeout: NOTICE_TIMEOUT_MS });
  return (await notice.innerText()).replace(/\s+/g, " ").trim();
}

async function downloadRegionDigest(page: Page, region: FlyerRegion): Promise<string> {
  const pixels = await page.evaluate(({ x, y, width, height }) => {
    const full = fullRes(getVals());
    const crop = document.createElement("canvas");
    crop.width = width;
    crop.height = height;
    crop.getContext("2d")?.drawImage(full, x, y, width, height, 0, 0, width, height);
    return crop.toDataURL("image/png");
  }, region);
  return createHash("sha256").update(pixels).digest("hex");
}

export function createLegacyFlyerEditorDriver(page: Page): FlyerEditorDriver {
  return {
    selectOption: (option) =>
      page.evaluate((n) => {
        switchFlyerOption(n);
      }, option),
    reloadOption: (option) =>
      page.evaluate((n) => {
        Reflect.deleteProperty(_fgOptCache, n);
        switchFlyerOption(n);
      }, option),
    waitForOptionShown: async (option) => {
      await page.waitForFunction(
        ({ n, notice }) => {
          const artwork = _fgOptCache[n]?.img;
          return (
            !document.querySelector(notice) &&
            window._fgOpt === n &&
            window._fgPrevGate === false &&
            Boolean(artwork) &&
            baseImg === artwork
          );
        },
        { n: option, notice: NOTICE },
        { timeout: SHOWN_TIMEOUT_MS },
      );
    },
    waitForLoadProblem: () => waitForLoadProblem(page),
    waitForNoLoadProblem: () =>
      page.locator(NOTICE).waitFor({ state: "detached", timeout: NOTICE_TIMEOUT_MS }),
    hasLoadProblem: async () => (await page.locator(NOTICE).count()) > 0,
    retryLoading: () => page.locator(`${NOTICE} button`).click(),
    optionStatus: (option) =>
      page.evaluate(
        (n) => ({
          settled: _fgOptCache[n]?.loaded === true,
          hasArtwork: _optTieneImg(n) ?? null,
          ready: _fgOptLista(n),
        }),
        option,
      ),
    showsArtworkOf: (option) => page.evaluate((n) => baseImg === _fgOptCache[n]?.img, option),
    activeCalibration: () => page.evaluate(() => FLYER_CFG),
    optionCalibration: (option) => page.evaluate((n) => _fgOptCache[n]?.cfg ?? {}, option),
    downloadBlockReason: () => page.evaluate(() => _fgDescargaBloqueo()),
    previewIsOff: () =>
      page.evaluate(() =>
        Boolean(document.querySelector(".cw")?.classList.contains("fg-cw-falla")),
      ),
    setZoom: (zoom) =>
      page.evaluate((value) => {
        ZOOM = value;
        calcSC();
        redrawNow();
      }, zoom),
    restoreDefaults: () =>
      page.evaluate(() => {
        resetVals();
      }),
    downloadRegionDigest: (region) => downloadRegionDigest(page, region),
  };
}
