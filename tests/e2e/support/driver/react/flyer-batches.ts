// Masivo as a person does it: a real sheet in the field, a real ZIP on disk. What they ask of a line
// that fails is a browser that fails while drawing that company.
import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { type Download, type Page } from "@playwright/test";
import {
  type BatchCompany,
  type BatchRow,
  type FlyerEditorDriver,
  type UploadedFile,
} from "../flyer-editor.ts";
import { bucketUrl } from "../../cloud/index.ts";
import { readZipEntries } from "../../golden-files.ts";
import { closeRegistryIfOpen, questionBeforeGenerating } from "./company-list.ts";

const SHEET_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const BATCH_TIMEOUT_MS = 60_000;
const SHEET_TIMEOUT_MS = 15_000;
const LATE_ZIP_MS = 1_500;
const BLOCKED_BATCH_MS = 1_500;
const MEMORY_RELEASE_MS = 2_500;
const LONG_WAIT_MS = 30_000;
const SHORT_WAIT_MS = 1_000;
const LOAD_TIMEOUT_MS = 25_000;
const NOT_ARRIVING = "**/storage/v1/object/public/flyers/_active*.json*";
const SUMMARY_FILE = "Resumen.txt";
const ZIP_LIBRARY = "**/*jszip*";
const LIBRARY_DELAY_MS = 1_000;
/** The flyer the driver adds to the bar: nobody goes to it, it only has to be there. */
const ANOTHER_FLYER = 96;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };
const FIRST_ROW = 2;

async function encodeRows(lines: readonly { readonly row: number; readonly cells: string[] }[]) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Hoja1");
  for (const { row, cells } of lines) sheet.getRow(row).values = cells;
  return Buffer.from(await book.xlsx.writeBuffer());
}

function panel(page: Page) {
  return page.getByTestId("bulk-panel");
}

/** A person closes what is on top and goes to the panel. */
async function goToMasivo(page: Page): Promise<void> {
  await closeRegistryIfOpen(page);
  await page
    .getByRole("tablist", { name: "Modo de armado" })
    .getByRole("tab", { name: "Masivo" })
    .click();
  await panel(page).waitFor();
}

function chooseFile(page: Page, file: UploadedFile) {
  return page.getByTestId("batch-file").setInputFiles(file);
}

/** What was read before goes away first: a new sheet is only known by its count. */
async function putSheet(page: Page, buffer: Buffer): Promise<void> {
  await goToMasivo(page);
  const clear = page.getByTestId("batch-clear");
  if (await clear.isVisible()) await clear.click();
  await chooseFile(page, { name: "t.xlsx", mimeType: SHEET_MIME, buffer });
  await page.getByTestId("batch-row-count").waitFor({ timeout: SHEET_TIMEOUT_MS });
}

function linesOf(lines: readonly string[][]) {
  return lines.map((cells, index) => ({ row: index + 1, cells }));
}

/** Each line in its row of the sheet, with a head that has every column. */
function sheetOf(rows: readonly BatchRow[]) {
  const head = [...new Set(rows.flatMap(({ cells }) => Object.keys(cells)))];
  let next = FIRST_ROW;
  const lines = rows.map(({ cells, sheetRow }) => {
    const row = sheetRow ?? next;
    next = row + 1;
    return { row, cells: head.map((column) => cells[column] ?? "") };
  });
  return [{ row: 1, cells: head }, ...lines];
}

async function uploadRows(page: Page, rows: readonly BatchRow[]): Promise<void> {
  await putSheet(page, await encodeRows(sheetOf(rows)));
}

function generateButton(page: Page) {
  return page.getByTestId("batch-generate");
}

function batchIsRunning(page: Page): Promise<boolean> {
  return page.evaluate(() => window["__flyerProbe"]?.flyerBatch?.().isRunning() ?? false);
}

function visibleNotice(page: Page) {
  return page.getByRole("status").and(page.locator("[data-visible]"));
}

function latestNotice(page: Page): Promise<string> {
  return visibleNotice(page)
    .textContent()
    .then((text) => text ?? "");
}

/** Everything that was drawn with that company in it fails as a browser that gives up would. */
async function failWhileDrawing(page: Page, company: string | undefined): Promise<void> {
  if (company === undefined) return;
  await page.evaluate((failing) => {
    const prototype = CanvasRenderingContext2D.prototype;
    const real: unknown = Reflect.get(prototype, "fillText");
    Reflect.set(window, "__fgRealFillText", real);
    Reflect.set(prototype, "fillText", function fillText(this: unknown, ...args: unknown[]) {
      if (String(args[0]).includes(failing)) throw new Error("falla simulada");
      if (typeof real === "function") Reflect.apply(real, this, args);
    });
  }, company);
}

async function drawNormallyAgain(page: Page, company: string | undefined): Promise<void> {
  if (company === undefined) return;
  await page.evaluate(() => {
    Reflect.set(
      CanvasRenderingContext2D.prototype,
      "fillText",
      Reflect.get(window, "__fgRealFillText"),
    );
  });
}

async function zipOf(download: Download) {
  const entries = readZipEntries(await readFile(await download.path()));
  return {
    files: [...entries.keys()],
    summary: entries.get(SUMMARY_FILE)?.toString("utf8") ?? "",
  };
}

function waitUntilFree(page: Page) {
  return page.waitForFunction(() => !window["__flyerProbe"]?.flyerBatch?.().isRunning(), null, {
    timeout: BATCH_TIMEOUT_MS,
  });
}

async function generateBatch(
  page: Page,
  { rows, failingCompany }: { rows?: BatchRow[]; failingCompany?: string } = {},
) {
  if (rows) await uploadRows(page, rows);
  else await goToMasivo(page);
  await failWhileDrawing(page, failingCompany);
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: BATCH_TIMEOUT_MS }),
    generateButton(page).click(),
  ]);
  const zip = await zipOf(download);
  await waitUntilFree(page);
  await drawNormallyAgain(page, failingCompany);
  const screen = await page.evaluate(() => ({
    drawn: (window["__flyerProbe"]?.flyerBatch?.().drawn() ?? []).map(
      ({ company, officer, phone, firstAmount, noCashback }) => ({
        company,
        officer,
        phone,
        firstAmount,
        noCashback,
      }),
    ),
    finalOption: window["__flyerProbe"]?.flyerWorkspace?.().getState().slot.option ?? 0,
  }));
  return {
    ...screen,
    ...zip,
    progress: await page.getByTestId("batch-progress").innerText(),
    idle: true,
  };
}

async function generateBatchTwiceInARow(page: Page, rows: BatchRow[]): Promise<number> {
  await uploadRows(page, rows);
  let zips = 0;
  const count = () => {
    zips += 1;
  };
  page.on("download", count);
  await generateButton(page).evaluate((button) => {
    if (!(button instanceof HTMLElement)) return;
    button.click();
    button.click();
  });
  await page.waitForEvent("download", { timeout: BATCH_TIMEOUT_MS });
  await waitUntilFree(page);
  await page.waitForTimeout(LATE_ZIP_MS);
  page.off("download", count);
  return zips;
}

async function rowsLeft(page: Page): Promise<number> {
  const count = page.getByTestId("batch-row-count");
  return (await count.count()) > 0 ? Number(await count.getAttribute("data-rows")) : 0;
}

/** With one flyer there is nothing to change to: a person has to have another one on the bar. */
async function offerAnotherFlyer(page: Page): Promise<void> {
  const [list, faculties] = await page.evaluate(
    (addresses) =>
      Promise.all(
        addresses.map(async (address) => {
          const answer = await fetch(address);
          const file: unknown = await answer.json();
          return file;
        }),
      ),
    [bucketUrl("_opciones.json"), bucketUrl("_facultades.json")],
  );
  const opts: unknown = Reflect.get(Object(list), "opts");
  const roles: unknown = Reflect.get(Object(faculties), "roles");
  const advisor: unknown = Reflect.get(Object(roles), "asesor");
  await page.route("**/_opciones.json*", (route) =>
    route.fulfill({
      json: {
        opts: [
          ...(Array.isArray(opts) ? opts : []),
          { n: ANOTHER_FLYER, nombre: "Otro flyer", solapa: "flyer" },
        ],
      },
      headers: CORS,
    }),
  );
  await page.route("**/_facultades.json*", (route) =>
    route.fulfill({
      json: {
        roles: {
          ...Object(roles),
          asesor: { ...Object(advisor), [`opcion_${String(ANOTHER_FLYER)}`]: true },
        },
      },
      headers: CORS,
    }),
  );
  await page.reload();
  await page
    .getByTestId("flyer-options")
    .locator(`button[data-option="${String(ANOTHER_FLYER)}"]`)
    .waitFor({ timeout: LOAD_TIMEOUT_MS });
}

async function generateBatchAndInterfere(page: Page, lines: readonly string[][]) {
  await offerAnotherFlyer(page);
  await putSheet(page, await encodeRows(linesOf(lines)));
  // A machine that runs it fast would end it before the person gets to touch anything.
  await page.route(ZIP_LIBRARY, async (route) => {
    await new Promise((resolve) => {
      setTimeout(resolve, LIBRARY_DELAY_MS);
    });
    await route.fallback();
  });
  const downloaded = page.waitForEvent("download", { timeout: BATCH_TIMEOUT_MS });
  await generateButton(page).click();
  await page.getByTestId("batch-clear").click();
  const clearNotice = await latestNotice(page);
  const rowsAfterClear = await rowsLeft(page);
  await page
    .getByTestId("flyer-options")
    .locator(`button[data-option="${String(ANOTHER_FLYER)}"]`)
    .click();
  const switchNotice = await latestNotice(page);
  const { files } = await zipOf(await downloaded);
  await waitUntilFree(page);
  await page.unroute(ZIP_LIBRARY);
  return {
    clearNotice,
    rowsAfterClear,
    switchNotice,
    pdfs: files.filter((name) => name.endsWith(".pdf")).length,
    idle: !(await batchIsRunning(page)),
  };
}

async function tryBatchWithoutFlyer(page: Page, rows: BatchRow[]) {
  await page.route(NOT_ARRIVING, (route) => route.abort("connectionreset"));
  await page.reload();
  await page.getByTestId("flyer-load-problem").waitFor({ timeout: LOAD_TIMEOUT_MS });
  await uploadRows(page, rows);
  let zips = 0;
  const count = () => {
    zips += 1;
  };
  page.on("download", count);
  await generateButton(page).click();
  await visibleNotice(page).filter({ hasText: /flyer/ }).waitFor({ timeout: BATCH_TIMEOUT_MS });
  const notice = await latestNotice(page);
  await page.waitForTimeout(BLOCKED_BATCH_MS);
  page.off("download", count);
  await page.unroute(NOT_ARRIVING);
  const problem = page.getByTestId("flyer-load-problem");
  await problem.getByRole("button", { name: /Reintentar/ }).click();
  await problem.waitFor({ state: "detached", timeout: LOAD_TIMEOUT_MS });
  return { zips, notice };
}

async function downloadBatchTemplate(page: Page) {
  await goToMasivo(page);
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: SHEET_TIMEOUT_MS }),
    panel(page)
      .getByRole("button", { name: /Descargar plantilla/ })
      .click(),
  ]);
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(await download.path());
  const values = book.worksheets[0]?.getRow(1).values;
  const head = Array.isArray(values)
    ? values.flatMap((value) => (typeof value === "string" ? [value] : []))
    : [];
  return { name: download.suggestedFilename(), head };
}

async function generateBatchToDisk(page: Page, rows: BatchRow[]) {
  await uploadRows(page, rows);
  await page.evaluate(
    ({ longWait, shortWait }) => {
      const addresses = { made: 0, released: 0 };
      Reflect.set(window, "__fgAddresses", addresses);
      // The app gives the memory back a minute later; the test does not wait that long.
      const later = window.setTimeout.bind(window);
      Reflect.set(window, "setTimeout", (work: () => void, delay?: number) =>
        later(work, (delay ?? 0) >= longWait ? shortWait : delay),
      );
      const createObjectURL = URL.createObjectURL.bind(URL);
      const revokeObjectURL = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = (blob) => {
        addresses.made += 1;
        return createObjectURL(blob);
      };
      URL.revokeObjectURL = (address) => {
        addresses.released += 1;
        revokeObjectURL(address);
      };
    },
    { longWait: LONG_WAIT_MS, shortWait: SHORT_WAIT_MS },
  );
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: BATCH_TIMEOUT_MS }),
    generateButton(page).click(),
  ]);
  await page.waitForTimeout(MEMORY_RELEASE_MS);
  const addresses = await page.evaluate(() => {
    const read: unknown = Reflect.get(window, "__fgAddresses");
    return {
      made: Number(Reflect.get(Object(read), "made")),
      released: Number(Reflect.get(Object(read), "released")),
    };
  });
  return {
    file: download.suggestedFilename(),
    addressesMade: addresses.made,
    addressesReleased: addresses.released,
  };
}

/** The browser cannot make the file: what a machine out of memory does. */
async function generateBatchWithBrokenZip(page: Page, rows: BatchRow[]) {
  await uploadRows(page, rows);
  await page.evaluate(() => {
    const RealBlob = window.Blob;
    Reflect.set(
      window,
      "Blob",
      new Proxy(RealBlob, {
        construct(Target, [parts, options]: [BlobPart[], BlobPropertyBag | undefined]) {
          if (options?.type === "application/zip") throw new Error("falla simulada");
          return new Target(parts, options);
        },
      }),
    );
  });
  await generateButton(page).click();
  await visibleNotice(page).filter({ hasText: /ZIP\./ }).waitFor({ timeout: BATCH_TIMEOUT_MS });
  await waitUntilFree(page);
  return { notice: await latestNotice(page), canGenerate: await generateButton(page).isEnabled() };
}

/**
 * A batch of verdad, with a sheet of lines, kept waiting for the library of the ZIP. A new page has
 * to bring it again: a page that already has it would not wait for anything.
 */
export async function holdBatch(page: Page): Promise<() => Promise<void>> {
  const gate: { open?: () => void } = {};
  const held = new Promise<void>((resolve) => {
    gate.open = resolve;
  });
  await page.route(ZIP_LIBRARY, async (route) => {
    await held;
    await route.fallback();
  });
  await page.reload();
  await page.getByRole("banner").waitFor({ timeout: LOAD_TIMEOUT_MS });
  await uploadRows(page, [{ cells: { empresa: "ACME", config: "BAU", asesor1_nombre: "Ana" } }]);
  await generateButton(page).click();
  return async () => {
    const download = page.waitForEvent("download", { timeout: BATCH_TIMEOUT_MS });
    gate.open?.();
    await download;
    await waitUntilFree(page);
    await page.unroute(ZIP_LIBRARY);
  };
}

function batchQuestion(page: Page, companies: BatchCompany[]) {
  return questionBeforeGenerating(
    page,
    companies.map(({ name, cashback, option }) => ({
      name,
      cashback,
      ...(option === undefined ? {} : { category: { option } }),
    })),
  );
}

export function createReactFlyerBatches(
  page: Page,
): Pick<
  FlyerEditorDriver,
  | "downloadBatchTemplate"
  | "generateBatchToDisk"
  | "generateBatchWithBrokenZip"
  | "batchQuestion"
  | "generateBatch"
  | "generateBatchTwiceInARow"
  | "generateBatchAndInterfere"
  | "pressGenerateBatch"
  | "pressClearBatch"
  | "batchIsRunning"
  | "waitForBatchZip"
  | "tryBatchWithoutFlyer"
  | "chooseExcelFile"
  | "excelFieldIsEmpty"
  | "uploadExcelSheet"
> {
  /** What Generar made, for whoever comes to read it later. */
  let coming: Promise<Download | null> | null = null;
  /** The last sheet: going to a new page takes it away, and a person chooses it again. */
  let sheet: readonly string[][] = [];
  return {
    downloadBatchTemplate: () => downloadBatchTemplate(page),
    generateBatchToDisk: (rows) => generateBatchToDisk(page, rows),
    generateBatchWithBrokenZip: (rows) => generateBatchWithBrokenZip(page, rows),
    batchQuestion: (companies) => batchQuestion(page, companies),
    generateBatch: (options) => generateBatch(page, options),
    generateBatchTwiceInARow: (rows) => generateBatchTwiceInARow(page, rows),
    generateBatchAndInterfere: () => generateBatchAndInterfere(page, sheet),
    pressGenerateBatch: async () => {
      coming = page.waitForEvent("download", { timeout: BATCH_TIMEOUT_MS }).catch(() => null);
      await generateButton(page).click();
    },
    pressClearBatch: async () => {
      await page.getByTestId("batch-clear").click();
      return { notice: await latestNotice(page), rowsLeft: await rowsLeft(page) };
    },
    batchIsRunning: () => batchIsRunning(page),
    waitForBatchZip: async (timeout) => {
      const download = await Promise.race([
        coming,
        new Promise<null>((resolve) => {
          setTimeout(() => {
            resolve(null);
          }, timeout);
        }),
      ]);
      return download ? (await zipOf(download)).files : [];
    },
    tryBatchWithoutFlyer: (rows) => tryBatchWithoutFlyer(page, rows),
    chooseExcelFile: async (file) => {
      await goToMasivo(page);
      await chooseFile(page, file);
    },
    excelFieldIsEmpty: async () => (await page.getByTestId("batch-file").inputValue()) === "",
    uploadExcelSheet: async (lines) => {
      sheet = lines;
      await putSheet(page, await encodeRows(linesOf(lines)));
      const summary = page.getByTestId("batch-validation");
      const severity = await summary.getAttribute("data-severity");
      return {
        validation: await summary.innerText(),
        severity:
          severity === "error" || severity === "warning" || severity === "ok"
            ? severity
            : "unknown",
        canGenerate: await generateButton(page).isEnabled(),
        rowNumbers: await page.evaluate(() =>
          (window["__flyerProbe"]?.flyerBatch?.().rowNumbers() ?? []).map((row) => row ?? 0),
        ),
        columns: await page.getByTestId("batch-preview").locator("th").allInnerTexts(),
      };
    },
  };
}
