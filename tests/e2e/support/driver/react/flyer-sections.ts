import { readFile } from "node:fs/promises";
import { type Locator, type Page } from "@playwright/test";
import {
  type BandHeightComparison,
  type BulkOutcome,
  type BulkRow,
  type CompanyRecord,
  type CropStatus,
  type FlyerSectionsDriver,
  type FlyerTab,
  type InsertStatus,
  type PdfImageReading,
  type PdfProbes,
  type SavedDrafts,
} from "../flyer-sections.ts";
import { bucketUrl } from "../../cloud/index.ts";
import { closeRegistryIfOpen } from "./company-list.ts";
import { createReactCompanyRegistryDriver } from "./company-registry.ts";
import { createReactFlyerBatches } from "./flyer-batches.ts";
import { goToOption, waitForOptionShown } from "./flyer-editor.ts";

const SHOWN_TIMEOUT_MS = 15_000;
const DOWNLOAD_TIMEOUT_MS = 20_000;
const SECOND_DOWNLOAD_WINDOW_MS = 500;
const RACE_SETTLE_MS = 1200;
const PDF_CONVERSION_TIMEOUT_MS = 40_000;
const DRAG_STEPS = 4;

function editorBar(page: Page): Locator {
  return page.getByTestId("logo-editor-bar");
}

function pickerWindow(page: Page): Locator {
  return page.getByRole("dialog", { name: "Insertar una sección" });
}

function flyerTabs(page: Page): Locator {
  return page.getByTestId("flyer-options").locator("button[data-option]");
}

function openTabs(page: Page): Locator {
  return page.getByTestId("open-work");
}

async function isEditing(page: Page): Promise<boolean> {
  return page.evaluate(() => Boolean(window["__flyerProbe"]?.logoEditor?.().isEditing()));
}

async function enterIfNeeded(page: Page): Promise<void> {
  if (await isEditing(page)) return;
  await editorBar(page).getByRole("button", { name: "Cambiar logos" }).click();
}

async function waitUntilSettled(page: Page): Promise<void> {
  await page.waitForFunction(() => window["__flyerProbe"]?.logoEditor?.().isSettled());
}

/** The band in the middle of the preview, and where its two heights are on the screen. */
function bandOnScreen(page: Page, top: number, bottom: number) {
  return page.evaluate(
    ({ from, to }) => {
      const preview = document.querySelector('[data-testid="flyer-preview"]');
      const editor = window["__flyerProbe"]?.logoEditor?.();
      const middle = editor?.toClient(0, (from + to) / 2);
      if (!preview || !editor || !middle) throw new Error("The preview is not on screen");
      const box = preview.getBoundingClientRect();
      preview.scrollTop += middle.y - (box.top + box.height / 2);
      const canvas = document.querySelector('[data-testid="flyer-canvas"]');
      const canvasBox = canvas?.getBoundingClientRect();
      const [one, other] = [editor.toClient(0, from), editor.toClient(0, to)];
      if (!canvasBox || !one || !other) throw new Error("The flyer is not on screen");
      return { x: canvasBox.left + canvasBox.width / 2, fromY: one.y, toY: other.y };
    },
    { from: top, to: bottom },
  );
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

async function pressCropping(page: Page): Promise<void> {
  await editorBar(page)
    .getByRole("button", { name: /^(Recortar|Cancelar recorte)$/ })
    .click();
}

async function dragCropBand(page: Page, fromY: number, toY: number): Promise<void> {
  await dragVertically(page, await bandOnScreen(page, fromY, toY));
  await page
    .getByRole("dialog", { name: "Quitar una parte del flyer" })
    .waitFor({ timeout: SHOWN_TIMEOUT_MS });
}

async function confirmCrop(page: Page): Promise<void> {
  const before = (await readCropStatus(page)).cuts.length;
  await page.getByRole("button", { name: "Quitar esta parte" }).click();
  await page.waitForFunction(
    (count) => (window["__flyerProbe"]?.logoEditor?.().cuts().length ?? 0) > count,
    before,
    { timeout: SHOWN_TIMEOUT_MS },
  );
}

/** As a person takes a band out: Recortar, dragging over it and confirming. */
async function removeBand(page: Page, y: number, height: number): Promise<void> {
  await enterIfNeeded(page);
  await pressCropping(page);
  await dragCropBand(page, y, y + height);
  await confirmCrop(page);
  await waitUntilSettled(page);
}

function readCropStatus(page: Page): Promise<CropStatus> {
  return page.evaluate(() => {
    const { scene } = window["__flyerProbe"]?.flyerWorkspace?.().getState().slot ?? {};
    const panel = document.querySelector<HTMLElement>("[data-no-amounts]");
    const cuts = scene?.cuts ?? [];
    return {
      active: cuts.length > 0,
      cuts: cuts.map(({ y, h, ins }) => ({
        y,
        height: h,
        inserted: ins
          ? {
              source: ins.u,
              y: ins.sy,
              height: ins.sh,
              width: ins.sw ?? 0,
              padding: ins.pad ?? 0,
            }
          : null,
      })),
      artworkHeight: scene?.art.height ?? 0,
      amountsHidden: panel?.dataset["noAmounts"] === "true",
      amountsCardHidden: Boolean(panel?.querySelector('[data-testid="no-amounts"]')),
    };
  });
}

function downloadBandSample(page: Page, y: number, height: number): Promise<number[]> {
  return page.evaluate(
    ({ top, rows }) => {
      const full = window["__flyerProbe"]?.flyerWorkspace?.().renderDownload();
      if (!full) throw new Error("There is no flyer to download");
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
    const { scene } = window["__flyerProbe"]?.flyerWorkspace?.().getState().slot ?? {};
    const cut = scene?.cuts[0];
    if (!scene || !cut) throw new Error("There is no cut");
    const { width } = scene.art;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = 2;
    const graphics = canvas.getContext("2d");
    if (!graphics) throw new Error("No canvas context");
    graphics.drawImage(scene.art, 0, cut.y - 1, width, 2, 0, 0, width, 2);
    const rows = graphics.getImageData(0, 0, width, 2).data;
    let total = 0;
    let samples = 0;
    for (let x = 0; x < width; x += 4) {
      const above = x * 4;
      const below = (width + x) * 4;
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
  }, bytes.toString("base64"));
}

async function downloadPdf(page: Page): Promise<string[]> {
  const files: string[] = [];
  const firstDownload = page
    .waitForEvent("download", { timeout: DOWNLOAD_TIMEOUT_MS })
    .catch(() => null);
  page.on("download", (download) => {
    files.push(download.suggestedFilename());
  });
  await page.getByRole("button", { name: "Descargar PDF" }).click();
  await firstDownload;
  await page.waitForTimeout(SECOND_DOWNLOAD_WINDOW_MS);
  return files;
}

async function readTabs(page: Page): Promise<FlyerTab[]> {
  const flyers = await flyerTabs(page).evaluateAll((tabs) =>
    tabs.map((tab) => ({
      label: (tab.textContent ?? "").trim(),
      active: tab.getAttribute("aria-pressed") === "true",
      isFlyer: true,
      option: Number(tab.getAttribute("data-option")),
    })),
  );
  const open = await openTabs(page).evaluateAll((tabs) =>
    tabs.map((tab) => ({
      label: (tab.textContent ?? "").replace("×", "").trim(),
      active: tab.getAttribute("data-active") === "true",
      isFlyer: false,
      option: null,
    })),
  );
  return [...flyers, ...open];
}

async function waitForOriginal(page: Page, option: number): Promise<void> {
  await page.waitForFunction(
    (wanted) => {
      const probe = window["__flyerProbe"];
      const slot = probe?.flyerWorkspace?.().getState().slot;
      return (
        !probe?.logoEditor?.().openWork() &&
        !probe?.logoEditor?.().isOpening() &&
        slot?.option === wanted &&
        !slot.loading &&
        slot.scene?.cuts.length === 0
      );
    },
    option,
    { timeout: SHOWN_TIMEOUT_MS },
  );
}

async function selectFlyerTab(page: Page, option?: number): Promise<void> {
  const tab =
    option === undefined
      ? flyerTabs(page).first()
      : page.getByTestId("flyer-options").locator(`button[data-option="${String(option)}"]`);
  const shown = Number(await tab.getAttribute("data-option"));
  await tab.click();
  await waitForOriginal(page, shown);
}

function waitForOpenWork(page: Page, id: string): Promise<void> {
  return page
    .waitForFunction(
      (wanted) => {
        const editor = window["__flyerProbe"]?.logoEditor?.();
        return editor?.openWork()?.id === wanted && !editor.isOpening();
      },
      id,
      { timeout: SHOWN_TIMEOUT_MS },
    )
    .then(() => undefined);
}

async function selectOpenTab(page: Page, index: number): Promise<void> {
  const tab = openTabs(page).nth(index);
  const id = await tab.getAttribute("data-work");
  if (!id) throw new Error("That tab has no draft");
  await tab.getByRole("button").first().click();
  await waitForOpenWork(page, id);
}

async function newDraft(page: Page): Promise<void> {
  const before = await page.evaluate(
    () => window["__flyerProbe"]?.logoEditor?.().openWork()?.id ?? null,
  );
  await editorBar(page).getByRole("button", { name: "+ Nuevo borrador" }).click();
  await page.waitForFunction(
    (previous) => {
      const editor = window["__flyerProbe"]?.logoEditor?.();
      const id = editor?.openWork()?.id;
      return Boolean(id) && id !== previous && !editor?.isOpening();
    },
    before,
    { timeout: SHOWN_TIMEOUT_MS },
  );
}

function readOpenWorkDetails(page: Page) {
  return page.evaluate(() => {
    const probe = window["__flyerProbe"];
    const placed = probe?.logoEditor?.().placed() ?? [];
    return {
      openId: probe?.logoEditor?.().openWork()?.id ?? null,
      texts: placed.map((change) => change.texto ?? ""),
      downloadTexts: (probe?.flyerWorkspace?.().currentValues().logos ?? []).map(
        (logo) => logo.texto ?? "undefined",
      ),
      activeTabs: [
        ...document.querySelectorAll(
          '[data-testid="flyer-options"] [aria-pressed="true"], [data-testid="open-work"][data-active="true"]',
        ),
      ].map((tab) => (tab.textContent ?? "").replace("×", "").trim()),
    };
  });
}

function readSavedDrafts(page: Page): Promise<SavedDrafts> {
  return page.evaluate(() => {
    const key = window["__flyerProbe"]?.logoEditor?.().draftsKey() ?? "";
    const value = localStorage.getItem(key);
    const parsed: { lista?: { nombre: string; recortes: unknown[]; cambios: unknown[] }[] } = value
      ? JSON.parse(value)
      : {};
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

async function waitForSheet(page: Page): Promise<void> {
  const image = page.getByTestId("section-sheet").locator("img");
  await image.waitFor({ timeout: SHOWN_TIMEOUT_MS });
  await page.waitForFunction(
    () => {
      const picture = document.querySelector<HTMLImageElement>('[data-testid="section-sheet"] img');
      return Boolean(picture?.complete) && (picture?.naturalHeight ?? 0) > 0;
    },
    null,
    { timeout: SHOWN_TIMEOUT_MS },
  );
}

async function openInsertPicker(page: Page): Promise<void> {
  await editorBar(page).getByRole("button", { name: "Insertar" }).click();
  await waitForSheet(page);
}

async function markSectionToCopy(page: Page, fromY: number, toY: number): Promise<void> {
  const points = await page.evaluate(
    ({ top, bottom }) => {
      const sheet = document.querySelector<HTMLElement>('[data-testid="section-sheet"]');
      const image = sheet?.querySelector("img");
      const view = document.querySelector('[data-testid="section-view"]');
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

async function readInsertStatus(page: Page): Promise<InsertStatus> {
  const button = editorBar(page).getByRole("button", { name: /^(Insertar|Cancelar inserción)$/ });
  const label = (await button.count()) > 0 ? ((await button.textContent()) ?? "") : "";
  const { placing, section } = await page.evaluate(() => {
    const editor = window["__flyerProbe"]?.logoEditor?.();
    const copied = editor?.section() ?? null;
    return {
      placing: editor?.mode() === "insert",
      section: copied && { y: copied.sy, height: copied.sh, width: copied.sw },
    };
  });
  return {
    placing,
    section,
    pickerOpen: (await pickerWindow(page).count()) > 0,
    buttonLabel: label,
    lineOnPage: (await page.getByTestId("insert-line").count()) > 0,
  };
}

function copiedSectionFitsItsBlock(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const editor = window["__flyerProbe"]?.logoEditor?.();
    const section = editor?.section();
    if (!editor || !section) return false;
    const bottom = section.sy + section.sh;
    const blank = (row: number) => editor.isBlankRow("section", row);
    return blank(section.sy - 1) && !blank(section.sy) && !blank(bottom - 1) && blank(bottom);
  });
}

function scrollToFlyerHeight(page: Page, y: number): Promise<{ x: number; y: number }> {
  return page.evaluate((height) => {
    const preview = document.querySelector('[data-testid="flyer-preview"]');
    const editor = window["__flyerProbe"]?.logoEditor?.();
    const before = editor?.toClient(0, height);
    if (!preview || !editor || !before) throw new Error("The preview is not on screen");
    const box = preview.getBoundingClientRect();
    preview.scrollTop += before.y - (box.top + box.height / 2);
    const canvas = document.querySelector('[data-testid="flyer-canvas"]')?.getBoundingClientRect();
    const after = editor.toClient(0, height);
    if (!canvas || !after) throw new Error("The flyer is not on screen");
    return { x: canvas.left + canvas.width / 2, y: after.y };
  }, y);
}

function spaceAroundFirstInsertion(page: Page): Promise<{ above: number; below: number }> {
  return page.evaluate(() => {
    const editor = window["__flyerProbe"]?.logoEditor?.();
    const cut = editor?.cuts()[0];
    if (!editor || !cut?.ins) throw new Error("There is no inserted section");
    const blank = (row: number) => editor.isBlankRow("current", row);
    const { y, h } = cut;
    let spaceTop = y;
    while (spaceTop > 0 && blank(spaceTop - 1)) spaceTop -= 1;
    let lastInk = y + h - 1;
    while (lastInk > y && blank(lastInk)) lastInk -= 1;
    let firstInk = y + (cut.ins.pad ?? 0);
    while (blank(firstInk)) firstInk += 1;
    let inkBelow = y + h;
    while (blank(inkBelow)) inkBelow += 1;
    return { above: firstInk - spaceTop, below: inkBelow - lastInk - 1 };
  });
}

function sourceSectionSample(page: Page, y: number, height: number): Promise<number[]> {
  return page.evaluate(
    ({ top, rows }) => {
      const editor = window["__flyerProbe"]?.logoEditor?.();
      const source = editor?.cuts()[0]?.ins?.u;
      const image = source ? editor?.sectionImage(source) : null;
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

function cropDriver(page: Page) {
  return {
    toggleCropping: () => pressCropping(page),
    isMarkingCrop: () =>
      page.evaluate(() => window["__flyerProbe"]?.logoEditor?.().mode() === "trim"),
    cropButtonLabel: async () =>
      (await editorBar(page)
        .getByRole("button", { name: /^(Recortar|Cancelar recorte)$/ })
        .textContent()) ?? "",
    dragCropBand: (fromY, toY) => dragCropBand(page, fromY, toY),
    confirmCrop: () => confirmCrop(page),
    removeBand: (y, height) => removeBand(page, y, height),
    cropStatus: () => readCropStatus(page),
    cropSign: async () => {
      const sign = page.getByTestId("cuts-sign");
      return (await sign.count()) > 0 ? await sign.textContent() : null;
    },
    undoCrop: () =>
      page.getByTestId("cuts-sign").getByRole("button", { name: "Volver a como estaba" }).click(),
    dropCrop: async () => {
      const button = page
        .getByTestId("cuts-sign")
        .getByRole("button", { name: "Volver a como estaba" });
      if ((await button.count()) > 0) await button.click();
    },
    // A person touches the tab of the flyer: it comes back whole.
    reenterCurrentOption: async () => {
      await selectFlyerTab(page);
    },
    companyNamePlacement: () =>
      page.evaluate(() => {
        const { empresa } = window["__flyerProbe"]?.flyerWorkspace?.().getState().slot.scene
          ?.calibration ?? { empresa: { yc: 0, off: false } };
        return { centerY: empresa.yc, off: Boolean(empresa.off) };
      }),
    legalWithAmounts: (template) =>
      page.evaluate(
        (text) => window["__flyerProbe"]?.flyerReadings?.().legalWith(text) ?? "",
        template,
      ),
    seamDifference: () => seamDifference(page),
    downloadBandSample: (y, height) => downloadBandSample(page, y, height),
    downloadHeight: () =>
      page.evaluate(() => window["__flyerProbe"]?.flyerWorkspace?.().renderDownload()?.height ?? 0),
    imageSize: (bytes) => imageSize(page, bytes),
    downloadPdf: () => downloadPdf(page),
  } satisfies Partial<FlyerSectionsDriver>;
}

function tabsDriver(page: Page) {
  return {
    tabs: () => readTabs(page),
    selectFlyerTab: (option) => selectFlyerTab(page, option),
    selectOpenTab: (index) => selectOpenTab(page, index),
    closeOpenTab: (index) =>
      openTabs(page).nth(index).getByRole("button", { name: "Cerrar" }).click(),
    closeFirstDraftTab: () =>
      page
        .locator('[data-testid="open-work"][data-draft="true"]')
        .first()
        .getByRole("button", { name: "Cerrar" })
        .click(),
    newDraft: () => newDraft(page),
    /** Two touches in a row, before the first one finished opening. */
    openDesignThenAnother: async (first, second) => {
      await page.evaluate(
        (ids) => {
          for (const id of ids) {
            document.querySelector<HTMLButtonElement>(`[data-work="${id}"] button`)?.click();
          }
        },
        [first, second],
      );
      await page.waitForTimeout(RACE_SETTLE_MS);
    },
    openDesignThenFlyer: async (design, option) => {
      await page.evaluate(
        ({ id, flyer }) => {
          document.querySelector<HTMLButtonElement>(`[data-work="${id}"] button`)?.click();
          document
            .querySelector<HTMLButtonElement>(
              `[data-testid="flyer-options"] button[data-option="${String(flyer)}"]`,
            )
            ?.click();
        },
        { id: design, flyer: option },
      );
      await page.waitForTimeout(RACE_SETTLE_MS);
    },
    openWork: () =>
      page.evaluate(() => {
        const editor = window["__flyerProbe"]?.logoEditor?.();
        const work = editor?.openWork();
        return work
          ? { name: work.name, isDraft: work.isDraft, changes: editor?.placed().length ?? 0 }
          : null;
      }),
    waitForOpenWork: (id) => waitForOpenWork(page, id),
    openWorkReading: () => readOpenWorkDetails(page),
    waitForDraftsReviewed: () =>
      page
        .waitForFunction(() => window["__flyerProbe"]?.logoEditor?.().draftsReviewed(), null, {
          timeout: SHOWN_TIMEOUT_MS,
        })
        .then(() => undefined),
    savedDrafts: () => readSavedDrafts(page),
    blockBrowserStorage: () => blockBrowserStorage(page),
  } satisfies Partial<FlyerSectionsDriver>;
}

function insertDriver(page: Page) {
  let hovered: { x: number; y: number } | null = null;
  return {
    insertButtonVisible: () =>
      editorBar(page)
        .getByRole("button", { name: /^(Insertar|Cancelar inserción)$/ })
        .isVisible(),
    insertPickerOpen: () => pickerWindow(page).isVisible(),
    openInsertPicker: () => openInsertPicker(page),
    copyEnabled: () => page.getByRole("button", { name: "Copiar esta sección" }).isEnabled(),
    markSectionToCopy: (fromY, toY) => markSectionToCopy(page, fromY, toY),
    sectionMarkVisible: () => page.getByTestId("section-band").isVisible(),
    copyMarkedSection: async () => {
      await page.getByRole("button", { name: "Copiar esta sección" }).click();
      await page.waitForFunction(() => window["__flyerProbe"]?.logoEditor?.().mode() === "insert");
    },
    insertStatus: () => readInsertStatus(page),
    copiedSectionFitsItsBlock: () => copiedSectionFitsItsBlock(page),
    hoverForPlacement: async (y) => {
      hovered = await scrollToFlyerHeight(page, y);
      await page.mouse.move(hovered.x, hovered.y - 20);
      await page.mouse.move(hovered.x, hovered.y, { steps: 3 });
      await page.getByTestId("insert-line").waitFor({ timeout: SHOWN_TIMEOUT_MS });
    },
    placementLineVisible: () => page.getByTestId("insert-line").isVisible(),
    clickToPlace: async (y) => {
      const point = hovered ?? (await scrollToFlyerHeight(page, y));
      await page.mouse.click(point.x, point.y);
      await page.waitForFunction(() => window["__flyerProbe"]?.logoEditor?.().mode() !== "insert");
    },
    spaceAroundFirstInsertion: () => spaceAroundFirstInsertion(page),
    isGapInWholeFlyer: (y) =>
      page.evaluate(
        (row) => window["__flyerProbe"]?.logoEditor?.().isBlankRow("whole", row) ?? false,
        y,
      ),
    sourceSectionSample: (y, height) => sourceSectionSample(page, y, height),
    /** Only reloading takes them out of memory, for a person. */
    forgetSectionImages: async () => {
      await page.reload();
      await page.getByRole("banner").waitFor({ timeout: SHOWN_TIMEOUT_MS });
    },
    sourcesInDepot: () => page.getByTestId("source").count(),
    sectionsMissingImage: () =>
      page.evaluate(() => {
        const editor = window["__flyerProbe"]?.logoEditor?.();
        return editor && editor.cuts().length > 0 ? editor.missingSections() : -1;
      }),
    waitForRecentSection: () =>
      page.getByTestId("recent-section").first().waitFor({ timeout: SHOWN_TIMEOUT_MS }),
    pickRecentSection: async () => {
      await page.getByTestId("recent-section").first().click();
      await page.waitForFunction(() => window["__flyerProbe"]?.logoEditor?.().mode() === "insert");
    },
    pressShortcut: async (key) => {
      await page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      });
      await page.keyboard.press(key);
      await waitUntilSettled(page);
    },
    pressUndo: async () => {
      await editorBar(page).getByRole("button", { name: "Deshacer" }).click();
      await waitUntilSettled(page);
    },
    pressRedo: async () => {
      await editorBar(page).getByRole("button", { name: "Rehacer" }).click();
      await waitUntilSettled(page);
    },
  } satisfies Partial<FlyerSectionsDriver>;
}

/** A flyer that really does not load: another option whose file cannot be read. */
async function downloadBlockWithFailedFlyer(page: Page): Promise<string> {
  const other = page
    .getByTestId("flyer-options")
    .locator('button[data-option][aria-pressed="false"]')
    .last();
  if ((await other.count()) === 0) {
    throw new Error("It takes another flyer option to see one that does not load");
  }
  const option = await other.getAttribute("data-option");
  await page.route(`**/_active${option ?? ""}.json*`, (route) => route.abort());
  await other.click();
  const notice = page.getByTestId("flyer-load-problem");
  await notice.waitFor({ timeout: SHOWN_TIMEOUT_MS });
  return (await notice.innerText()).replace(/\s+/g, " ").trim();
}

const COMPANY_SETTLE_MS = 400;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };

function decisionDialog(page: Page): Locator {
  return page.getByTestId("decision-dialog");
}

/** What a person has for this: whoever enters after the administrator published that flyer. */
async function turnOffAmounts(page: Page): Promise<void> {
  const option = await page.evaluate(
    () => window["__flyerProbe"]?.flyerWorkspace?.().getState().slot.option ?? 1,
  );
  const file = option === 1 ? "_active.json" : `_active${String(option)}.json`;
  const address = bucketUrl(file);
  const published = await page.evaluate(async (url) => {
    const answer = await fetch(url);
    const parsed: Record<string, unknown> = await answer.json();
    return parsed;
  }, address);
  const calibration = published["cfg"];
  await page.route(`**/${file}*`, (route) =>
    route.fulfill({
      json: {
        ...published,
        cfg: {
          ...(typeof calibration === "object" ? calibration : {}),
          montos: { off: true },
          cashback: { off: true },
        },
      },
      headers: CORS,
    }),
  );
  await page.reload();
  await page.getByRole("banner").waitFor({ timeout: SHOWN_TIMEOUT_MS });
  await goToOption(page, option);
  await waitForOptionShown(page, option);
}

function samplePdf(pdf: Buffer, name: string) {
  return { name, mimeType: "application/pdf", buffer: pdf };
}

/** What a person does: Estudio → Subir un flyer. The canvas is seen on its way to the JPEG. */
async function chooseFlyerFile(page: Page, pdf: Buffer, name: string): Promise<void> {
  await page
    .getByRole("banner")
    .getByRole("tab", { name: /^Estudio/ })
    .click();
  await page.evaluate(() => {
    const realToBlob: typeof HTMLCanvasElement.prototype.toBlob = Reflect.get(
      HTMLCanvasElement.prototype,
      "toBlob",
    );
    Reflect.set(window, "__converted", null);
    HTMLCanvasElement.prototype.toBlob = function toBlob(callback, type, quality) {
      Reflect.set(window, "__converted", this);
      HTMLCanvasElement.prototype.toBlob = realToBlob;
      realToBlob.call(this, callback, type, quality);
    };
  });
  await page.getByTestId("sources-file").setInputFiles(samplePdf(pdf, name));
}

async function convertPdf(
  page: Page,
  pdf: Buffer,
  probes: PdfProbes,
): Promise<PdfImageReading | null> {
  await chooseFlyerFile(page, pdf, "muestra.pdf");
  const nameField = page.getByTestId("text-window-field");
  const arrived = await nameField
    .waitFor({ timeout: PDF_CONVERSION_TIMEOUT_MS })
    .then(() => true)
    .catch(() => false);
  if (!arrived) return null;
  const reading = await page.evaluate((wanted) => {
    const canvas: unknown = Reflect.get(window, "__converted");
    if (!(canvas instanceof HTMLCanvasElement)) return null;
    const graphics = canvas.getContext("2d");
    if (!graphics) return null;
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
  }, probes);
  await page.keyboard.press("Escape");
  await nameField.waitFor({ state: "detached" });
  return reading;
}

function compareBandHeights(
  page: Page,
  { pdf, name, heights }: { pdf: Buffer; name: string; heights: [number, number] },
): Promise<BandHeightComparison> {
  return page.evaluate(
    async ({ content, fileName, bands }) => {
      const bytes = Uint8Array.from(atob(content), (letter) => letter.charCodeAt(0));
      const file = new File([bytes], fileName, { type: "application/pdf" });
      const convert = async (band: number) => {
        const start = performance.now();
        const canvas = await window["__flyerProbe"]?.pdfConversion?.().withBands(file, band);
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
      const { width, height } = first.canvas;
      const a = graphicsA.getImageData(0, 0, width, height).data;
      const b = graphicsB.getImageData(0, 0, width, height).data;
      let total = 0;
      let differentRows = 0;
      for (let row = 0; row < height; row += 1) {
        let rowTotal = 0;
        for (let x = row * width * 4; x < (row + 1) * width * 4; x += 4) {
          rowTotal += Math.abs((a[x] ?? 0) - (b[x] ?? 0));
        }
        total += rowTotal;
        if (rowTotal / width > 2) differentRows += 1;
      }
      return {
        failed: false,
        heightA: height,
        heightB: second.canvas.height,
        millisecondsA: first.milliseconds,
        millisecondsB: second.milliseconds,
        meanDifference: total / (width * height),
        differentRows,
      };
    },
    { content: pdf.toString("base64"), fileName: name, bands: heights },
  );
}

function pdfDriver(page: Page) {
  return {
    convertPdf: (pdf: Buffer, probes: PdfProbes) => convertPdf(page, pdf, probes),
    tryConvertPdf: async (pdf: Buffer, waitMs: number) => {
      await chooseFlyerFile(page, pdf, "m.pdf");
      await page.waitForTimeout(waitMs);
      return (await page.getByTestId("text-window-field").count()) > 0;
    },
    pdfReaderVersion: () =>
      page.evaluate(() => window["__flyerProbe"]?.pdfReader?.().version ?? ""),
    securityPolicy: async () =>
      (await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content")) ??
      "",
    compareBandHeights: async (pdf: Buffer, name: string, heights: [number, number]) => {
      await page
        .getByRole("banner")
        .getByRole("tab", { name: /^Estudio/ })
        .click();
      await page.getByTestId("sources-file").waitFor({ state: "attached" });
      return compareBandHeights(page, { pdf, name, heights });
    },
  };
}

function formDriver(page: Page) {
  const registry = createReactCompanyRegistryDriver(page);
  return {
    setLegal: (text: string) => page.getByTestId("legal-text").fill(text),
    legal: () => page.getByTestId("legal-text").inputValue(),
    firstAmount: () =>
      page.evaluate(
        () => window["__flyerProbe"]?.flyerReadings?.().legalWith("{eminentblack}") ?? "",
      ),
    bringCompany: async (company: CompanyRecord) => {
      await registry.applyCompany({
        name: company.empresa,
        cashback: company.config,
        officers: company.asesores.map(({ nombre, celular, email }) =>
          email === undefined
            ? { name: nombre, phone: celular }
            : { name: nombre, phone: celular, email },
        ),
      });
      await page.waitForTimeout(COMPANY_SETTLE_MS);
    },
    companyNotices: async () => {
      const confirmation = page.getByRole("alertdialog");
      const notice = decisionDialog(page);
      return {
        confirmation: (await confirmation.count()) > 0 ? await confirmation.textContent() : null,
        updateNotice: (await notice.count()) > 0 ? await notice.textContent() : null,
      };
    },
    closeCompanyUpdateNotice: async () => {
      const notice = decisionDialog(page);
      if ((await notice.count()) === 0) return;
      await notice.locator("[data-decision]").last().click();
    },
    turnOffAmountsWithoutOriginal: () => turnOffAmounts(page),
  };
}

/** The image inside a PDF of a flyer has the height of the flyer, in pixels. */
function heightInPdf(bytes: Buffer): number {
  const [, height] = /\/Height (\d+)/.exec(bytes.toString("latin1")) ?? [];
  return Number(height);
}

async function historyTab(page: Page, name: "Historial" | "Individual"): Promise<void> {
  await page.getByRole("tablist", { name: "Modo de armado" }).getByRole("tab", { name }).click();
}

function historyDriver(page: Page) {
  return {
    // A person gets it there the only way there is: the flyer comes out.
    keepInHistory: async () => {
      const before = await page.evaluate(
        () => window["__flyerProbe"]?.flyerHistory?.().length ?? 0,
      );
      await Promise.all([page.waitForEvent("download"), page.getByTestId("download-pdf").click()]);
      await page.waitForFunction(
        (count) => (window["__flyerProbe"]?.flyerHistory?.().length ?? 0) > count,
        before,
        { timeout: SHOWN_TIMEOUT_MS },
      );
    },
    newestHistoryEntry: () =>
      page.evaluate(() => {
        const { v: values } = window["__flyerProbe"]?.flyerHistory?.()[0] ?? {};
        return {
          cuts: values?.recortes?.length ?? 0,
          hasBase: Boolean(values?.recBase),
          logos: values?.logos?.length ?? 0,
        };
      }),
    redownloadHeightFromHistory: async () => {
      await historyTab(page, "Historial");
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: DOWNLOAD_TIMEOUT_MS }),
        page.getByTestId("history-row").first().getByRole("button", { name: "PDF" }).click(),
      ]);
      const height = heightInPdf(await readFile(await download.path()));
      await historyTab(page, "Individual");
      return height;
    },
    loadFromHistory: async () => {
      await historyTab(page, "Historial");
      await page.getByTestId("history-row").first().getByRole("button", { name: "Editar" }).click();
      await page.waitForFunction(
        () => {
          const editor = window["__flyerProbe"]?.logoEditor?.();
          return Boolean(editor?.openWork()) && !editor?.isOpening();
        },
        null,
        { timeout: SHOWN_TIMEOUT_MS },
      );
    },
  };
}

/** Masivo over those lines, all the way to the ZIP on disk. */
async function generateBulk(page: Page, rows: readonly BulkRow[]): Promise<BulkOutcome> {
  const batches = createReactFlyerBatches(page);
  await batches.uploadExcelSheet([
    ["empresa", "config", "asesor1_nombre"],
    ...rows.map(({ empresa, config, asesor1_nombre: officer }) => [empresa, config, officer]),
  ]);
  const download = page.waitForEvent("download", { timeout: DOWNLOAD_TIMEOUT_MS * 3 });
  await page.getByTestId("batch-generate").click();
  const zip = await download;
  await page.waitForFunction(() => !window["__flyerProbe"]?.flyerBatch?.().isRunning());
  return page.evaluate(
    (zipName) => ({
      generated: (window["__flyerProbe"]?.flyerBatch?.().drawn() ?? []).map(
        ({ company, option, hasAmounts }) => ({ company, option, hasAmounts }),
      ),
      zipName,
      finalOption: window["__flyerProbe"]?.flyerWorkspace?.().getState().slot.option ?? 0,
    }),
    zip.suggestedFilename(),
  );
}

export function createReactFlyerSectionsDriver(page: Page): FlyerSectionsDriver {
  return {
    ...formDriver(page),
    ...historyDriver(page),
    ...pdfDriver(page),
    ...cropDriver(page),
    ...tabsDriver(page),
    ...insertDriver(page),
    downloadBlockWithFailedFlyer: () => downloadBlockWithFailedFlyer(page),
    noCashbackLink: (option: number) =>
      page.evaluate((n) => {
        const probe = window["__flyerProbe"]?.flyerBatch?.();
        const variant = probe?.versionOf(n) ?? 0;
        return {
          listed: probe?.listedAsVersionOf(variant) ?? null,
          variant,
          base: probe?.baseOf(variant) ?? 0,
        };
      }, option),
    optionForCompany: async (company: CompanyRecord) => {
      const registry = createReactCompanyRegistryDriver(page);
      const option = await registry.destinationOption({
        name: company.empresa,
        cashback: company.config,
      });
      await closeRegistryIfOpen(page);
      return option;
    },
    generateBulk: (rows) => generateBulk(page, rows),
  };
}
