import { readFile } from "node:fs/promises";
import { type Download, type Page } from "@playwright/test";
import { type FlyerForm, type FlyerOutputDriver } from "../flyer-output.ts";

const DOWNLOAD_TIMEOUT_MS = 60_000;
const FIRST_OFFICER = 1;

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
  await page.locator("#empresa").fill(company);
  for (const [index, officer] of officers.entries()) {
    const number = index + 1;
    if (number > FIRST_OFFICER) await page.locator("#fg-add-asesor").click();
    const suffix = number === FIRST_OFFICER ? "" : String(number);
    await page.locator(`#nombre${suffix}`).fill(officer.name);
    await page.locator(`#celular${suffix}`).fill(officer.phone);
    await page.locator(`#email${suffix}`).fill(officer.email);
  }
}

export function createLegacyFlyerOutputDriver(page: Page): FlyerOutputDriver {
  return {
    fillForm: (form) => fillForm(page, form),
    toggleOfficersOnFlyer: () => page.locator("#fg-of-sw").click(),
    pressDownloadPdf: () => downloadedBy(page, () => page.locator("#btn-dl-pdf").click()),
    pressDownloadPng: () =>
      downloadedBy(page, async () => {
        await page.locator("#fg-otros .fg-otros-tg, .fg-otros .fg-otros-tg").first().click();
        await page.locator(".fg-otros-item", { hasText: "Descargar como imagen" }).first().click();
      }),
    pressGenerateZip: () =>
      downloadedBy(page, async () => {
        await page.getByRole("tab", { name: "Masivo" }).click();
        await page.locator("#btn-gen").click();
      }),
  };
}
