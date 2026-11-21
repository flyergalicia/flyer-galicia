// Opens the inert story of the flyer engine and downloads what it makes. It is here because a spec
// does not know about window or evaluate.
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { type Browser, type BrowserContext, type Download, type Page } from "@playwright/test";
import { type DownloadedFile } from "../driver/flyer-output.ts";
import { flyerImageBytes } from "../cloud/seed-data.ts";

const ENGINE_STORY = "shared-flyer-engine-engineharness--engine";
const INPUTS_FILE = new URL("./golden-inputs.json", import.meta.url);
const LOGOS_DIR = new URL("../../../fixtures/logos/", import.meta.url);
const LOGO_BASE = "https://flyer-logos.invalid/";
const DOWNLOAD_TIMEOUT_MS = 60_000;
const ANYONE = { "access-control-allow-origin": "*" };

export type GoldenCaseName =
  | "one-officer-with-amounts"
  | "four-officers"
  | "no-officers"
  | "changed-logos"
  | "cropped";

interface GoldenInputs {
  artUrl: string;
  calibration: unknown;
  singleCashback: boolean;
  cases: Record<GoldenCaseName, Record<string, unknown>>;
  bulkRows: unknown[];
}

function goldenInputs(): GoldenInputs {
  const inputs: GoldenInputs = JSON.parse(readFileSync(INPUTS_FILE, "utf8"));
  return inputs;
}

export const GOLDEN_CASE_NAMES: readonly GoldenCaseName[] = [
  "one-officer-with-amounts",
  "four-officers",
  "no-officers",
  "changed-logos",
  "cropped",
];

export interface EngineHarness {
  context: BrowserContext;
  downloadPng: (name: GoldenCaseName) => Promise<DownloadedFile>;
  downloadPdf: (name: GoldenCaseName) => Promise<DownloadedFile>;
  downloadBulkZip: () => Promise<DownloadedFile>;
}

async function downloadedBy(page: Page, press: () => Promise<void>): Promise<DownloadedFile> {
  const [download]: [Download, void] = await Promise.all([
    page.waitForEvent("download", { timeout: DOWNLOAD_TIMEOUT_MS }),
    press(),
  ]);
  return { name: download.suggestedFilename(), bytes: await readFile(await download.path()) };
}

type HarnessCall = "savePdf" | "savePng" | "saveBulkZip";

function call(page: Page, method: HarnessCall, input: unknown): Promise<void> {
  return page.evaluate(
    ([name, argument]) => {
      const engine = Reflect.get(window, "__FLYER_ENGINE__");
      const run: (value: unknown) => Promise<void> = Reflect.get(engine, name);
      return run(argument);
    },
    [method, input] as const,
  );
}

/** Nothing gets out: both hosts are invented, and only the fixtures of the repo answer. */
async function serveFixtures(context: BrowserContext, artUrl: string): Promise<void> {
  await context.route(artUrl, (route) =>
    route.fulfill({ body: flyerImageBytes, contentType: "image/jpeg", headers: ANYONE }),
  );
  await context.route(`${LOGO_BASE}**`, (route) => {
    const file = new URL(route.request().url()).pathname.slice(1);
    return route.fulfill({
      body: readFileSync(new URL(file, LOGOS_DIR)),
      contentType: "image/png",
      headers: ANYONE,
    });
  });
}

export async function openEngineHarness(
  browser: Browser,
  storybookUrl: string,
): Promise<EngineHarness> {
  const inputs = goldenInputs();
  const context = await browser.newContext({
    viewport: { width: 1366, height: 800 },
    acceptDownloads: true,
  });
  await serveFixtures(context, inputs.artUrl);
  const page = await context.newPage();
  await page.goto(`${storybookUrl}iframe.html?id=${ENGINE_STORY}&viewMode=story`);
  await page.getByText("Motor listo").waitFor();
  const base = {
    artUrl: inputs.artUrl,
    calibration: inputs.calibration,
    singleCashback: inputs.singleCashback,
    logoBase: LOGO_BASE,
  };
  return {
    context,
    downloadPng: (name) =>
      downloadedBy(page, () => call(page, "savePng", { ...base, ...inputs.cases[name] })),
    downloadPdf: (name) =>
      downloadedBy(page, () => call(page, "savePdf", { ...base, ...inputs.cases[name] })),
    downloadBulkZip: () =>
      downloadedBy(page, () => call(page, "saveBulkZip", { ...base, rows: inputs.bulkRows })),
  };
}
