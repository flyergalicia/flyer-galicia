import { type Page } from "@playwright/test";
import {
  type BandHeightComparison,
  type BulkOutcome,
  type BulkRow,
  type CompanyNoticeState,
  type CropStatus,
  type FlyerSectionsDriver,
  type FlyerTab,
  type InsertStatus,
  type PdfImageReading,
  type PdfProbes,
  type SavedDrafts,
} from "../flyer-sections.ts";

const TAB_BAR = "#fg-optbar";
const OPEN_TAB = `${TAB_BAR} .fgp`;
const FLYER_TAB = `${TAB_BAR} .fgo`;
const SHOWN_TIMEOUT_MS = 15_000;
// An outdated answer takes a moment to arrive: this is how long a race gets to show itself.
const RACE_SETTLE_MS = 1500;
// Notices about a company appear right after it arrives, or they never do.
const COMPANY_SETTLE_MS = 600;
const SHORTCUT_SETTLE_MS = 200;
const UNDO_SETTLE_MS = 400;
const DOWNLOAD_TIMEOUT_MS = 20_000;
const SECOND_DOWNLOAD_WINDOW_MS = 500;
const DRAG_STEPS = 4;
const PDF_CONVERSION_TIMEOUT_MS = 15_000;

function base64(bytes: Buffer): string {
  return bytes.toString("base64");
}

async function dragVertically(
  page: Page,
  { x, fromY, toY }: { x: number; fromY: number; toY: number },
): Promise<void> {
  await page.mouse.move(x, fromY);
  await page.mouse.down();
  await page.mouse.move(x, (fromY + toY) / 2, { steps: DRAG_STEPS });
  await page.mouse.move(x, toY, { steps: DRAG_STEPS });
  await page.mouse.up();
}

async function dragCropBand(page: Page, fromY: number, toY: number): Promise<void> {
  const points = await page.evaluate(
    ({ top, bottom }) => {
      const preview = document.querySelector(".prev");
      if (!preview) throw new Error("The preview is not on screen");
      const before = cv.getBoundingClientRect();
      const scaleBefore = (before.width / cv.width) * SC;
      const previewBox = preview.getBoundingClientRect();
      preview.scrollTop +=
        before.top + ((top + bottom) / 2) * scaleBefore - (previewBox.top + previewBox.height / 2);
      const box = cv.getBoundingClientRect();
      const scale = (box.width / cv.width) * SC;
      return {
        x: box.left + box.width / 2,
        fromY: box.top + top * scale,
        toY: box.top + bottom * scale,
      };
    },
    { top: fromY, bottom: toY },
  );
  await dragVertically(page, points);
  await page.locator("#fg-rec-conf").waitFor({ timeout: SHOWN_TIMEOUT_MS });
}

function readCropStatus(page: Page): Promise<CropStatus> {
  return page.evaluate(() => ({
    active: _fgRecActivo(),
    cuts: (_fgRec?.cortes ?? []).map((cut) => ({
      y: cut.y,
      height: cut.h,
      inserted: cut.ins
        ? {
            source: cut.ins.u,
            y: cut.ins.sy,
            height: cut.ins.sh,
            width: cut.ins.sw,
            padding: cut.ins.pad,
          }
        : null,
    })),
    artworkHeight: baseImg?.height ?? 0,
    amountsHidden: _fgSinImportes(),
    amountsCardHidden: Boolean(
      document.getElementById("d1")?.closest(".fg-card")?.classList.contains("fg-sin-importes"),
    ),
  }));
}

function downloadBandSample(page: Page, y: number, height: number): Promise<number[]> {
  return page.evaluate(
    ({ top, rows }) => {
      const full = fullRes(getVals());
      const band = document.createElement("canvas");
      band.width = full.width;
      band.height = rows;
      const graphics = band.getContext("2d");
      if (!graphics) throw new Error("No canvas context");
      graphics.drawImage(full, 0, top, full.width, rows, 0, 0, full.width, rows);
      const { data } = graphics.getImageData(0, 0, full.width, rows);
      return Array.from(data.filter((_, index) => index % 16 === 0));
    },
    { top: y, rows: height },
  );
}

function seamDifference(page: Page): Promise<number> {
  return page.evaluate(() => {
    const image = baseImg;
    const cut = _fgRec?.cortes[0];
    if (!image || !cut) throw new Error("There is no cut");
    const rows = _fgLgPixeles(0, cut.y - 1, image.width, 2);
    let total = 0;
    let samples = 0;
    for (let x = 0; x < image.width; x += 4) {
      const above = x * 4;
      const below = (image.width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        total += Math.abs((rows[above + channel] ?? 0) - (rows[below + channel] ?? 0));
      }
      samples += 1;
    }
    return total / samples;
  });
}

function imageSize(page: Page, bytes: Buffer): Promise<{ width: number; height: number }> {
  return page.evaluate(async (content) => {
    const image = new Image();
    await new Promise((resolve) => {
      image.addEventListener("load", resolve);
      image.src = `data:image/jpeg;base64,${content}`;
    });
    return { width: image.naturalWidth, height: image.naturalHeight };
  }, base64(bytes));
}

async function downloadPdf(page: Page): Promise<string[]> {
  const files: string[] = [];
  const firstDownload = page
    .waitForEvent("download", { timeout: DOWNLOAD_TIMEOUT_MS })
    .catch(() => null);
  page.on("download", (download) => {
    files.push(download.suggestedFilename());
  });
  await page.locator("#btn-dl-pdf").click();
  await firstDownload;
  await page.waitForTimeout(SECOND_DOWNLOAD_WINDOW_MS);
  return files;
}

function readTabs(page: Page): Promise<FlyerTab[]> {
  return page.locator(`${FLYER_TAB}, ${OPEN_TAB}`).evaluateAll((tabs) =>
    tabs.map((tab) => ({
      label: (tab.textContent ?? "").replace("×", "").trim(),
      active: tab.classList.contains("on"),
      isFlyer: tab.classList.contains("fgo"),
      option: tab.classList.contains("fgo") ? Number(tab.getAttribute("data-o")) : null,
    })),
  );
}

async function selectFlyerTab(page: Page, option?: number): Promise<void> {
  const tab =
    option === undefined
      ? page.locator(FLYER_TAB).first()
      : page.locator(`${FLYER_TAB}[data-o="${String(option)}"]`);
  const shown = Number(await tab.getAttribute("data-o"));
  await tab.click();
  await page.waitForFunction(
    (n) =>
      !_fgProtoAct &&
      _optN(_fgOpt) === n &&
      !_fgRecActivo() &&
      Boolean(baseImg) &&
      baseImg === _fgOptCache[n]?.img,
    shown,
    { timeout: SHOWN_TIMEOUT_MS },
  );
}

function waitForOpenWork(page: Page, id: string): Promise<void> {
  return page
    .waitForFunction((openId) => _fgProtoAct === openId && !_fgBorr.ocupado, id, {
      timeout: SHOWN_TIMEOUT_MS,
    })
    .then(() => undefined);
}

async function selectOpenTab(page: Page, index: number): Promise<void> {
  const tab = page.locator(OPEN_TAB).nth(index);
  const id = await tab.getAttribute("data-p");
  if (!id) throw new Error("That tab has no design");
  await tab.click();
  await waitForOpenWork(page, id);
}

async function newDraft(page: Page): Promise<void> {
  const previous = await page.evaluate(() => _fgProtoAct);
  await page.locator("#fg-lg-nbor").click();
  await page.waitForFunction(
    (before) => Boolean(_fgProtoAct) && _fgProtoAct !== before && !_fgBorr.ocupado,
    previous,
    { timeout: SHOWN_TIMEOUT_MS },
  );
}

function readOpenWork(page: Page) {
  return page.evaluate(() => {
    const work = _fgProtoActivo();
    return work
      ? { name: work.nombre, isDraft: Boolean(work.temp), changes: _fgLgActivos().length }
      : null;
  });
}

function readOpenWorkDetails(page: Page) {
  return page.evaluate(() => ({
    openId: _fgProtoAct,
    texts: _fgLgActivos().map((change) => change.texto ?? ""),
    downloadTexts: (getVals().logos ?? []).map((logo) =>
      String(Reflect.get(Object(logo), "texto")),
    ),
    activeTabs: [...document.querySelectorAll("#fg-optbar .on")].map((tab) =>
      (tab.textContent ?? "").replace("×", "").trim(),
    ),
  }));
}

function readCompanyNotices(page: Page): Promise<CompanyNoticeState> {
  return page.evaluate(() => ({
    confirmation: document.getElementById("fg-cf-ov")?.textContent ?? null,
    updateNotice: document.getElementById("pad-upd")?.textContent ?? null,
  }));
}

function turnOffAmounts(page: Page): Promise<void> {
  return page.evaluate(() => {
    const clone = structuredClone(window.FLYER_CFG);
    clone.montos = { ..._fgCfg().montos, off: true };
    clone.cashback = { ..._fgCfg().cashback, off: true };
    window.FLYER_CFG = clone;
  });
}

function generateBulk(page: Page, rows: BulkRow[]): Promise<BulkOutcome> {
  return page.evaluate(async (data) => {
    excelData = data;
    const generated: BulkOutcome["generated"] = [];
    const realFullRes = fullRes;
    const realSaveBlob = _fgBajarBlob;
    const zip: { name: string | null } = { name: null };
    Reflect.set(window, "fullRes", (values: LegacyFlyerValues) => {
      generated.push({
        company: values.empresa ?? "",
        option: _optN(_fgOpt),
        hasAmounts: !_fgSinImportes(),
      });
      return realFullRes(values);
    });
    Reflect.set(window, "_fgBajarBlob", (_blob: Blob, name: string) => {
      zip.name = name;
    });
    genAll();
    for (let wait = 0; wait < 80 && !zip.name; wait += 1) {
      await new Promise((resolve) => {
        setTimeout(resolve, 250);
      });
    }
    Reflect.set(window, "fullRes", realFullRes);
    Reflect.set(window, "_fgBajarBlob", realSaveBlob);
    await new Promise((resolve) => {
      setTimeout(resolve, 1500);
    });
    return { generated, zipName: zip.name, finalOption: _optN(_fgOpt) };
  }, rows);
}

function readSavedDrafts(page: Page): Promise<SavedDrafts> {
  return page.evaluate(() => {
    const key = _fgBorrClave();
    const value = localStorage.getItem(key);
    const parsed: { lista?: LegacyPendingDraft[] } = value ? JSON.parse(value) : {};
    return {
      key,
      value,
      drafts: (parsed.lista ?? []).map((draft) => ({
        name: draft.nombre,
        cuts: draft.recortes.length,
        changes: draft.cambios.length,
      })),
    };
  });
}

function blockBrowserStorage(page: Page): Promise<void> {
  return page.evaluate(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("blocked");
      },
    });
  });
}

function redownloadHeight(page: Page): Promise<number> {
  return page.evaluate(() => {
    let height = 0;
    const realSave = savePDF;
    Reflect.set(window, "savePDF", (canvas: HTMLCanvasElement) => {
      height = canvas.height;
    });
    fgRedlPDF(0);
    Reflect.set(window, "savePDF", realSave);
    return height;
  });
}

async function openInsertPicker(page: Page): Promise<void> {
  await page.locator("#fg-lg-ins").click();
  await page.locator("#fg-ins-hoja img").waitFor({ timeout: SHOWN_TIMEOUT_MS });
  await page.waitForFunction(
    () => {
      const image = document.querySelector<HTMLImageElement>("#fg-ins-hoja img");
      return Boolean(image?.complete) && (image?.naturalHeight ?? 0) > 0;
    },
    null,
    { timeout: SHOWN_TIMEOUT_MS },
  );
}

async function markSectionToCopy(page: Page, fromY: number, toY: number): Promise<void> {
  const points = await page.evaluate(
    ({ top, bottom }) => {
      const sheet = document.getElementById("fg-ins-hoja");
      const image = sheet?.querySelector("img");
      const view = document.getElementById("fg-ins-vista");
      if (!sheet || !image || !view) throw new Error("The insert picker is not on screen");
      view.scrollTop = (top - 200) * (sheet.getBoundingClientRect().height / image.naturalHeight);
      const box = sheet.getBoundingClientRect();
      const scale = box.height / image.naturalHeight;
      return {
        x: box.left + box.width / 2,
        fromY: box.top + top * scale,
        toY: box.top + bottom * scale,
      };
    },
    { top: fromY, bottom: toY },
  );
  await dragVertically(page, points);
}

function readInsertStatus(page: Page): Promise<InsertStatus> {
  return page.evaluate(() => {
    const { sec } = _fgIns;
    return {
      placing: _fgIns.modo,
      section: sec ? { y: sec.sy, height: sec.sh, width: sec.sw } : null,
      pickerOpen: Boolean(document.getElementById("fg-ins-ov")),
      buttonLabel: document.getElementById("fg-lg-ins")?.textContent ?? "",
      lineOnPage: Boolean(document.getElementById("fg-ins-linea")),
    };
  });
}

function copiedSectionFitsItsBlock(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const { sec } = _fgIns;
    const image = sec ? _fgIns.imgs[sec.u] : undefined;
    if (!sec || !image) return false;
    const rows = _fgInsFilas(image);
    const blank = (row: number) => (rows[row] ?? 0) < 2;
    const bottom = sec.sy + sec.sh;
    return blank(sec.sy - 1) && !blank(sec.sy) && !blank(bottom - 1) && blank(bottom);
  });
}

function scrollToFlyerHeight(page: Page, y: number): Promise<{ x: number; y: number }> {
  return page.evaluate((height) => {
    const preview = document.querySelector(".prev");
    if (!preview) throw new Error("The preview is not on screen");
    const before = cv.getBoundingClientRect();
    const scaleBefore = (before.width / cv.width) * SC;
    const previewBox = preview.getBoundingClientRect();
    preview.scrollTop +=
      before.top + height * scaleBefore - (previewBox.top + previewBox.height / 2);
    const box = cv.getBoundingClientRect();
    const scale = (box.width / cv.width) * SC;
    return { x: box.left + box.width / 2, y: box.top + height * scale };
  }, y);
}

function spaceAroundFirstInsertion(page: Page): Promise<{ above: number; below: number }> {
  return page.evaluate(() => {
    const cut = _fgRec?.cortes[0];
    const image = baseImg;
    if (!cut?.ins || !image) throw new Error("There is no inserted section");
    const rows = _fgInsFilas(image);
    const blank = (row: number) => (rows[row] ?? 0) < 2;
    const { y, h } = cut;
    let spaceTop = y;
    while (spaceTop > 0 && blank(spaceTop - 1)) spaceTop -= 1;
    let lastInk = y + h - 1;
    while (lastInk > y && blank(lastInk)) lastInk -= 1;
    let firstInk = y + cut.ins.pad;
    while (blank(firstInk)) firstInk += 1;
    let inkBelow = y + h;
    while (blank(inkBelow)) inkBelow += 1;
    return { above: firstInk - spaceTop, below: inkBelow - lastInk - 1 };
  });
}

function sourceSectionSample(page: Page, y: number, height: number): Promise<number[]> {
  return page.evaluate(
    ({ top, rows }) => {
      const source = _fgRec?.cortes[0]?.ins?.u;
      const image = source ? _fgIns.imgs[source] : undefined;
      if (!image) throw new Error("The source of the section is not in memory");
      const band = document.createElement("canvas");
      band.width = image.naturalWidth;
      band.height = rows;
      const graphics = band.getContext("2d");
      if (!graphics) throw new Error("No canvas context");
      graphics.drawImage(image, 0, top, band.width, rows, 0, 0, band.width, rows);
      const { data } = graphics.getImageData(0, 0, band.width, rows);
      return Array.from(data.filter((_, index) => index % 16 === 0));
    },
    { top: y, rows: height },
  );
}

function convertPdf(page: Page, pdf: Buffer, probes: PdfProbes): Promise<PdfImageReading | null> {
  return page.evaluate(
    async ({ content, wanted, timeoutMs }) => {
      const bytes = Uint8Array.from(atob(content), (char) => char.charCodeAt(0));
      const file = new File([bytes], "muestra.pdf", { type: "application/pdf" });
      const canvas = await new Promise<HTMLCanvasElement | null>((resolve) => {
        const timer = setTimeout(() => {
          resolve(null);
        }, timeoutMs);
        _rasterizeFlyer(file, (_blob, converted) => {
          clearTimeout(timer);
          resolve(converted);
        });
      });
      const graphics = canvas?.getContext("2d");
      if (!canvas || !graphics) return null;
      const colors: PdfImageReading["colors"] = {};
      for (const [name, { x, y }] of Object.entries(wanted.points)) {
        const [red = 0, green = 0, blue = 0] = graphics.getImageData(x, y, 1, 1).data;
        colors[name] = [red, green, blue];
      }
      const { x, y, width, height } = wanted.inkRegion;
      const ink = graphics.getImageData(x, y, width, height).data;
      let darkPixels = 0;
      for (let index = 0; index < ink.length; index += 4) {
        if ((ink[index] ?? 255) < 80) darkPixels += 1;
      }
      return { width: canvas.width, height: canvas.height, colors, darkPixels };
    },
    { content: base64(pdf), wanted: probes, timeoutMs: PDF_CONVERSION_TIMEOUT_MS },
  );
}

async function tryConvertPdf(page: Page, pdf: Buffer, waitMs: number): Promise<boolean> {
  await page.evaluate((content) => {
    const bytes = Uint8Array.from(atob(content), (char) => char.charCodeAt(0));
    const file = new File([bytes], "m.pdf", { type: "application/pdf" });
    window.__pdfConverted = false;
    _rasterizeFlyer(file, () => {
      window.__pdfConverted = true;
    });
  }, base64(pdf));
  await page.waitForTimeout(waitMs);
  return page.evaluate(() => Boolean(window.__pdfConverted));
}

function compareBandHeights(
  page: Page,
  { pdf, name, heights }: { pdf: Buffer; name: string; heights: [number, number] },
): Promise<BandHeightComparison> {
  return page.evaluate(
    async ({ content, fileName, bands }) => {
      const bytes = Uint8Array.from(atob(content), (char) => char.charCodeAt(0));
      const file = new File([bytes], fileName, { type: "application/pdf" });
      const convert = async (bandHeight: number) => {
        window._FG_BAND_H = bandHeight;
        const start = performance.now();
        const canvas = await new Promise<HTMLCanvasElement | null>((resolve) => {
          _rasterizeFlyer(file, (_blob, converted) => {
            resolve(converted);
          });
        });
        return { canvas, milliseconds: Math.round(performance.now() - start) };
      };
      const first = await convert(bands[0]);
      const second = await convert(bands[1]);
      const graphicsA = first.canvas?.getContext("2d");
      const graphicsB = second.canvas?.getContext("2d");
      if (!first.canvas || !second.canvas || !graphicsA || !graphicsB) {
        return {
          failed: true,
          heightA: 0,
          heightB: 0,
          millisecondsA: 0,
          millisecondsB: 0,
          meanDifference: 0,
          differentRows: 0,
        };
      }
      const width = first.canvas.width;
      const height = Math.min(first.canvas.height, second.canvas.height);
      const a = graphicsA.getImageData(0, 0, width, height).data;
      const b = graphicsB.getImageData(0, 0, width, height).data;
      let total = 0;
      let samples = 0;
      let differentRows = 0;
      for (let y = 0; y < height; y += 2) {
        let row = 0;
        for (let x = 0; x < width; x += 4) {
          const index = (y * width + x) * 4;
          for (let channel = 0; channel < 3; channel += 1) {
            row += Math.abs((a[index + channel] ?? 0) - (b[index + channel] ?? 0));
          }
          samples += 1;
        }
        total += row;
        if (row / (width / 4) > 30) differentRows += 1;
      }
      return {
        failed: false,
        heightA: first.canvas.height,
        heightB: second.canvas.height,
        millisecondsA: first.milliseconds,
        millisecondsB: second.milliseconds,
        meanDifference: Number((total / samples).toFixed(2)),
        differentRows,
      };
    },
    { content: base64(pdf), fileName: name, bands: heights },
  );
}

function cropDriver(page: Page) {
  return {
    toggleCropping: () => page.locator("#fg-lg-rec").click(),
    isMarkingCrop: () => page.evaluate(() => _fgRecM.modo),
    cropButtonLabel: async () => (await page.locator("#fg-lg-rec").textContent()) ?? "",
    dragCropBand: (fromY: number, toY: number) => dragCropBand(page, fromY, toY),
    confirmCrop: () => page.locator("#fg-rec-ok").click(),
    removeBand: (y: number, height: number) =>
      page.evaluate(
        ({ top, rows }) => {
          fgRecAplicar(top, rows);
        },
        { top: y, rows: height },
      ),
    cropStatus: () => readCropStatus(page),
    cropSign: async () => {
      const sign = page.locator("#fg-rec-chip");
      return (await sign.isVisible()) ? await sign.textContent() : null;
    },
    undoCrop: () => page.locator("#fg-rec-chip .fg-rec-volver").click(),
    dropCrop: () =>
      page.evaluate(() => {
        fgRecQuitar();
      }),
    reenterCurrentOption: () =>
      page.evaluate(() => {
        _fgApplyOption(_fgOptCache[_optN(_fgOpt)]);
      }),
    companyNamePlacement: () =>
      page.evaluate(() => {
        const { empresa } = _fgCfg();
        return { centerY: empresa.yc, off: Boolean(empresa.off) };
      }),
    legalWithAmounts: (template: string) =>
      page.evaluate((text) => _fgLegalConValores(text, getVals()), template),
    seamDifference: () => seamDifference(page),
    downloadBandSample: (y: number, height: number) => downloadBandSample(page, y, height),
    downloadHeight: () => page.evaluate(() => fullRes(getVals()).height),
    imageSize: (bytes: Buffer) => imageSize(page, bytes),
  };
}

function formDriver(page: Page) {
  return {
    setLegal: (text: string) =>
      page.evaluate((value) => {
        const field = document.querySelector<HTMLTextAreaElement>("#legal-text");
        if (!field) throw new Error("The legal text is not on the page");
        field.value = value;
      }, text),
    legal: () => page.locator("#legal-text").inputValue(),
    firstAmount: () => page.evaluate(() => _fgMontoN(getVals(), 1)),
    downloadPdf: () => downloadPdf(page),
  };
}

function tabsDriver(page: Page) {
  return {
    tabs: () => readTabs(page),
    selectFlyerTab: (option?: number) => selectFlyerTab(page, option),
    selectOpenTab: (index: number) => selectOpenTab(page, index),
    closeOpenTab: (index: number) => page.locator(`${OPEN_TAB} .fgp-x`).nth(index).click(),
    closeFirstDraftTab: () => page.locator(`${TAB_BAR} .fgp-bor .fgp-x`).first().click(),
    newDraft: () => newDraft(page),
    openWork: () => readOpenWork(page),
    waitForOpenWork: (id: string) => waitForOpenWork(page, id),
    openDesignThenAnother: async (first: string, second: string) => {
      await page.evaluate(
        ({ a, b }) => {
          window._fgLg.imgs = {};
          fgProtoAbrir(a);
          fgProtoAbrir(b);
        },
        { a: first, b: second },
      );
      await page.waitForTimeout(RACE_SETTLE_MS);
    },
    openDesignThenFlyer: async (design: string, option: number) => {
      await page.evaluate(
        ({ id, n }) => {
          window._fgLg.imgs = {};
          fgProtoAbrir(id);
          fgOptElegir(n);
        },
        { id: design, n: option },
      );
      await page.waitForTimeout(RACE_SETTLE_MS);
    },
    openWorkReading: () => readOpenWorkDetails(page),
  };
}

function companyDriver(page: Page) {
  return {
    bringCompany: async (company: LegacyPadronRecord) => {
      await page.evaluate((record) => {
        _padApply(record);
      }, company);
      await page.waitForTimeout(COMPANY_SETTLE_MS);
    },
    companyNotices: () => readCompanyNotices(page),
    closeCompanyUpdateNotice: () =>
      page.evaluate(() => {
        if (document.getElementById("pad-upd")) _padCloseUpdate(0);
      }),
    turnOffAmountsWithoutOriginal: () => turnOffAmounts(page),
    noCashbackLink: (option: number) =>
      page.evaluate((n) => {
        const variant = _fgVarianteSinCB(n);
        return {
          listed: Number(_OPC[variant]?.sinCB ?? 0) || null,
          variant,
          base: _fgOptBase(variant),
        };
      }, option),
    optionForCompany: (company: LegacyPadronRecord) =>
      page.evaluate((record) => _pgOptDe(record), company),
    generateBulk: (rows: BulkRow[]) => generateBulk(page, rows),
  };
}

function draftsAndHistoryDriver(page: Page) {
  return {
    waitForDraftsReviewed: () =>
      page
        .waitForFunction(() => _fgBorr.revisado, null, { timeout: SHOWN_TIMEOUT_MS })
        .then(() => undefined),
    savedDrafts: () => readSavedDrafts(page),
    blockBrowserStorage: () => blockBrowserStorage(page),
    keepInHistory: () =>
      page.evaluate(() => {
        flyerHistory.unshift({
          v: getVals(),
          opt: _optN(_fgOpt),
          ac: 0,
          ts: Date.now(),
          fecha: new Date().toISOString(),
        });
      }),
    newestHistoryEntry: () =>
      page.evaluate(() => {
        const values = flyerHistory[0]?.v;
        return {
          cuts: values?.recortes?.length ?? 0,
          hasBase: Boolean(values?.recBase),
          logos: values?.logos?.length ?? 0,
        };
      }),
    redownloadHeightFromHistory: () => redownloadHeight(page),
    loadFromHistory: async () => {
      await page.evaluate(() => {
        fgLoadHistory(0);
      });
      await page.waitForFunction(() => Boolean(_fgProtoActivo()) && !_fgBorr.ocupado, null, {
        timeout: SHOWN_TIMEOUT_MS,
      });
    },
  };
}

function insertDriver(page: Page) {
  let hovered: { x: number; y: number } | null = null;
  return {
    insertButtonVisible: () => page.locator("#fg-lg-ins").isVisible(),
    insertPickerOpen: () => page.locator("#fg-ins-ov").isVisible(),
    openInsertPicker: () => openInsertPicker(page),
    copyEnabled: () => page.locator("#fg-ins-ok").isEnabled(),
    markSectionToCopy: (fromY: number, toY: number) => markSectionToCopy(page, fromY, toY),
    sectionMarkVisible: () => page.locator("#fg-ins-banda").isVisible(),
    copyMarkedSection: async () => {
      await page.locator("#fg-ins-ok").click();
      await page.waitForFunction(() => _fgIns.modo, null, { timeout: SHOWN_TIMEOUT_MS });
    },
    insertStatus: () => readInsertStatus(page),
    copiedSectionFitsItsBlock: () => copiedSectionFitsItsBlock(page),
    hoverForPlacement: async (y: number) => {
      hovered = await scrollToFlyerHeight(page, y);
      await page.mouse.move(hovered.x, hovered.y - 20);
      await page.mouse.move(hovered.x, hovered.y, { steps: 3 });
      await page.waitForTimeout(SHORTCUT_SETTLE_MS);
    },
    placementLineVisible: () => page.locator("#fg-ins-linea").isVisible(),
    clickToPlace: async (y: number) => {
      const point = hovered ?? (await scrollToFlyerHeight(page, y));
      await page.mouse.click(point.x, point.y);
      await page.waitForFunction(() => !_fgIns.modo, null, { timeout: SHOWN_TIMEOUT_MS });
    },
    spaceAroundFirstInsertion: () => spaceAroundFirstInsertion(page),
    isGapInWholeFlyer: (y: number) =>
      page.evaluate((row) => {
        const whole = _fgRec?.orig;
        return whole ? (_fgInsFilas(whole)[row] ?? 0) < 2 : false;
      }, y),
    sourceSectionSample: (y: number, height: number) => sourceSectionSample(page, y, height),
    forgetSectionImages: () =>
      page.evaluate(() => {
        _fgIns.imgs = {};
      }),
    sectionsMissingImage: () =>
      page.evaluate(() => (_fgRecActivo() && _fgRec ? _fgInsFaltan(_fgRec.cortes) : -1)),
    waitForRecentSection: () =>
      page.locator("#fg-ins-ov .fg-ins-rec").first().waitFor({ timeout: SHOWN_TIMEOUT_MS }),
    pickRecentSection: async () => {
      await page.locator("#fg-ins-ov .fg-ins-rec").first().click();
      await page.waitForFunction(() => _fgIns.modo, null, { timeout: SHOWN_TIMEOUT_MS });
    },
    pressShortcut: async (key: string) => {
      await page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      });
      await page.keyboard.press(key);
      await page.waitForTimeout(SHORTCUT_SETTLE_MS);
    },
    pressUndo: async () => {
      await page.locator("#fg-lg-desh").click();
      await page.waitForTimeout(UNDO_SETTLE_MS);
    },
    pressRedo: async () => {
      await page.locator("#fg-lg-reh").click();
      await page.waitForTimeout(UNDO_SETTLE_MS);
    },
    sourcesInDepot: () => page.evaluate(() => (_fgIns.lista ?? []).length),
  };
}

function pdfDriver(page: Page) {
  return {
    convertPdf: (pdf: Buffer, probes: PdfProbes) => convertPdf(page, pdf, probes),
    tryConvertPdf: (pdf: Buffer, waitMs: number) => tryConvertPdf(page, pdf, waitMs),
    pdfReaderVersion: () => page.evaluate(() => window.pdfjsLib.version),
    securityPolicy: async () =>
      (await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content")) ??
      "",
    compareBandHeights: (pdf: Buffer, name: string, heights: [number, number]) =>
      compareBandHeights(page, { pdf, name, heights }),
    downloadBlockWithFailedFlyer: () =>
      page.evaluate(() => {
        _fgSinFlyerPoner({ opt: _optN(_fgOpt), motivo: "red" });
        const reason = _fgDescargaBloqueo();
        _fgSinFlyerPoner(null);
        return reason;
      }),
  };
}

export function createLegacyFlyerSectionsDriver(page: Page): FlyerSectionsDriver {
  return {
    ...cropDriver(page),
    ...formDriver(page),
    ...tabsDriver(page),
    ...companyDriver(page),
    ...draftsAndHistoryDriver(page),
    ...insertDriver(page),
    ...pdfDriver(page),
  };
}
