import { type Page } from "@playwright/test";
import { type DownloadLibrary, type FlyerEditorDriver } from "../flyer-editor.ts";

const SHEET_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const EXCEL_INPUT = "#excel-input";
const SHEET_TIMEOUT_MS = 8_000;
const SHEET_SETTLE_MS = 200;

/** Where the page keeps each library, by the names it uses for them. */
const LIBRARY: Readonly<Record<DownloadLibrary, { key: string; global: string }>> = {
  pdf: { key: "jspdf", global: "jspdf" },
  excel: { key: "xlsx", global: "XLSX" },
  zip: { key: "jszip", global: "JSZip" },
};

async function uploadExcelSheet(page: Page, lines: string[][]) {
  const encoded = await page.evaluate(async (rows) => {
    await _lib("xlsx");
    excelData = [];
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Hoja1");
    return XLSX.write(book, { type: "base64", bookType: "xlsx" });
  }, lines);
  await page.setInputFiles(EXCEL_INPUT, {
    name: "t.xlsx",
    mimeType: SHEET_MIME,
    buffer: Buffer.from(encoded, "base64"),
  });
  await page.waitForFunction(() => excelData.length > 0, null, { timeout: SHEET_TIMEOUT_MS });
  await page.waitForTimeout(SHEET_SETTLE_MS);
  return page.evaluate(() => {
    const summary = document.querySelector<HTMLElement>("#val-sum");
    const classes = summary?.className ?? "";
    const severities = { err: "error", warn: "warning", ok: "ok" } as const;
    const found = (["err", "warn", "ok"] as const).find((name) => classes.includes(name));
    return {
      validation: summary?.innerText ?? "",
      severity: found ? severities[found] : ("unknown" as const),
      canGenerate: !document.querySelector<HTMLButtonElement>("#btn-gen")?.disabled,
      rowNumbers: excelData.map((row) => Number(Reflect.get(Object(row), "__fila"))),
      columns: Object.keys(Object(excelData[0])),
    };
  });
}

export function createFlyerDownloads(
  page: Page,
): Pick<
  FlyerEditorDriver,
  | "loadDownloadLibrary"
  | "forgetDownloadLibrary"
  | "downloadPdf"
  | "downloadPng"
  | "holdDownloadShortcut"
  | "downloadIsBusy"
  | "breakDrawing"
  | "repairDrawing"
  | "holdDownloadAtCategoryWarning"
  | "confirmCategoryWarning"
  | "reportFlyerNotArrived"
  | "clearLoadProblem"
  | "saveFlyerAsPdf"
  | "chooseExcelFile"
  | "excelFieldIsEmpty"
  | "uploadExcelSheet"
> {
  return {
    loadDownloadLibrary: async (library) => {
      await page.evaluate((key) => _lib(key), LIBRARY[library].key);
    },
    forgetDownloadLibrary: (library) =>
      page.evaluate(({ key, global }) => {
        const entry = _LIBS[key];
        if (entry) entry.src += `?t=${String(Date.now())}`;
        Reflect.set(window, global, undefined);
        _libP[key] = null;
      }, LIBRARY[library]),
    downloadPdf: (times = 1) =>
      page.evaluate((count) => {
        for (let press = 0; press < count; press += 1) dlPDF();
      }, times),
    downloadPng: () =>
      page.evaluate(() => {
        dlPNG();
      }),
    holdDownloadShortcut: () =>
      page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        for (const repeat of [false, true, true]) {
          document.dispatchEvent(
            new KeyboardEvent("keydown", {
              key: "Enter",
              ctrlKey: true,
              repeat,
              bubbles: true,
              cancelable: true,
            }),
          );
        }
      }),
    downloadIsBusy: () =>
      page.evaluate(() => _fgDlOcupado || Boolean(document.querySelector("#btn-dl-pdf.fg-busy"))),
    breakDrawing: () =>
      page.evaluate(() => {
        window.__fgRealDrawing = window.fullRes;
        window.fullRes = () => {
          throw new Error("falla simulada");
        };
      }),
    repairDrawing: () =>
      page.evaluate(() => {
        if (window.__fgRealDrawing) window.fullRes = window.__fgRealDrawing;
      }),
    holdDownloadAtCategoryWarning: () =>
      page.evaluate(() => {
        window.__fgRealCategoryCheck = window._padCheckRubro;
        window._padCheckRubro = (_flyer, _what, proceed) => {
          window.__fgCategoryProceed = proceed;
          return true;
        };
      }),
    confirmCategoryWarning: () =>
      page.evaluate(() => {
        if (window.__fgRealCategoryCheck) window._padCheckRubro = window.__fgRealCategoryCheck;
        window.__fgCategoryProceed?.();
      }),
    reportFlyerNotArrived: () =>
      page.evaluate(() => {
        _fgSinFlyerPoner({ opt: _optN(_fgOpt), motivo: "red" });
      }),
    clearLoadProblem: () =>
      page.evaluate(() => {
        _fgSinFlyerPoner(null);
      }),
    saveFlyerAsPdf: () =>
      page.evaluate(() => {
        savePDF(fullRes(getVals()), getVals(), true);
      }),
    chooseExcelFile: (file) => page.setInputFiles(EXCEL_INPUT, file),
    excelFieldIsEmpty: async () => (await page.locator(EXCEL_INPUT).inputValue()) === "",
    uploadExcelSheet: (lines) => uploadExcelSheet(page, lines),
  };
}
