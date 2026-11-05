import { type Page } from "@playwright/test";
import {
  type AlignmentGuide,
  type FlyerBox,
  type FlyerPoint,
  type LogoChange,
  type LogoDrawing,
  type LogoEditorDriver,
  type LogoMarker,
  type LogoPixels,
  type PickerThumbnail,
  type PlacedLogo,
  type ScreenPoint,
} from "../logo-editor.ts";
import type { ProbedChange } from "./globals.d.ts";
import { partialDriver } from "./pending.ts";

const PICKER_TIMEOUT_MS = 15_000;
const SHOWN_TIMEOUT_MS = 15_000;
const CATALOG_TIMEOUT_MS = 15_000;
const QUIET_MOMENT_MS = 400;
const BOX_DRAG_STEPS = 4;
const LOGO_GRID = { stepX: 24, stepY: 30, smallest: 20, sameLogo: 8 };
const FAINT_MARKER = /rgba\(242, 97, 34, 0\.4\)/;
const NO_MARKER = /rgba\(0, 0, 0, 0\)|transparent/;
/** A free spot of the flyer of the tests, where a logo file can be tried. */
const SPOT_FOR_FILES = { x: 95, y: 2872, width: 130, height: 56 };

function picker(page: Page) {
  return page.getByRole("dialog", { name: /Cambiar esto|Agregar acá|Reemplazar \d+ lugares/ });
}

function cards(page: Page) {
  return picker(page).getByTestId("brand-card");
}

function probe(page: Page) {
  return {
    bringIntoView: ({ y }: FlyerPoint) =>
      page.evaluate((top) => {
        const preview = document.querySelector('[data-testid="flyer-preview"]');
        const editor = window["__flyerProbe"]?.logoEditor?.();
        const point = editor?.toClient(0, top);
        if (!preview || !editor || !point) throw new Error("The preview is not on screen");
        const box = preview.getBoundingClientRect();
        preview.scrollTop += point.y - (box.top + box.height / 2);
        // On a phone it is the page that scrolls.
        const after = editor.toClient(0, top);
        if (after) window.scrollBy(0, after.y - window.innerHeight / 2);
      }, y),
    screenPoint: ({ x, y }: FlyerPoint) =>
      page.evaluate(
        ({ left, top }) => {
          const editor = window["__flyerProbe"]?.logoEditor?.();
          const point = editor?.toClient(left, top);
          if (!editor || !point) throw new Error("The editor is not on screen");
          return { x: point.x, y: point.y, scale: editor.pictureScale() };
        },
        { left: x, top: y },
      ),
    placed: () => page.evaluate(() => [...(window["__flyerProbe"]?.logoEditor?.().placed() ?? [])]),
  };
}

function boxFrom({ tx, ty, tw, th }: ProbedChange): FlyerBox | null {
  if (tx === undefined || ty === undefined || tw === undefined || th === undefined) return null;
  return { x: tx, y: ty, width: tw, height: th };
}

function placeFrom({ ox, oy, ow, oh }: ProbedChange): FlyerBox | null {
  if (ox === undefined || oy === undefined || ow === undefined || oh === undefined) return null;
  return { x: ox, y: oy, width: ow, height: oh };
}

function kindOf({ tipo, img }: ProbedChange): LogoChange["kind"] {
  if (tipo === "txt") return "text";
  return img ? "brand" : "empty";
}

function roundedBox(box: FlyerBox | null): FlyerBox | null {
  return (
    box && {
      x: Math.round(box.x),
      y: Math.round(box.y),
      width: Math.round(box.width),
      height: Math.round(box.height),
    }
  );
}

function sizePercent({ tipo, fs, bfs, tw, bw }: ProbedChange): number | null {
  if (tipo === "txt") return fs === undefined || !bfs ? null : Math.round((fs / bfs) * 100);
  return tw === undefined || !bw ? null : Math.round((tw / bw) * 100);
}

function describePlaced(entry: ProbedChange): PlacedLogo {
  return {
    kind: kindOf(entry),
    title: entry.t ?? "",
    image: entry.img ?? "",
    box: boxFrom(entry),
    place: placeFrom(entry),
    coversFlyer: (entry.w ?? 0) > 0 && (entry.h ?? 0) > 0,
    isCopy: Boolean(entry.dup),
    sizePercent: sizePercent(entry),
    text: entry.texto ?? null,
    fontSize: entry.fs ?? null,
    color: entry.color ?? null,
    weight: entry.peso ?? null,
  };
}

async function placedCenter(page: Page, index: number): Promise<FlyerPoint> {
  const placed = (await probe(page).placed())[index];
  const box = placed && boxFrom(placed);
  if (!box) throw new Error(`There is no logo number ${String(index)} on the flyer`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function placedOnScreen(page: Page, index: number): Promise<ScreenPoint> {
  const { x, y } = await probe(page).screenPoint(await placedCenter(page, index));
  return { x, y };
}

async function touchFlyer(page: Page, at: FlyerPoint): Promise<void> {
  await probe(page).bringIntoView(at);
  const target = await probe(page).screenPoint(at);
  await page.mouse.click(target.x, target.y);
}

async function shiftClick(page: Page, target: ScreenPoint): Promise<void> {
  await page.keyboard.down("Shift");
  await page.mouse.click(target.x, target.y);
  await page.keyboard.up("Shift");
}

async function drawBox(page: Page, box: FlyerBox): Promise<void> {
  await probe(page).bringIntoView({ x: box.x, y: box.y + box.height / 2 });
  const from = await probe(page).screenPoint(box);
  const to = await probe(page).screenPoint({ x: box.x + box.width, y: box.y + box.height });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: BOX_DRAG_STEPS });
  await page.mouse.move(to.x, to.y, { steps: BOX_DRAG_STEPS });
  await page.mouse.up();
}

async function waitForBrandList(page: Page): Promise<void> {
  await cards(page).first().waitFor({ timeout: PICKER_TIMEOUT_MS });
}

async function waitForPickerClosed(page: Page): Promise<void> {
  await picker(page).waitFor({ state: "detached", timeout: PICKER_TIMEOUT_MS });
}

async function searchBrands(page: Page, text: string): Promise<string[]> {
  await picker(page).getByRole("searchbox", { name: "Buscar marca" }).fill(text);
  // The search box waits for a pause in the typing before it filters the list.
  await picker(page)
    .locator(`[data-testid="brand-list"][data-search="${text}"]`)
    .waitFor({ timeout: PICKER_TIMEOUT_MS });
  return picker(page).getByTestId("brand-title").allTextContents();
}

function markerVisibility(borderColor: string): LogoMarker["visibility"] {
  if (NO_MARKER.test(borderColor)) return "hidden";
  return FAINT_MARKER.test(borderColor) ? "faint" : "full";
}

async function readMarkers(page: Page): Promise<LogoMarker[]> {
  const markers = await page.evaluate(async () => {
    // Their color fades: what counts is the one they end with.
    const fades = document.getAnimations().filter((motion) => motion instanceof CSSTransition);
    await Promise.all(fades.map((fade) => fade.finished.catch(() => null)));
    return [...document.querySelectorAll<HTMLElement>('[data-testid="logo-marker"]')].map(
      (marker) => {
        const look = getComputedStyle(marker);
        return {
          color: look.borderTopColor,
          line: look.borderTopStyle,
          inGroup: "group" in marker.dataset,
          flashing: "flashing" in marker.dataset,
          onFlyerLogo: "onFlyer" in marker.dataset,
        };
      },
    );
  });
  return markers.map(({ color, line, inGroup, flashing, onFlyerLogo }) => ({
    visibility: markerVisibility(color),
    line,
    inGroup,
    flashing,
    onFlyerLogo,
  }));
}

async function readGuides(page: Page): Promise<AlignmentGuide[]> {
  const guides = await page.getByTestId("logo-guide").evaluateAll((elements) =>
    elements.flatMap((element) => {
      if (!(element instanceof HTMLElement)) return [];
      const { axis, near, exact } = element.dataset;
      return [{ axis, near: near !== undefined, exact: exact !== undefined }];
    }),
  );
  return guides.map(({ axis, near, exact }) => ({
    axis: axis === "horizontal" ? "horizontal" : "vertical",
    isNear: near,
    isExact: exact,
  }));
}

function readThumbnail(page: Page): Promise<PickerThumbnail> {
  return page.getByTestId("picker-thumbnail").evaluate((canvas) => {
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error("The thumbnail is not a canvas");
    const pixels =
      canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data ?? [];
    let ink = 0;
    for (let at = 0; at < pixels.length; at += 4) {
      ink += 765 - (pixels[at] ?? 0) - (pixels[at + 1] ?? 0) - (pixels[at + 2] ?? 0);
    }
    return { width: canvas.width, height: canvas.height, hidden: canvas.hidden === true, ink };
  });
}

function flyerLogosIn(page: Page, region: FlyerBox): Promise<FlyerBox[]> {
  return page.evaluate(
    ({ region: { x, y, width, height }, grid }) => {
      const editor = window["__flyerProbe"]?.logoEditor?.();
      const found: FlyerBox[] = [];
      for (let atY = y; atY <= y + height; atY += grid.stepY) {
        for (let atX = x; atX <= x + width; atX += grid.stepX) {
          const logo = editor?.detect(atX, atY);
          if (logo && logo.w >= grid.smallest && logo.h >= grid.smallest) {
            const seen = found.some(
              (other) =>
                Math.abs(other.x - logo.x) < grid.sameLogo &&
                Math.abs(other.y - logo.y) < grid.sameLogo,
            );
            if (!seen) found.push({ x: logo.x, y: logo.y, width: logo.w, height: logo.h });
          }
        }
      }
      return found;
    },
    { region, grid: LOGO_GRID },
  );
}

/** Runs inside the page, so it cannot use anything outside its own body. */
function countPixels(canvas: HTMLCanvasElement): LogoPixels {
  const { width, height } = canvas;
  const data = canvas.getContext("2d")?.getImageData(0, 0, width, height).data ?? [];
  type Pixel = { red: number; green: number; blue: number; alpha: number; lowest: number };
  const count = (matches: (pixel: Pixel) => boolean): number => {
    let found = 0;
    for (let at = 0; at < data.length; at += 4) {
      const [red = 0, green = 0, blue = 0, alpha = 0] = [
        data[at],
        data[at + 1],
        data[at + 2],
        data[at + 3],
      ];
      if (matches({ red, green, blue, alpha, lowest: Math.min(red, green, blue) })) found += 1;
    }
    return found;
  };
  return {
    width,
    height,
    cornerAlpha: data[3] ?? 0,
    visible: count(({ alpha }) => alpha >= 128),
    visibleLight: count(({ alpha, lowest }) => alpha >= 128 && lowest > 190),
    visibleBlue: count(({ alpha, blue, red }) => alpha >= 128 && blue > red && red < 80),
    solidWhite: count(({ alpha, lowest }) => alpha > 200 && lowest > 235),
    solidBright: count(({ alpha, red }) => alpha > 200 && red > 235),
    solidBlue: count(({ alpha, blue, red }) => alpha > 200 && blue > 60 && red < 60),
    partlyTransparent: count(({ alpha }) => alpha > 0 && alpha < 255),
    fullyTransparent: count(({ alpha }) => alpha === 0),
  };
}

/** Paints the drawing on a canvas and returns the file it makes. */
function paintLogoFile(page: Page, drawing: LogoDrawing) {
  return page.evaluate(async ({ width, height, format, rectangles, word }) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No canvas here");
    for (const { x, y, width: wide, height: tall, color } of rectangles ?? []) {
      context.fillStyle = color;
      context.fillRect(x, y, wide, tall);
    }
    if (word) {
      context.font = "bold 300px Arial";
      context.textBaseline = "middle";
      context.lineWidth = 14;
      if (word.outline) {
        context.strokeStyle = word.outline;
        context.strokeText("Toledo", 80, 250);
      }
      context.fillStyle = word.fill;
      context.fillText("Toledo", 80, 250);
    }
    const type = `image/${format}`;
    const blob = await new Promise<Blob | null>((done) => {
      canvas.toBlob(done, type, 0.92);
    });
    if (!blob) throw new Error("The canvas gave no file");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCodePoint(byte);
    return { base64: btoa(binary), type, name: `logo.${format === "png" ? "png" : "jpg"}` };
  }, drawing);
}

async function enterIfNeeded(page: Page): Promise<void> {
  const isOn = await page.evaluate(() => window["__flyerProbe"]?.logoEditor?.().isEditing());
  if (!isOn) await enter(page);
}

function enter(page: Page) {
  return page
    .getByTestId("logo-editor-bar")
    .getByRole("button", { name: /^(Cambiar logos|Listo)$/ })
    .click();
}

/**
 * A person gives the app a logo through the window: that is the way the app reads one. What it keeps
 * is read from its memory, and the place is left as it was.
 */
async function logoFromFile(
  page: Page,
  file: { name: string; mimeType: string; buffer: Buffer },
): Promise<{ pixels: LogoPixels; warnings: string[] }> {
  await enterIfNeeded(page);
  await drawBox(page, SPOT_FOR_FILES);
  await picker(page).waitFor({ timeout: PICKER_TIMEOUT_MS });
  await page.getByTestId("logo-file").setInputFiles(file);
  await waitForPickerClosed(page);
  const kept = await page.evaluateHandle(() => {
    const editor = window["__flyerProbe"]?.logoEditor?.();
    const main = editor?.selection().main ?? -1;
    const canvas = editor?.imageOf(editor.placed()[main]?.img ?? "");
    if (!canvas) throw new Error("The logo was not kept");
    return canvas;
  });
  const pixels = await kept.evaluate(countPixels);
  await kept.dispose();
  const notice = await page.getByRole("status").and(page.locator("[data-visible]")).textContent();
  await page
    .getByRole("toolbar", { name: "Ajustar el elemento elegido" })
    .getByRole("button", { name: "Original" })
    .click();
  return {
    pixels,
    warnings: (notice ?? "").startsWith("Listo") ? [] : [notice ?? ""],
  };
}

async function cleanedLogo(page: Page, image: Buffer | LogoDrawing): Promise<LogoPixels> {
  const painted = Buffer.isBuffer(image) ? null : await paintLogoFile(page, image);
  const buffer = Buffer.isBuffer(image) ? image : Buffer.from(painted?.base64 ?? "", "base64");
  const { pixels } = await logoFromFile(page, {
    name: painted?.name ?? "logo.png",
    mimeType: painted?.type ?? "image/png",
    buffer,
  });
  return pixels;
}

/** Puts different brands valid today by hand, on a card that does not bring days. */
async function placeOneBrand(page: Page, box: FlyerBox, used: Set<string>): Promise<void> {
  await drawBox(page, box);
  await waitForBrandList(page);
  const offers = await cards(page).evaluateAll((elements) =>
    elements.map((element) => ({
      logo: element.getAttribute("data-logo") ?? "",
      line: element.textContent,
    })),
  );
  for (const [index, { logo, line }] of offers.entries()) {
    if (logo && !used.has(logo) && !/supermercado/i.test(line)) {
      used.add(logo);
      await cards(page).nth(index).click();
      try {
        await picker(page).waitFor({ state: "detached", timeout: 3000 });
        return;
      } catch {
        // Its logo could not be brought: the next brand will do.
      }
    }
  }
  throw new Error("The catalog has not enough brands");
}

async function placeBrands(
  page: Page,
  boxes: readonly FlyerBox[],
  keepLastChosen: boolean,
): Promise<void> {
  await waitForCatalog(page);
  const used = new Set<string>();
  for (const box of boxes) await placeOneBrand(page, box, used);
  if (!keepLastChosen) await page.keyboard.press("Escape");
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await waitUntilSettled(page);
}

async function waitForCatalog(page: Page): Promise<void> {
  await page.waitForFunction(
    () => (window["__flyerProbe"]?.logoEditor?.().catalogSize() ?? 0) > 0,
    null,
    { timeout: CATALOG_TIMEOUT_MS },
  );
}

async function waitUntilSettled(page: Page): Promise<void> {
  await page.waitForFunction(() => window["__flyerProbe"]?.logoEditor?.().isSettled());
}

async function placeText(
  page: Page,
  box: FlyerBox,
  { text, weight, fontSize }: { text: string; color: string; weight: number; fontSize: number },
): Promise<void> {
  await drawBox(page, box);
  await picker(page).getByRole("button", { name: "Escribir un texto" }).click();
  await picker(page)
    .getByRole("textbox", { name: /^Texto/ })
    .fill(text);
  await picker(page).getByRole("slider", { name: "Tamaño del texto" }).fill(String(fontSize));
  if (weight >= 700) await picker(page).getByRole("checkbox", { name: "Negrita" }).check();
  await picker(page).getByRole("button", { name: "Poner el texto" }).click();
  await waitForPickerClosed(page);
}

async function pickBrandsInOrder(page: Page, count: number) {
  for (let index = 0; index < count; index += 1) await cards(page).nth(index).click();
  return cards(page).evaluateAll(
    (elements, taken) => ({
      images: elements.slice(0, taken).map((element) => element.getAttribute("data-logo") ?? ""),
      numbers: elements
        .filter((element) => element.hasAttribute("data-chosen"))
        .map((element) => element.getAttribute("data-n") ?? "")
        .toSorted(),
    }),
    count,
  );
}

async function writeText(page: Page, at: FlyerPoint, text: string): Promise<void> {
  await touchFlyer(page, at);
  await picker(page).getByRole("button", { name: "Escribir un texto" }).click();
  await picker(page)
    .getByRole("textbox", { name: /^Texto/ })
    .fill(text);
  await picker(page).getByRole("button", { name: "Poner el texto" }).click();
  await waitForPickerClosed(page);
}

function createReading(page: Page) {
  return {
    changes: async () => {
      const entries = await page.evaluate(() => [
        ...(window["__flyerProbe"]?.logoEditor?.().all() ?? []),
      ]);
      return entries.map((entry) => ({
        kind: kindOf(entry),
        title: entry.t ?? "",
        box: roundedBox(boxFrom(entry)),
      }));
    },
    changesInDownload: () =>
      page.evaluate(
        () => window["__flyerProbe"]?.flyerWorkspace?.().currentValues().logos?.length ?? 0,
      ),
    placements: async () => (await probe(page).placed()).map(describePlaced),
    selection: async () =>
      page.evaluate(() => {
        const read = window["__flyerProbe"]?.logoEditor?.().selection();
        if (!read) throw new Error("The editor is not on screen");
        return read;
      }),
    markers: () => readMarkers(page),
    guides: () => readGuides(page),
    modes: () =>
      page.evaluate(() => {
        const editor = window["__flyerProbe"]?.logoEditor?.();
        const layer = document.querySelector('[data-testid="logo-editor-layer"]');
        const mode = editor?.mode();
        return {
          cleanPreview: Boolean(editor?.clean()),
          trimming: mode === "trim",
          markingStrip: mode === "strip",
          marksVisible:
            Boolean(layer) && layer !== null && getComputedStyle(layer).display !== "none",
        };
      }),
    placedImageSize: (index: number) =>
      page.evaluate((at) => {
        const editor = window["__flyerProbe"]?.logoEditor?.();
        const image = editor?.imageOf(editor.placed()[at]?.img ?? "");
        if (!image) throw new Error(`Logo number ${String(at)} has no image in memory`);
        return { width: image.width, height: image.height };
      }, index),
    undoSteps: () =>
      page.evaluate(() => [...(window["__flyerProbe"]?.logoEditor?.().undoSteps() ?? [])]),
    downloadSnapshot: () =>
      page.evaluate(() =>
        JSON.stringify(window["__flyerProbe"]?.flyerWorkspace?.().currentValues().logos ?? []),
      ),
    openDesignName: () =>
      page.evaluate(() => window["__flyerProbe"]?.logoEditor?.().openDesign() ?? null),
    isDragging: () =>
      page.evaluate(() => Boolean(window["__flyerProbe"]?.logoEditor?.().isDragging())),
    isEditing: () =>
      page.evaluate(() => Boolean(window["__flyerProbe"]?.logoEditor?.().isEditing())),
    flyerLogosIn: (region: FlyerBox) => flyerLogosIn(page, region),
    flyerLogoAt: async ({ x, y }: FlyerPoint) => {
      const logo = await page.evaluate(
        (point) => window["__flyerProbe"]?.logoEditor?.().detect(point.x, point.y) ?? null,
        { x, y },
      );
      if (!logo) throw new Error("There is no logo printed there");
      return { x: logo.x, y: logo.y, width: logo.w, height: logo.h };
    },
    previewOnScreen: () =>
      page.getByTestId("flyer-preview").evaluate((preview) => {
        const { top, bottom } = preview.getBoundingClientRect();
        return { top, bottom };
      }),
    scrollPreviewBy: (pixels: number) =>
      page.getByTestId("flyer-preview").evaluate((preview, amount) => {
        preview.scrollTop += amount;
      }, pixels),
  };
}

function createPickerWindow(page: Page) {
  return {
    waitForBrandList: () => waitForBrandList(page),
    waitForPicker: () => picker(page).waitFor({ timeout: PICKER_TIMEOUT_MS }),
    pickerStaysClosed: async () => {
      await page.waitForTimeout(QUIET_MOMENT_MS);
      return (await picker(page).count()) === 0;
    },
    waitForPickerClosed: () => waitForPickerClosed(page),
    brandListVisible: () => picker(page).getByTestId("brand-list").isVisible(),
    searchBrands: (text: string) => searchBrands(page, text),
    pickFirstBrand: async () => {
      await cards(page).first().click();
      await waitForPickerClosed(page);
    },
    pickBrandsInOrder: (count: number) => pickBrandsInOrder(page, count),
    openPickerForArea: async (box: FlyerBox) => {
      await drawBox(page, box);
      await picker(page).waitFor({ timeout: PICKER_TIMEOUT_MS });
    },
    pressFirstBrand: () => cards(page).first().click(),
    chooseLogoFile: (file: string | { name: string; mimeType: string; buffer: Buffer }) =>
      page.getByTestId("logo-file").setInputFiles(file),
    thumbnail: () => readThumbnail(page),
    pickerTargetIndex: () =>
      page.evaluate(() => window["__flyerProbe"]?.logoEditor?.().pickerTarget() ?? -1),
    textForm: () =>
      picker(page).evaluate((window) => ({
        text: window.querySelector("textarea")?.value ?? "",
        size: Number(
          window.querySelector<HTMLInputElement>('input[aria-label="Tamaño del texto"]')?.value,
        ),
        colors: [...window.querySelectorAll('[data-testid="text-color"]')].map(
          (color) => color.getAttribute("aria-label") ?? "",
        ),
        chosenColor: window.querySelector('[data-testid="text-color-name"]')?.textContent ?? "",
      })),
  };
}

/** Everything goes with mouse and keyboard: only what cannot be seen is read from the app. */
export function createReactLogoEditorDriver(page: Page): LogoEditorDriver {
  return partialDriver<LogoEditorDriver>("logoEditor", {
    ...createReading(page),
    ...createPickerWindow(page),
    enter: () => enter(page),
    replaceWithBrand: async (at, search) => {
      await touchFlyer(page, at);
      await waitForBrandList(page);
      const matches = await searchBrands(page, search);
      await cards(page).first().click();
      await waitForPickerClosed(page);
      return { matches };
    },
    leaveEmpty: async (at) => {
      await touchFlyer(page, at);
      await picker(page)
        .getByRole("button", { name: "Dejar el lugar vacío" })
        .click({ timeout: PICKER_TIMEOUT_MS });
      await waitForPickerClosed(page);
    },
    waitForBrandCatalog: () => waitForCatalog(page),
    waitUntilSettled: () => waitUntilSettled(page),
    waitForMarkersToStopFlashing: async () => {
      await page.waitForFunction(() => !document.querySelector("[data-flashing]"));
    },
    bringIntoView: (at) => probe(page).bringIntoView(at),
    touch: (at) => touchFlyer(page, at),
    shiftTouch: async (at) => {
      await probe(page).bringIntoView(at);
      await shiftClick(page, await probe(page).screenPoint(at));
    },
    drawBox: (box) => drawBox(page, box),
    screenPoint: (at) => probe(page).screenPoint(at),
    touchPlaced: async (index, { withShift = false } = {}) => {
      await probe(page).bringIntoView(await placedCenter(page, index));
      const target = await placedOnScreen(page, index);
      if (withShift) await shiftClick(page, target);
      else await page.mouse.click(target.x, target.y);
    },
    doubleClickPlaced: async (index) => {
      await probe(page).bringIntoView(await placedCenter(page, index));
      const target = await placedOnScreen(page, index);
      await page.mouse.dblclick(target.x, target.y);
    },
    placedOnScreen: (index) => placedOnScreen(page, index),
    placeBrands: (boxes, { keepLastChosen = false } = {}) =>
      placeBrands(page, boxes, keepLastChosen),
    placeEmpty: async (box) => {
      await drawBox(page, box);
      await picker(page).getByRole("button", { name: "Dejar el lugar vacío" }).click();
      await waitForPickerClosed(page);
    },
    placeText: (box, text) => placeText(page, box, text),
    pressFlyerTab: (name) =>
      page.getByTestId("flyer-options").getByRole("button", { name, exact: true }).click(),
    cancelDragOnPlaced: async (index) => {
      const { x, y } = await placedOnScreen(page, index);
      await page.getByTestId("flyer-canvas").evaluate(
        (canvas, point) => {
          canvas.dispatchEvent(
            new PointerEvent("pointerdown", {
              clientX: point.x,
              clientY: point.y,
              button: 0,
              pointerType: "touch",
              bubbles: true,
            }),
          );
          document.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true }));
        },
        { x, y },
      );
    },
    draftCount: () => page.locator('[data-testid="open-work"][data-draft="true"]').count(),
    /** It is written by itself a moment after the last touch: a person only has to wait. */
    writeUndoStep: () => waitUntilSettled(page),
    /** With the arrows, as a person moves one: with Shift, 10 pixels at a time. */
    moveFirstChangeAsStep: async (pixels) => {
      await probe(page).bringIntoView(await placedCenter(page, 0));
      const target = await placedOnScreen(page, 0);
      await page.mouse.click(target.x, target.y);
      for (let moved = 0; moved < pixels; moved += 10)
        await page.keyboard.press("Shift+ArrowRight");
      await waitUntilSettled(page);
    },
    leaveFields: () =>
      page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      }),
    focusCompanyField: () => page.getByLabel("Nombre de la empresa", { exact: true }).focus(),
    clearCompanyField: () => page.getByLabel("Nombre de la empresa", { exact: true }).fill(""),
    companyFieldValue: () => page.getByLabel("Nombre de la empresa", { exact: true }).inputValue(),
    readUploadedLogo: async (drawing) => {
      const { base64, type, name } = await paintLogoFile(page, drawing);
      return logoFromFile(page, { name, mimeType: type, buffer: Buffer.from(base64, "base64") });
    },
    cleanLogo: (image) => cleanedLogo(page, image),
    writeText: (at, text) => writeText(page, at, text),
    uploadLogo: async (at, file) => {
      await touchFlyer(page, at);
      await page.getByTestId("logo-file").setInputFiles(file);
      await waitForPickerClosed(page);
    },
    removeAllChanges: async () => {
      const button = page
        .getByTestId("logo-editor-bar")
        .getByRole("button", { name: /^Volver (el cambio|los \d+ cambios) al original$/ });
      if ((await button.count()) > 0) await button.click();
      await waitUntilSettled(page);
    },
    openDesignTabs: () =>
      page.getByTestId("open-work").evaluateAll((tabs) =>
        tabs.map((tab) => ({
          name: (tab.textContent ?? "").replace("×", "").trim(),
          active: tab.getAttribute("data-active") === "true",
        })),
      ),
    /** Touching it and moving the slider of its size, as a person does. */
    resizeFirstChange: async (percent) => {
      await probe(page).bringIntoView(await placedCenter(page, 0));
      const target = await placedOnScreen(page, 0);
      await page.mouse.click(target.x, target.y);
      await page.getByRole("slider", { name: "Tamaño del logo" }).fill(String(percent));
      await waitUntilSettled(page);
    },
    /** With the arrows and Shift, 10 pixels at a time; a person cannot move one without touching it. */
    shiftFirstChange: async (pixels) => {
      const isEditing = await page.evaluate(() =>
        Boolean(window["__flyerProbe"]?.logoEditor?.().isEditing()),
      );
      if (!isEditing) await page.getByRole("button", { name: "Cambiar logos" }).click();
      await probe(page).bringIntoView(await placedCenter(page, 0));
      const target = await placedOnScreen(page, 0);
      await page.mouse.click(target.x, target.y);
      for (let moved = 0; moved < pixels; moved += 10)
        await page.keyboard.press("Shift+ArrowRight");
      await waitUntilSettled(page);
    },
    /** Saving it in Estudio is how a design gets to be the one that is open. */
    treatAsOpenDesign: async (name) => {
      await page.getByTestId("save-design").click();
      await page.getByLabel("Nombre del diseño").fill(name);
      const window = page.getByRole("dialog", { name: "Guardar en Estudio" });
      await window.getByRole("button", { name: "Guardar", exact: true }).click();
      await window.waitFor({ state: "detached", timeout: SHOWN_TIMEOUT_MS });
    },
  });
}
