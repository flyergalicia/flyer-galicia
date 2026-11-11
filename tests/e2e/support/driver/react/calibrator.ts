import { type Locator, type Page } from "@playwright/test";
import { type CalibrationData, type CalibratorDriver } from "../calibrator.ts";

const SAVE_TIMEOUT_MS = 8000;
const ZOOM_SETTLE_MS = 120;
const QUESTION_TIMEOUT_MS = 10_000;

function question(page: Page): Locator {
  return page.getByTestId("option-question");
}

function editor(page: Page): Locator {
  return page.getByTestId("calibrator");
}

function isHtml({ name, mimeType }: { name: string; mimeType: string }): boolean {
  return /\.html?$/i.test(name) || mimeType === "text/html";
}

function probe(page: Page) {
  return page.evaluate(() => {
    const read = window["__flyerProbe"]?.calibrator;
    if (!read) throw new Error("The calibrator is not open");
    return read();
  });
}

/** The middle of a zone on screen, after scrolling the picture to it as a person would. */
async function zoneCenter(page: Page, id: string) {
  const { rects, scale } = await probe(page);
  const rect = rects[id];
  if (!rect) throw new Error(`The zone ${id} is not on the image`);
  const middle = { x: (rect.x + rect.w / 2) * scale, y: (rect.y + rect.h / 2) * scale };
  await page.getByTestId("calibrator-picture").evaluate((area, y) => {
    area.scrollTop = y - area.clientHeight / 2;
  }, middle.y);
  const canvas = await page.getByTestId("calibrator-canvas").boundingBox();
  if (!canvas) throw new Error("The picture of the calibrator is not on screen");
  return { x: canvas.x + middle.x, y: canvas.y + middle.y, scale };
}

async function dragBy(page: Page, handle: Locator, dx: number, dy: number): Promise<void> {
  const box = await handle.boundingBox();
  if (!box) throw new Error("The handle is not on screen");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 6 });
  await page.mouse.up();
}

async function pictureMiddle(page: Page) {
  const box = await page.getByTestId("calibrator-picture").boundingBox();
  if (!box) throw new Error("The image is not on screen");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

function uploadDriver(page: Page) {
  return {
    uploadAccepts: async () => (await page.getByTestId("flyer-file").getAttribute("accept")) ?? "",
    chooseFlyerFile: async (file: { name: string; mimeType: string; buffer: Buffer }) => {
      await page.getByTestId("flyer-file").setInputFiles(file);
      if (!isHtml(file)) await question(page).waitFor({ timeout: QUESTION_TIMEOUT_MS });
    },
    uploadError: async () => (await page.getByTestId("flyer-upload-error").textContent()) ?? "",
    optionsAsked: async () => {
      await question(page).waitFor({ timeout: QUESTION_TIMEOUT_MS });
      return question(page).locator("button[data-option]").allTextContents();
    },
    answerOption: (label: string) =>
      question(page).getByRole("button", { name: label, exact: true }).click(),
    cancelOption: () =>
      question(page).getByRole("button", { name: "Cancelar", exact: true }).click(),
  };
}

function zonesDriver(page: Page) {
  const properties = page.getByTestId("zone-properties");
  return {
    waitForEditor: () => editor(page).waitFor({ timeout: SAVE_TIMEOUT_MS }),
    isOpen: () => editor(page).isVisible(),
    title: async () => (await editor(page).getByRole("heading").textContent()) ?? "",
    zones: () =>
      page
        .getByTestId("calibrator-zones")
        .locator("[data-zone]")
        .evaluateAll((chips) =>
          chips.map((chip) => ({
            id: chip.getAttribute("data-zone") ?? "",
            label: chip.textContent,
          })),
        ),
    chooseZone: (id: string) => page.locator(`[data-zone="${id}"]`).click(),
    chosenZone: () =>
      page.evaluate(
        () =>
          document
            .querySelector('[data-testid="calibrator-zones"] [aria-pressed="true"]')
            ?.getAttribute("data-zone") ?? null,
      ),
    properties: async () => {
      if ((await properties.count()) === 0) return { zone: "", fields: [] };
      return {
        zone: (await properties.locator("b").textContent()) ?? "",
        fields: await properties
          .locator("label")
          .evaluateAll((labels) => labels.map((label) => label.firstChild?.textContent ?? "")),
      };
    },
    setProperty: async (label: string, value: string) => {
      const field = properties
        .locator("label", { hasText: label })
        .locator("input, select")
        .first();
      const tag = await field.evaluate((element) => element.tagName);
      if (tag === "SELECT") await field.selectOption(value);
      else await field.fill(value);
    },
    resetProperties: () => properties.getByRole("button", { name: "Restablecer" }).click(),
    calibration: async (): Promise<CalibrationData> => (await probe(page)).calibration,
    dragZone: async (id: string, dx: number, dy: number) => {
      const { x, y, scale } = await zoneCenter(page, id);
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + dx * scale, y + dy * scale, { steps: 6 });
      await page.mouse.up();
    },
  };
}

function benefitAndBases(page: Page) {
  const lines = page.getByTestId("benefit-lines");
  return {
    loadBenefitTemplate: async (name: string) => {
      await lines.getByRole("combobox", { name: "Plantilla" }).selectOption({ label: name });
      await lines.getByRole("button", { name: "Cargar plantilla" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Reemplazar" }).click();
    },
    benefitLines: async () =>
      ((await probe(page)).calibration.benef?.lineas ?? []).map(({ t, x }) => ({ text: t, x })),
    bases: () => editor(page).locator("#calibrator-base option").allTextContents(),
    applyBase: async (name: string) => {
      await editor(page).locator("#calibrator-base").selectOption({ label: name });
      await editor(page).getByRole("button", { name: "Cargar base" }).click();
    },
  };
}

function sizeDriver(page: Page) {
  return {
    zoomLabel: async () => (await page.getByTestId("calibrator-zoom").textContent()) ?? "",
    pressZoomIn: async (times: number) => {
      for (let press = 0; press < times; press += 1) {
        await editor(page).getByRole("button", { name: "Acercar" }).click();
      }
    },
    pressZoomReset: () => page.getByTestId("calibrator-zoom").click(),
    wheelZoomIn: async (times: number) => {
      await pictureMiddle(page);
      await page.keyboard.down("Control");
      for (let turn = 0; turn < times; turn += 1) {
        await page.mouse.wheel(0, -120);
        await page.waitForTimeout(ZOOM_SETTLE_MS);
      }
      await page.keyboard.up("Control");
    },
    wheelScroll: async () => {
      await pictureMiddle(page);
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(ZOOM_SETTLE_MS);
      return page.getByTestId("calibrator-picture").evaluate((area) => area.scrollTop);
    },
    size: async () => {
      const card = await editor(page).boundingBox();
      const picture = await page.getByTestId("calibrator-picture").boundingBox();
      return {
        width: Math.round(card?.width ?? 0),
        height: Math.round(card?.height ?? 0),
        imageAreaHeight: Math.round(picture?.height ?? 0),
      };
    },
    pressEnlarge: () =>
      editor(page)
        .getByRole("button", { name: /Ampliar/ })
        .click(),
    dragSplit: (dy: number) => dragBy(page, page.getByTestId("calibrator-split"), 0, dy),
    dragCorner: (dx: number, dy: number) =>
      dragBy(page, page.getByTestId("calibrator-corner"), dx, dy),
    saveAndActivate: async () => {
      await editor(page).getByRole("button", { name: "Guardar y activar" }).click();
      await editor(page).waitFor({ state: "detached", timeout: SAVE_TIMEOUT_MS });
    },
    close: async () => {
      await editor(page).getByRole("button", { name: "Cerrar", exact: true }).click();
      await editor(page).waitFor({ state: "detached" });
    },
  };
}

export function createReactCalibratorDriver(page: Page): CalibratorDriver {
  return {
    ...uploadDriver(page),
    ...zonesDriver(page),
    ...benefitAndBases(page),
    ...sizeDriver(page),
  };
}
