import { type Page } from "@playwright/test";
import { type CalibratorDriver } from "../calibrator.ts";

const QUESTION = "#fg-askopt";
const MODAL = "#cal-modal";
const SAVE_TIMEOUT_MS = 8_000;
const ZOOM_SETTLE_MS = 120;

export function createLegacyCalibratorDriver(page: Page): CalibratorDriver {
  const zoneBox = (id: string) =>
    page.evaluate((zone) => {
      const rect = _calZoneRects()[zone];
      const area = document.querySelector("#cal-modal .cal-body");
      if (!rect || !area || !_cal) return null;
      area.scrollTop = (rect.y + rect.h / 2) * _cal.ds - area.clientHeight / 2;
      const canvas = document.querySelector("#cal-cv")?.getBoundingClientRect();
      if (!canvas) return null;
      return {
        x: canvas.left + (rect.x + rect.w / 2) * _cal.ds,
        y: canvas.top + (rect.y + rect.h / 2) * _cal.ds,
        scale: _cal.ds,
      };
    }, id);
  const dragBy = async (selector: string, dx: number, dy: number) => {
    const box = await page.locator(selector).boundingBox();
    if (!box) throw new Error(`${selector} is not on screen`);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 6 });
    await page.mouse.up();
  };
  return {
    uploadAccepts: async () => (await page.locator("#upload-file").getAttribute("accept")) ?? "",
    chooseFlyerFile: (file) => page.setInputFiles("#upload-file", file),
    uploadError: async () => (await page.locator("#upload-err").textContent()) ?? "",
    optionsAsked: () =>
      page
        .locator(`${QUESTION} button[data-o]`)
        .evaluateAll((buttons) =>
          buttons.flatMap((button) =>
            button.getAttribute("data-o") === "0" ? [] : [button.textContent],
          ),
        ),
    answerOption: (label) => page.locator(`${QUESTION} button`, { hasText: label }).click(),
    cancelOption: () => page.locator(`${QUESTION} button[data-o="0"]`).click(),
    waitForEditor: () => page.locator(`${MODAL}.show`).waitFor({ timeout: SAVE_TIMEOUT_MS }),
    isOpen: () => page.locator(`${MODAL}.show`).isVisible(),
    title: async () => (await page.locator("#cal-title").textContent()) ?? "",
    zones: () => page.evaluate(() => _calZones().map(({ id, label }) => ({ id, label }))),
    chooseZone: (id) =>
      page.evaluate((zone) => {
        _calSelect(zone);
      }, id),
    chosenZone: () => page.evaluate(() => _cal?.sel ?? null),
    properties: async () => {
      const row = page.locator("#cal-prop-row.show");
      if ((await row.count()) === 0) return { zone: "", fields: [] };
      return {
        zone: (await row.locator("b").textContent()) ?? "",
        fields: await row
          .locator("label")
          .evaluateAll((labels) => labels.map((label) => label.firstChild?.textContent ?? "")),
      };
    },
    setProperty: async (label, value) => {
      const field = page
        .locator("#cal-prop-row label", { hasText: label })
        .locator("input, select")
        .first();
      const tag = await field.evaluate((element) => element.tagName);
      if (tag === "SELECT") await field.selectOption(value);
      else await field.fill(value);
    },
    resetProperties: () => page.locator("#cal-prop-row button").click(),
    calibration: () => page.evaluate(() => structuredClone(_cal?.cfg ?? {})),
    dragZone: async (id, dx, dy) => {
      const box = await zoneBox(id);
      if (!box) throw new Error(`The zone ${id} is not on the image`);
      await page.mouse.move(box.x, box.y);
      await page.mouse.down();
      await page.mouse.move(box.x + dx * box.scale, box.y + dy * box.scale, { steps: 6 });
      await page.mouse.up();
    },
    loadBenefitTemplate: async (name) => {
      await page.locator("#cal-benef-plantilla").selectOption({ label: name });
      await page.locator('#cal-benef-row button[onclick="_calBenefPlantilla()"]').click();
      await page.locator("#fg-cf-ok").click();
    },
    benefitLines: () =>
      page.evaluate(() => {
        const lines = _cal?.cfg.benef?.lineas ?? [];
        return lines.map(({ t, x }) => ({ text: t, x }));
      }),
    bases: () =>
      page
        .locator("#cal-base option")
        .evaluateAll((options) => options.map((option) => option.textContent)),
    applyBase: async (name) => {
      await page.locator("#cal-base").selectOption({ label: name });
      await page.locator(`${MODAL} button[onclick="_calBaseAplicar()"]`).click();
    },
    zoomLabel: async () => (await page.locator("#cal-zoom-pct").textContent()) ?? "",
    pressZoomIn: async (times) => {
      for (let press = 0; press < times; press += 1) {
        await page.locator(`${MODAL} .cal-zoom button`).nth(2).click();
      }
    },
    pressZoomReset: () => page.locator("#cal-zoom-pct").click(),
    wheelZoomIn: async (times) => {
      const box = await page.locator(`${MODAL} .cal-body`).boundingBox();
      if (!box) throw new Error("The image is not on screen");
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.keyboard.down("Control");
      for (let turn = 0; turn < times; turn += 1) {
        await page.mouse.wheel(0, -120);
        await page.waitForTimeout(ZOOM_SETTLE_MS);
      }
      await page.keyboard.up("Control");
    },
    wheelScroll: async () => {
      const body = page.locator(`${MODAL} .cal-body`);
      const box = await body.boundingBox();
      if (!box) throw new Error("The image is not on screen");
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(ZOOM_SETTLE_MS);
      return body.evaluate((element) => element.scrollTop);
    },
    size: () =>
      page.evaluate(() => {
        const card = document.querySelector(`#cal-modal .cal-card`)?.getBoundingClientRect();
        const body = document.querySelector(`#cal-modal .cal-body`)?.getBoundingClientRect();
        return {
          width: Math.round(card?.width ?? 0),
          height: Math.round(card?.height ?? 0),
          imageAreaHeight: Math.round(body?.height ?? 0),
        };
      }),
    pressEnlarge: () => page.locator("#cal-ampliar").click(),
    dragSplit: (dy) => dragBy("#cal-split", 0, dy),
    dragCorner: (dx, dy) => dragBy("#cal-grip", dx, dy),
    saveAndActivate: async () => {
      await page.locator(`${MODAL} button[onclick="_calSave()"]`).click();
      await page.locator(`${MODAL}.show`).waitFor({ state: "detached", timeout: SAVE_TIMEOUT_MS });
    },
    close: () =>
      page.evaluate(() => {
        _calClose();
      }),
  };
}
