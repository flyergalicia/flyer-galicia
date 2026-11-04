// Replaces pruebas/t73_descarga_confiable.cjs.
import { type Page } from "@playwright/test";
import { expect, test } from "../../support/test.ts";

const DOWNLOAD_SETTLE_MS = 1_800;
const AFTER_DOWNLOAD_MS = 1_500;
const SHEET_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PDF_LIBRARY = "**/*jspdf*";
const EXCEL_LIBRARY = "**/*xlsx*";
const ZIP_LIBRARY = "**/*jszip*";
const PDF_DONE = "PDF descargado!";
const BATCH = [
  { cells: { empresa: "A", config: "BAU", asesor1_nombre: "X" } },
  { cells: { empresa: "B", config: "BAU", asesor1_nombre: "Y" } },
];

const LIBRARY_DELAY_MS = 1_500;
const BATCH_ZIP_MS = 30_000;
const SHEET = [
  ["empresa", "nombre", "config"],
  ["ACME SA", "Ana Perez", "BAU"],
  ["BETA SRL", "Beto Gomez", "BAU"],
];
const isPdf = (name: string) => name.endsWith(".pdf");

const delay = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function countDownloads(page: Page) {
  let count = 0;
  page.on("download", () => {
    count += 1;
  });
  return {
    get count() {
      return count;
    },
    reset() {
      count = 0;
    },
  };
}

function countUsageLogs(page: Page) {
  let count = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("flyer_logs")) count += 1;
  });
  return () => count;
}

async function slowDown(page: Page, url: string, ms: number): Promise<void> {
  await page.route(url, async (route) => {
    await delay(ms);
    await route.fallback();
  });
}

test.describe("downloading a flyer", () => {
  test("says it was downloaded only when the file came out", async ({ openApp }) => {
    const app = await openApp();
    const { flyerEditor, page } = app;
    const downloads = countDownloads(page);
    const usageLogs = countUsageLogs(page);
    await flyerEditor.fillCompanyName("ACME SA");
    await flyerEditor.fillOfficerName("Ana Perez");
    await flyerEditor.loadDownloadLibrary("pdf");

    // 1) Double click: one file
    await flyerEditor.downloadPdf(2);
    await page.waitForTimeout(DOWNLOAD_SETTLE_MS);
    expect.soft(downloads.count, "double click: one single file").toBe(1);
    expect.soft(usageLogs(), "and one single entry in the usage log").toBe(1);
    expect
      .soft(await flyerEditor.latestNotice(), "the notice comes when it came out")
      .toBe(PDF_DONE);
    expect.soft(await flyerEditor.downloadIsBusy(), "the button is free again").toBe(false);

    // 2) Ctrl+Enter held: the first one downloads, the repetitions do not
    downloads.reset();
    await flyerEditor.holdDownloadShortcut();
    await page.waitForTimeout(DOWNLOAD_SETTLE_MS);
    expect.soft(downloads.count, "Ctrl+Enter held: repetitions do not count").toBe(1);

    // 3) An error while drawing: a clear message and the button is not stuck
    downloads.reset();
    await flyerEditor.breakDrawing();
    await flyerEditor.downloadPdf();
    await page.waitForTimeout(600);
    const failure = await flyerEditor.latestNotice();
    expect
      .soft(failure, 'an error says "No se pudo generar el PDF"')
      .toMatch(/No se pudo generar el PDF/);
    expect.soft(failure, 'and does not say "descargado"').not.toMatch(/descargado/);
    expect.soft(downloads.count, "and downloads nothing").toBe(0);
    expect
      .soft(await flyerEditor.downloadIsBusy(), 'the button is not stuck on "Un momento…"')
      .toBe(false);
    await flyerEditor.repairDrawing();
    await flyerEditor.downloadPdf();
    await page.waitForTimeout(AFTER_DOWNLOAD_MS);
    expect.soft(downloads.count, "once repaired, downloading works again").toBe(1);

    // 4) The category warning: it does not say "descargado" until confirmed
    downloads.reset();
    await flyerEditor.holdDownloadAtCategoryWarning();
    await flyerEditor.downloadPdf();
    await page.waitForTimeout(700);
    expect
      .soft(await flyerEditor.latestNotice(), 'with the warning open it does not say "descargado"')
      .not.toMatch(/descargado/);
    expect.soft(downloads.count, "and downloads nothing").toBe(0);
    await flyerEditor.confirmCategoryWarning();
    await page.waitForTimeout(AFTER_DOWNLOAD_MS);
    expect.soft(downloads.count, "confirming the warning downloads").toBe(1);
    expect.soft(await flyerEditor.latestNotice(), 'and only then says "descargado"').toBe(PDF_DONE);

    // 5) PNG
    downloads.reset();
    await flyerEditor.downloadPng();
    await page.waitForTimeout(AFTER_DOWNLOAD_MS);
    expect.soft(downloads.count, "Descargar imagen also downloads").toBe(1);
    expect.soft(await flyerEditor.latestNotice(), "and warns at the end").toBe("PNG descargado!");

    // 6) The PDF library still loading: no false "descargado"
    downloads.reset();
    await slowDown(page, PDF_LIBRARY, DOWNLOAD_SETTLE_MS);
    await flyerEditor.forgetDownloadLibrary("pdf");
    await flyerEditor.downloadPdf();
    await page.waitForTimeout(700);
    expect
      .soft(
        await flyerEditor.latestNotice(),
        'with the library loading it does not say "descargado"',
      )
      .not.toMatch(/descargado/);
    expect.soft(downloads.count, "and has downloaded nothing yet").toBe(0);
    await page.waitForEvent("download", { timeout: 15_000 }).catch(() => null);
    await page.waitForTimeout(500);
    expect.soft(downloads.count, "once loaded, it downloads").toBe(1);
    expect.soft(await flyerEditor.latestNotice(), "and only then warns").toBe(PDF_DONE);
    await page.unroute(PDF_LIBRARY);

    // 7) The Excel library does not load: a clear message, and the same file can be chosen again
    await page.route(EXCEL_LIBRARY, (route) => route.abort("connectionreset"));
    await flyerEditor.forgetDownloadLibrary("excel");
    await flyerEditor.chooseExcelFile({
      name: "a.xlsx",
      mimeType: SHEET_MIME,
      buffer: Buffer.from("no importa"),
    });
    await page.waitForTimeout(1_200);
    const excelNotice = await flyerEditor.latestNotice();
    expect.soft(excelNotice, "a clear message").toMatch(/No se pudo preparar el Excel/);
    expect.soft(excelNotice, "with no technical names").not.toMatch(/xlsx|jspdf|jszip/i);
    expect
      .soft(await flyerEditor.excelFieldIsEmpty(), "the same file can be chosen again")
      .toBe(true);
    await page.unroute(EXCEL_LIBRARY);

    // 8) "Generar ZIP" twice while the ZIP library loads: one single batch
    await slowDown(page, ZIP_LIBRARY, AFTER_DOWNLOAD_MS);
    await flyerEditor.forgetDownloadLibrary("zip");
    expect
      .soft(
        await flyerEditor.generateBatchTwiceInARow(BATCH),
        "double click on Generar ZIP: one ZIP",
      )
      .toBe(1);
    expect.soft(app.pageErrors(), "no JavaScript errors").toEqual([]);
  });

  test("Limpiar while the libraries come down does not leave the batch empty", async ({
    openApp,
  }) => {
    const app = await openApp();
    const { flyerEditor, page } = app;
    await flyerEditor.loadDownloadLibrary("pdf");
    await flyerEditor.forgetDownloadLibrary("zip");
    await flyerEditor.chooseEditorTab("Masivo");
    await flyerEditor.uploadExcelSheet(SHEET);
    await slowDown(page, ZIP_LIBRARY, LIBRARY_DELAY_MS);

    await flyerEditor.pressGenerateBatch();
    expect.soft(await flyerEditor.batchIsRunning(), "waiting for it counts as running").toBe(true);
    const cleared = await flyerEditor.pressClearBatch();
    expect.soft(cleared.notice, "Limpiar waits, as during the batch").toMatch(/Esper/);
    expect.soft(cleared.rowsLeft, "and the lines stay").toBe(SHEET.length - 1);

    const files = await flyerEditor.waitForBatchZip(BATCH_ZIP_MS);
    expect.soft(files.filter(isPdf), "the batch comes out with its lines").toHaveLength(2);
    await expect.poll(() => flyerEditor.batchIsRunning(), "and everything is free").toBe(false);
    const after = await flyerEditor.pressClearBatch();
    expect.soft(after.rowsLeft, "Limpiar works again").toBe(0);
    expect.soft(app.pageErrors()).toEqual([]);
  });

  test("a library that does not arrive leaves the batch free to try again", async ({ openApp }) => {
    const app = await openApp();
    const { flyerEditor, page } = app;
    await flyerEditor.loadDownloadLibrary("pdf");
    await flyerEditor.forgetDownloadLibrary("zip");
    await flyerEditor.chooseEditorTab("Masivo");
    await flyerEditor.uploadExcelSheet(SHEET);
    await page.route(ZIP_LIBRARY, (route) => route.abort());

    await flyerEditor.pressGenerateBatch();
    await expect
      .poll(() => flyerEditor.latestNotice(), "it says so")
      .toMatch(/No se pudo preparar el ZIP/);
    expect.soft(await flyerEditor.batchIsRunning(), "nothing is running").toBe(false);
    await expect
      .soft(page.getByRole("button", { name: "Generar ZIP" }), "the button is not stuck")
      .toBeEnabled();

    await page.unroute(ZIP_LIBRARY);
    await flyerEditor.pressGenerateBatch();
    const files = await flyerEditor.waitForBatchZip(BATCH_ZIP_MS);
    expect.soft(files.filter(isPdf), "a second press makes the batch").toHaveLength(2);
    await expect.poll(() => flyerEditor.batchIsRunning()).toBe(false);
    expect.soft((await flyerEditor.pressClearBatch()).rowsLeft, "Limpiar works").toBe(0);
    expect.soft(app.pageErrors()).toEqual([]);
  });

  test("with the flyer not loaded it stops, explains why and works again after", async ({
    openApp,
  }) => {
    const { flyerEditor, page } = await openApp();
    const downloads = countDownloads(page);
    await flyerEditor.loadDownloadLibrary("pdf");

    await flyerEditor.reportFlyerNotArrived();
    await flyerEditor.downloadPdf();
    await flyerEditor.downloadPng();
    await page.waitForTimeout(1_200);
    expect.soft(downloads.count, "flyer not loaded: nothing downloads").toBe(0);
    expect
      .soft(await flyerEditor.latestNotice(), "and it explains why")
      .toMatch(/No se pudo cargar el flyer/);

    await flyerEditor.clearLoadProblem();
    await flyerEditor.saveFlyerAsPdf();
    // The library of the PDF may still be downloading: it can take up to eight seconds.
    for (let wait = 0; wait < 40 && downloads.count < 1; wait += 1) {
      await page.waitForTimeout(200);
    }
    expect.soft(downloads.count, "without the notice it downloads again").toBe(1);
  });
});
