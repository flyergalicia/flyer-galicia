import { readFile } from "node:fs/promises";
import { type Download, type Page } from "@playwright/test";
import { type FlyerForm, type FlyerOutputDriver } from "../flyer-output.ts";

const DOWNLOAD_TIMEOUT_MS = 60_000;

export function companyField(page: Page) {
  return page.getByLabel("Nombre de la empresa", { exact: true });
}

export function pressOtherAction(page: Page, name: RegExp | string) {
  const box = page.getByTestId("other-actions");
  return box
    .getByRole("button", { name: /^Otros/ })
    .click()
    .then(() => box.getByRole("button", { name }).click());
}

async function downloadedBy(page: Page, press: () => Promise<void>) {
  const [download]: [Download, void] = await Promise.all([
    page.waitForEvent("download", { timeout: DOWNLOAD_TIMEOUT_MS }),
    press(),
  ]);
  return {
    name: download.suggestedFilename(),
    bytes: await readFile(await download.path()),
  };
}

async function fillForm(page: Page, { company, officers }: FlyerForm): Promise<void> {
  await companyField(page).fill(company);
  for (const [index, officer] of officers.entries()) {
    const number = String(index + 1);
    if (index > 0) await page.getByTestId("add-officer").click();
    await page.locator(`[data-officer-field="nombre${number}"]`).fill(officer.name);
    await page.locator(`[data-officer-field="celular${number}"]`).fill(officer.phone);
    await page.locator(`[data-officer-field="email${number}"]`).fill(officer.email);
  }
}

export function createReactFlyerOutputDriver(page: Page): FlyerOutputDriver {
  return {
    fillForm: (form) => fillForm(page, form),
    toggleOfficersOnFlyer: () => page.getByRole("switch", { name: "Mostrar en el flyer" }).click(),
    pressDownloadPdf: () => downloadedBy(page, () => page.getByTestId("download-pdf").click()),
    pressDownloadPng: () =>
      downloadedBy(page, () => pressOtherAction(page, /Descargar como imagen/)),
    pressGenerateZip: () =>
      downloadedBy(page, async () => {
        await page.getByRole("tab", { name: "Masivo" }).click();
        await page.getByTestId("batch-generate").click();
      }),
  };
}
