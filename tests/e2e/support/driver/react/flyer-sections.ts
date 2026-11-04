import { type Locator, type Page } from "@playwright/test";
import {
  type CropStatus,
  type FlyerSectionsDriver,
  type FlyerTab,
  type InsertStatus,
  type SavedDrafts,
} from "../flyer-sections.ts";
import { partialDriver } from "./pending.ts";

const SHOWN_TIMEOUT_MS = 15_000;
const DOWNLOAD_TIMEOUT_MS = 20_000;
const SECOND_DOWNLOAD_WINDOW_MS = 500;
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
      // The card of the form hangs from this same mark: see FlyerEditorView.
      amountsCardHidden: panel?.dataset["noAmounts"] === "true",
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

function cropDriver(page: Page): Partial<FlyerSectionsDriver> {
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
  };
}

function tabsDriver(page: Page): Partial<FlyerSectionsDriver> {
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
  };
}

function insertDriver(page: Page): Partial<FlyerSectionsDriver> {
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
  };
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

export function createReactFlyerSectionsDriver(page: Page): FlyerSectionsDriver {
  return partialDriver<FlyerSectionsDriver>("flyerSections", {
    ...cropDriver(page),
    ...tabsDriver(page),
    ...insertDriver(page),
    downloadBlockWithFailedFlyer: () => downloadBlockWithFailedFlyer(page),
  });
}
