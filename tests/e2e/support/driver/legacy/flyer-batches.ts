import { readFile } from "node:fs/promises";
import { type Page } from "@playwright/test";
import { type BatchCompany, type BatchRow, type FlyerEditorDriver } from "../flyer-editor.ts";
import {
  readCapturedZip,
  startCapturingZips,
  stopCapturingZips,
  toastText,
  waitForCapturedZip,
} from "./zip-capture.ts";

const BATCH_TIMEOUT_MS = 20_000;
const AFTER_BATCH_MS = 800;
const LATE_ZIP_MS = 1_500;
const SECOND_ZIP_TIMEOUT_MS = 15_000;
const BLOCKED_BATCH_MS = 1_500;
const HISTORY_NOTICE_MS = 300;
const MEMORY_RELEASE_MS = 2_500;
const LONG_WAIT_MS = 30_000;
const SHORT_WAIT_MS = 1_000;

/** Runs in the page: loads the lines as the reader does, row number out of the columns. */
function loadRows(rows: BatchRow[]): void {
  excelData = rows.map(({ cells, sheetRow }) => {
    const row = { ...cells };
    if (sheetRow !== undefined) {
      Object.defineProperty(row, "__fila", { value: sheetRow, enumerable: false });
    }
    return row;
  });
}

async function generateBatch(
  page: Page,
  { rows, failingCompany }: { rows?: BatchRow[]; failingCompany?: string } = {},
) {
  await startCapturingZips(page);
  if (rows) await page.evaluate(loadRows, rows);
  await page.evaluate((failing) => {
    const real = window.fullRes;
    window.__fgRealDrawing = real;
    window.__fgDrawn = [];
    window.fullRes = (values) => {
      window.__fgDrawn.push({
        company: values.empresa ?? "",
        officer: values.nombre ?? "",
        phone: values.celular ?? "",
        firstAmount: values.m1 ?? "",
        noCashback: Boolean(values.nocb),
      });
      if (values.empresa === failing) throw new Error("falla simulada");
      return real(values);
    };
    genAll();
  }, failingCompany);
  await waitForCapturedZip(page, BATCH_TIMEOUT_MS);
  await page.waitForTimeout(AFTER_BATCH_MS);
  const zip = await readCapturedZip(page);
  const screen = await page.evaluate(() => {
    if (window.__fgRealDrawing) window.fullRes = window.__fgRealDrawing;
    return {
      drawn: window.__fgDrawn,
      progress: document.querySelector("#prog-text")?.textContent ?? "",
      finalOption: _optN(_fgOpt),
      idle: !_fgEnTanda(),
    };
  });
  await stopCapturingZips(page);
  return { ...screen, files: zip.files, summary: zip.summary };
}

async function generateBatchTwiceInARow(page: Page, rows: BatchRow[]): Promise<number> {
  await startCapturingZips(page);
  await page.evaluate(loadRows, rows);
  await page.evaluate(() => {
    genAll();
    genAll();
  });
  await waitForCapturedZip(page, SECOND_ZIP_TIMEOUT_MS);
  await page.waitForTimeout(LATE_ZIP_MS);
  const { zips } = await readCapturedZip(page);
  await stopCapturingZips(page);
  return zips;
}

async function generateBatchAndInterfere(page: Page) {
  await startCapturingZips(page);
  const during = await page.evaluate(() => {
    const notice = document.querySelector("#toast-el, #toast");
    genAll();
    clearExcel();
    const clearNotice = notice?.textContent ?? "";
    const rowsAfterClear = excelData.length;
    fgOptElegir(_optN(_fgOpt));
    return { clearNotice, rowsAfterClear, switchNotice: notice?.textContent ?? "" };
  });
  await waitForCapturedZip(page, BATCH_TIMEOUT_MS);
  await page.waitForTimeout(AFTER_BATCH_MS);
  const { files } = await readCapturedZip(page);
  const idle = await page.evaluate(() => !_fgEnTanda());
  await stopCapturingZips(page);
  return { ...during, pdfs: files.filter((name) => name.endsWith(".pdf")).length, idle };
}

async function tryBatchWithoutFlyer(page: Page, rows: BatchRow[]) {
  await startCapturingZips(page);
  await page.evaluate(loadRows, rows);
  await page.evaluate(() => {
    _fgSinFlyerPoner({ opt: _optN(_fgOpt), motivo: "red" });
    genAll();
  });
  await page.waitForTimeout(BLOCKED_BATCH_MS);
  const { zips } = await readCapturedZip(page);
  const notice = await toastText(page);
  await page.evaluate(() => {
    _fgSinFlyerPoner(null);
  });
  await stopCapturingZips(page);
  return { zips, notice };
}

async function redownloadFromHistory(page: Page, option: number) {
  await page.evaluate((opt) => {
    const real = window.savePDF;
    window.__fgSaveAttempts = 0;
    Reflect.set(
      window,
      "savePDF",
      (canvas: HTMLCanvasElement, values: LegacyFlyerValues, again?: boolean) => {
        window.__fgSaveAttempts += 1;
        real(canvas, values, again);
      },
    );
    window.__fgRealSave = real;
    flyerHistory.unshift({
      v: getVals(),
      fn: "antiguo",
      thumb: "",
      hora: "1:00",
      ts: 1,
      ac: 0,
      opt,
    });
    fgRedlPDF(0);
  }, option);
  await page.waitForTimeout(HISTORY_NOTICE_MS);
  const saveAttempts = await page.evaluate(() => {
    Reflect.set(window, "savePDF", window.__fgRealSave);
    return window.__fgSaveAttempts;
  });
  return { notice: await toastText(page), saveAttempts };
}

async function downloadBatchTemplate(page: Page) {
  await page.evaluate(() => _lib("xlsx"));
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#tab-masivo .template-btn").first().click(),
  ]);
  const bytes = await readFile(await download.path());
  const head = await page.evaluate((encoded) => {
    const book = XLSX.read(encoded, { type: "base64" });
    const sheet = book.Sheets[book.SheetNames[0] ?? ""];
    return sheet
      ? (XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false })[0] ?? [])
      : [];
  }, bytes.toString("base64"));
  return { name: download.suggestedFilename(), head };
}

async function generateBatchToDisk(page: Page, rows: BatchRow[]) {
  await page.evaluate(() => Promise.all([_lib("jspdf"), _lib("jszip")]));
  await page.evaluate(loadRows, rows);
  await page.evaluate(
    ({ longWait, shortWait }) => {
      window.__fgAddresses = { made: 0, released: 0 };
      // The app gives the memory back a minute later; the test does not wait that long.
      const later = window.setTimeout.bind(window);
      Reflect.set(window, "setTimeout", (work: () => void, delay?: number) =>
        later(work, (delay ?? 0) >= longWait ? shortWait : delay),
      );
      const createObjectURL = URL.createObjectURL.bind(URL);
      const revokeObjectURL = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = (blob) => {
        if (window.__fgAddresses) window.__fgAddresses.made += 1;
        return createObjectURL(blob);
      };
      URL.revokeObjectURL = (address) => {
        if (window.__fgAddresses) window.__fgAddresses.released += 1;
        revokeObjectURL(address);
      };
    },
    { longWait: LONG_WAIT_MS, shortWait: SHORT_WAIT_MS },
  );
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.evaluate(() => {
      genAll();
    }),
  ]);
  await page.waitForTimeout(MEMORY_RELEASE_MS);
  const addresses = await page.evaluate(() => window.__fgAddresses ?? { made: 0, released: 0 });
  return {
    file: download.suggestedFilename(),
    addressesMade: addresses.made,
    addressesReleased: addresses.released,
  };
}

async function generateBatchWithBrokenZip(page: Page, rows: BatchRow[]) {
  await page.evaluate(() => Promise.all([_lib("jspdf"), _lib("jszip")]));
  await page.evaluate(loadRows, rows);
  await page.evaluate(() => {
    JSZip.prototype.generateAsync = () => Promise.reject(new Error("falla simulada"));
    genAll();
  });
  await page.waitForFunction(() => !_fgEnTanda(), null, { timeout: BATCH_TIMEOUT_MS });
  await page.waitForTimeout(HISTORY_NOTICE_MS);
  return {
    notice: await toastText(page),
    canGenerate: await page.evaluate(
      () => !document.querySelector<HTMLButtonElement>("#btn-gen")?.disabled,
    ),
  };
}

async function batchQuestion(page: Page, companies: BatchCompany[]) {
  await page.evaluate((rows) => {
    _pgGenerarRows(
      rows.map(({ name, cashback, option }) => ({
        empresa: name,
        cuits: [],
        config: cashback,
        asesores: [],
        rubro: option === undefined ? {} : { opcion: option },
      })),
      "pdf",
      { prog: "x1", fill: "x2", txt: "x3", btn: "x4" },
      "Prueba",
    );
  }, companies);
  const question = page.locator("#fg-cf-ov");
  await question.waitFor({ timeout: BATCH_TIMEOUT_MS });
  const text = (await question.innerText()).replace(/\s+/g, " ");
  await page.locator("#fg-cf-no").click();
  return text;
}

export function createFlyerBatches(
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
  | "redownloadFromHistory"
> {
  return {
    downloadBatchTemplate: () => downloadBatchTemplate(page),
    generateBatchToDisk: (rows) => generateBatchToDisk(page, rows),
    generateBatchWithBrokenZip: (rows) => generateBatchWithBrokenZip(page, rows),
    batchQuestion: (companies) => batchQuestion(page, companies),
    generateBatch: (options) => generateBatch(page, options),
    generateBatchTwiceInARow: (rows) => generateBatchTwiceInARow(page, rows),
    generateBatchAndInterfere: () => generateBatchAndInterfere(page),
    pressGenerateBatch: async () => {
      await startCapturingZips(page);
      await page.locator("#btn-gen").click();
    },
    pressClearBatch: async () => {
      await page.locator("#excel-info").getByRole("button", { name: "Limpiar" }).click();
      const rowsLeft = await page.evaluate(() => excelData.length);
      return { notice: await toastText(page), rowsLeft };
    },
    batchIsRunning: () => page.evaluate(() => _fgEnTanda()),
    waitForBatchZip: async (timeout) => {
      const came = await waitForCapturedZip(page, timeout).then(
        () => true,
        () => false,
      );
      const { files } = await readCapturedZip(page);
      await stopCapturingZips(page);
      return came ? files : [];
    },
    tryBatchWithoutFlyer: (rows) => tryBatchWithoutFlyer(page, rows),
    redownloadFromHistory: (option) => redownloadFromHistory(page, option),
  };
}
