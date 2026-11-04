import { type JSHandle, type Page } from "@playwright/test";
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

const PICKER = "#fg-lg-ov";
const PICKER_ITEM = `${PICKER} .fg-lg-it`;
const PICKER_TIMEOUT_MS = 15_000;
const CATALOG_TIMEOUT_MS = 15_000;
const LOGO_GRID = { stepX: 24, stepY: 30, smallest: 20, sameLogo: 8 };
const QUIET_MOMENT_MS = 400;
const BOX_DRAG_STEPS = 4;
const FAINT_MARKER = /rgba\(242, 97, 34, 0\.4\)/;
const NO_MARKER = /rgba\(0, 0, 0, 0\)|transparent/;

/** Brings the point to the middle of the preview. */
async function bringIntoView(page: Page, at: FlyerPoint): Promise<void> {
  await page.evaluate(({ y }) => {
    const preview = document.querySelector(".prev");
    if (!preview) throw new Error("The preview is not on screen");
    const canvasBox = cv.getBoundingClientRect();
    const scale = (canvasBox.width / cv.width) * SC;
    const previewBox = preview.getBoundingClientRect();
    preview.scrollTop += canvasBox.top + y * scale - (previewBox.top + previewBox.height / 2);
  }, at);
}

function screenPoint(page: Page, at: FlyerPoint): Promise<ScreenPoint & { scale: number }> {
  return page.evaluate(({ x, y }) => {
    const box = cv.getBoundingClientRect();
    const scale = (box.width / cv.width) * SC;
    return { x: box.left + x * scale, y: box.top + y * scale, scale };
  }, at);
}

async function touchFlyer(page: Page, at: FlyerPoint): Promise<void> {
  await bringIntoView(page, at);
  const target = await screenPoint(page, at);
  await page.mouse.click(target.x, target.y);
}

async function shiftClick(page: Page, target: ScreenPoint): Promise<void> {
  await page.keyboard.down("Shift");
  await page.mouse.click(target.x, target.y);
  await page.keyboard.up("Shift");
}

async function drawBox(page: Page, box: FlyerBox): Promise<void> {
  await bringIntoView(page, { x: box.x, y: box.y + box.height / 2 });
  const from = await screenPoint(page, box);
  const to = await screenPoint(page, { x: box.x + box.width, y: box.y + box.height });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: BOX_DRAG_STEPS });
  await page.mouse.move(to.x, to.y, { steps: BOX_DRAG_STEPS });
  await page.mouse.up();
}

async function searchPicker(page: Page, text: string): Promise<string[]> {
  await page.locator("#fg-lg-q").fill(text);
  // The search box waits for a pause in the typing before it filters the list.
  await page.waitForFunction((query) => _fgLgV.q === query, text);
  return page.locator(`${PICKER} .fg-lg-it-t`).allTextContents();
}

async function waitForBrandList(page: Page): Promise<void> {
  await page.locator(PICKER_ITEM).first().waitFor({ timeout: PICKER_TIMEOUT_MS });
}

function waitForPickerClosed(page: Page): Promise<void> {
  return page.locator(PICKER).waitFor({ state: "detached", timeout: PICKER_TIMEOUT_MS });
}

type ChangeFields = { [Key in keyof LegacyLogoChange]-?: LegacyLogoChange[Key] | undefined };

function boxFrom(
  x: number | undefined,
  y: number | undefined,
  width: number | undefined,
  height: number | undefined,
): FlyerBox | null {
  if (x === undefined || y === undefined || width === undefined || height === undefined) {
    return null;
  }
  return { x, y, width, height };
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

function kindOf(entry: {
  tipo?: string | undefined;
  img?: string | undefined;
}): LogoChange["kind"] {
  if (entry.tipo === "txt") return "text";
  return entry.img ? "brand" : "empty";
}

function describeChange(
  entry: Pick<ChangeFields, "tipo" | "img" | "t" | "tx" | "ty" | "tw" | "th">,
) {
  return {
    kind: kindOf(entry),
    title: entry.t ?? "",
    box: roundedBox(boxFrom(entry.tx, entry.ty, entry.tw, entry.th)),
  } satisfies LogoChange;
}

function sizePercent({ tipo, fs, bfs, tw, bw }: LegacyLogoChange): number | null {
  if (tipo === "txt") return fs === undefined || !bfs ? null : Math.round((fs / bfs) * 100);
  return tw === undefined || !bw ? null : Math.round((tw / bw) * 100);
}

function describePlaced(entry: LegacyLogoChange): PlacedLogo {
  return {
    kind: kindOf(entry),
    title: entry.t ?? "",
    image: entry.img ?? "",
    box: boxFrom(entry.tx, entry.ty, entry.tw, entry.th),
    place: boxFrom(entry.ox, entry.oy, entry.ow, entry.oh),
    coversFlyer: (entry.w ?? 0) > 0 && (entry.h ?? 0) > 0,
    isCopy: Boolean(entry.dup),
    sizePercent: sizePercent(entry),
    text: entry.texto ?? null,
    fontSize: entry.fs ?? null,
    color: entry.color ?? null,
    weight: entry.peso ?? null,
  };
}

function readPlaced(page: Page): Promise<LegacyLogoChange[]> {
  // The list is plain data, except that it is a live array of the page.
  return page.evaluate(() => _fgLgActivos());
}

async function placedCenter(page: Page, index: number): Promise<FlyerPoint> {
  const placed = (await readPlaced(page))[index];
  const box = placed && boxFrom(placed.tx, placed.ty, placed.tw, placed.th);
  if (!box) throw new Error(`There is no logo number ${index} on the flyer`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function placedOnScreen(page: Page, index: number): Promise<ScreenPoint> {
  const { x, y } = await screenPoint(page, await placedCenter(page, index));
  return { x, y };
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
    return [...document.querySelectorAll("#fg-lg-mk .fg-lg-marca")].map((marker) => {
      const look = getComputedStyle(marker);
      return {
        color: look.borderTopColor,
        line: look.borderTopStyle,
        inGroup: marker.classList.contains("grupo"),
        flashing: marker.classList.contains("flash"),
        onFlyerLogo: marker.classList.contains("lugar"),
      };
    });
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
  const classes = await page
    .locator("#fg-lg-guias .fg-lg-guia")
    .evaluateAll((guides) => guides.map((guide) => [...guide.classList]));
  return classes.map((names) => ({
    axis: names.includes("h") ? "horizontal" : "vertical",
    isNear: names.includes("cerca"),
    isExact: names.includes("tecla"),
  }));
}

function readThumbnail(page: Page): Promise<PickerThumbnail> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("#fg-lg-ori");
    if (!canvas) throw new Error("The window is not open");
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
      const found: FlyerBox[] = [];
      for (let atY = y; atY <= y + height; atY += grid.stepY) {
        for (let atX = x; atX <= x + width; atX += grid.stepX) {
          let logo: LegacyLogoDetection | null = null;
          try {
            logo = _fgLgDetectar(atX, atY);
          } catch {
            // Outside the area the detector can read.
          }
          if (!logo || logo.error || logo.w < grid.smallest || logo.h < grid.smallest) continue;
          const { x: left, y: top, w: logoWidth, h: logoHeight } = logo;
          const seen = found.some(
            (other) =>
              Math.abs(other.x - left) < grid.sameLogo && Math.abs(other.y - top) < grid.sameLogo,
          );
          if (!seen) found.push({ x: left, y: top, width: logoWidth, height: logoHeight });
        }
      }
      return found;
    },
    { region, grid: LOGO_GRID },
  );
}

async function pickBrandsInOrder(page: Page, count: number) {
  const items = page.locator(`#fg-lg-list .fg-lg-it`);
  for (let index = 0; index < count; index += 1) await items.nth(index).click();
  return page.evaluate((taken) => {
    const chosen = [...document.querySelectorAll<HTMLElement>("#fg-lg-list .fg-lg-it.elegida")];
    return {
      images: window._fgLgV.res.slice(0, taken).map(({ imagen }) => imagen),
      numbers: chosen.map((item) => item.dataset.n ?? "").toSorted(),
    };
  }, count);
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

async function pixelsOf(handle: JSHandle<HTMLCanvasElement>): Promise<LogoPixels> {
  const pixels = await handle.evaluate(countPixels);
  await handle.dispose();
  return pixels;
}

async function readUploadedLogo(page: Page, drawing: LogoDrawing) {
  const file = await paintLogoFile(page, drawing);
  const read = await page.evaluateHandle(async ({ base64, type, name }) => {
    const warnings: string[] = [];
    const original = window.showToast;
    window.showToast = (message) => {
      warnings.push(String(message));
      original(message);
    };
    const bytes = Uint8Array.from(atob(base64), (letter) => letter.codePointAt(0) ?? 0);
    try {
      const { logo } = await _fgLgLeerArchivo(new File([bytes], name, { type }));
      return { logo, warnings };
    } finally {
      window.showToast = original;
    }
  }, file);
  const pixels = await pixelsOf(await read.getProperty("logo"));
  return { pixels, warnings: await (await read.getProperty("warnings")).jsonValue() };
}

async function cleanLogo(page: Page, image: Buffer | LogoDrawing): Promise<LogoPixels> {
  const base64 = Buffer.isBuffer(image)
    ? image.toString("base64")
    : (await paintLogoFile(page, image)).base64;
  const logo = await page.evaluateHandle(async (content) => {
    const loaded = new Image();
    loaded.src = `data:image/png;base64,${content}`;
    await loaded.decode();
    return _fgLgLimpiarLogo(loaded);
  }, base64);
  return pixelsOf(logo);
}

function placeBrands(
  page: Page,
  boxes: readonly FlyerBox[],
  keepLastChosen: boolean,
): Promise<void> {
  return page.evaluate(
    async ({ places, keep }) => {
      const brands: { promotion: LegacyPromotion; logo: HTMLCanvasElement }[] = [];
      for (const promotion of window._promosCat ?? []) {
        if (brands.length >= places.length) break;
        const image = promotion.imagen;
        if (!image || brands.some((brand) => brand.promotion.imagen === image)) continue;
        // One that expired would be drawn in red, which is another matter.
        if (_fgLgVencida({ img: image })) continue;
        try {
          brands.push({ promotion, logo: await _fgLgTraer(image) });
        } catch {
          // The next brand will do.
        }
      }
      places.forEach(({ x, y, width, height }, index) => {
        const brand = brands[index];
        if (!brand) throw new Error("The catalog has not enough brands");
        const { imagen, titulo } = brand.promotion;
        _fgLgPoner(_fgLgManual(x, y, width, height), imagen, titulo, brand.logo);
      });
      if (!keep) window._fgLg.sel = -1;
      _fgLgHistMarcar();
      _fgLgListo();
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    },
    { places: boxes, keep: keepLastChosen },
  );
}

export function createLegacyLogoEditorDriver(page: Page): LogoEditorDriver {
  return {
    enter: () => page.locator("#fg-lg-btn").click(),
    replaceWithBrand: async (at, search) => {
      await touchFlyer(page, at);
      await waitForBrandList(page);
      const matches = await searchPicker(page, search);
      await page.locator(PICKER_ITEM).first().click();
      await waitForPickerClosed(page);
      return { matches };
    },
    leaveEmpty: async (at) => {
      await touchFlyer(page, at);
      await page.locator("#fg-lg-nada").click({ timeout: PICKER_TIMEOUT_MS });
      await waitForPickerClosed(page);
    },
    changes: async () => {
      const entries = await page.evaluate(() =>
        _fgLg.list.map(({ tipo, img, t, tx, ty, tw, th }) => ({ tipo, img, t, tx, ty, tw, th })),
      );
      return entries.map(describeChange);
    },
    changesInDownload: () => page.evaluate(() => (getVals().logos ?? []).length),

    waitForBrandCatalog: async () => {
      await page.waitForFunction(() => Boolean(window._promosCat?.length), null, {
        timeout: CATALOG_TIMEOUT_MS,
      });
    },
    waitUntilSettled: async () => {
      await page.waitForFunction(
        () => !window._fgLgRaf && !window._fgLgHist.t && !window._fgLg.arrastre,
      );
    },
    waitForMarkersToStopFlashing: async () => {
      await page.waitForFunction(() => !document.querySelector("#fg-lg-mk .flash"));
    },

    bringIntoView: (at) => bringIntoView(page, at),
    touch: (at) => touchFlyer(page, at),
    shiftTouch: async (at) => {
      await bringIntoView(page, at);
      await shiftClick(page, await screenPoint(page, at));
    },
    drawBox: (box) => drawBox(page, box),
    screenPoint: (at) => screenPoint(page, at),
    touchPlaced: async (index, { withShift = false } = {}) => {
      await bringIntoView(page, await placedCenter(page, index));
      const target = await placedOnScreen(page, index);
      if (withShift) await shiftClick(page, target);
      else await page.mouse.click(target.x, target.y);
    },
    doubleClickPlaced: async (index) => {
      await bringIntoView(page, await placedCenter(page, index));
      const target = await placedOnScreen(page, index);
      await page.mouse.dblclick(target.x, target.y);
    },
    placedOnScreen: (index) => placedOnScreen(page, index),

    placeBrands: async (boxes, { keepLastChosen = false } = {}) => {
      await page.waitForFunction(() => Boolean(window._promosCat?.length), null, {
        timeout: CATALOG_TIMEOUT_MS,
      });
      await placeBrands(page, boxes, keepLastChosen);
    },
    placeEmpty: ({ x, y, width, height }) =>
      page.evaluate(
        (box) => {
          _fgLgPoner(_fgLgManual(box.x, box.y, box.width, box.height), "", "", null);
          window._fgLg.sel = -1;
          _fgLgListo();
        },
        { x, y, width, height },
      ),
    placeText: (box, { text, color, weight, fontSize }) =>
      page.evaluate(
        ({ place, content }) => {
          _fgLgPonerTexto(_fgLgManual(place.x, place.y, place.width, place.height), content, null);
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        },
        { place: box, content: { texto: text, color, peso: weight, fs: fontSize } },
      ),
    treatAsOpenDesign: (name) =>
      page.evaluate((nombre) => {
        const design = { id: "open-design", nombre, mio: true, estado: "privado" };
        window._fgLg.proy = design;
        _fgLgBarra();
      }, name),

    placements: async () => (await readPlaced(page)).map(describePlaced),
    selection: () =>
      page.evaluate(() => ({
        main: window._fgLg.sel,
        chosen: _fgLgElegidos(),
        flyerLogos: window._fgLg.lugares.length,
      })),
    markers: () => readMarkers(page),
    guides: () => readGuides(page),
    modes: () =>
      page.evaluate(() => {
        const layer = document.getElementById("fg-lg-capa");
        const preview = document.querySelector(".prev");
        return {
          cleanPreview:
            Boolean(window._fgLg.limpio) || Boolean(preview?.classList.contains("fg-lg-limpio")),
          trimming: _fgRecM.modo,
          markingStrip: window._fgFr.modo,
          marksVisible:
            Boolean(layer) && layer !== null && getComputedStyle(layer).display !== "none",
        };
      }),
    placedImageSize: (index) =>
      page.evaluate((at) => {
        const image = _fgLgImg(_fgLgActivos()[at]?.img ?? "");
        if (!image) throw new Error(`Logo number ${at} has no image in memory`);
        return { width: image.width, height: image.height };
      }, index),
    undoSteps: () => page.evaluate(() => window._fgLgHist.pasos.map(({ et }) => et)),
    downloadSnapshot: () => page.evaluate(() => JSON.stringify(getVals().logos ?? [])),
    openDesignName: () => page.evaluate(() => window._fgLg.proy?.nombre ?? null),
    openDesignTabs: () =>
      page.locator("#fg-optbar .fgp").evaluateAll((tabs) =>
        tabs.map((tab) => ({
          name: tab.querySelector(".fgp-t")?.textContent ?? "",
          active: tab.classList.contains("on"),
        })),
      ),
    pressFlyerTab: (name) => page.locator("#fg-optbar .fgo", { hasText: name }).click(),
    draftCount: () => page.evaluate(() => window._fgProtos.filter(({ temp }) => temp).length),
    isDragging: () => page.evaluate(() => Boolean(window._fgLg.arrastre)),
    flyerLogosIn: (region) => flyerLogosIn(page, region),
    flyerLogoAt: (at) =>
      page.evaluate(({ x, y }) => {
        const logo = _fgLgDetectar(x, y);
        return { x: logo.x, y: logo.y, width: logo.w, height: logo.h };
      }, at),
    previewOnScreen: () =>
      page.locator(".prev").evaluate((preview) => {
        const { top, bottom } = preview.getBoundingClientRect();
        return { top, bottom };
      }),
    scrollPreviewBy: (pixels) =>
      page.locator(".prev").evaluate((preview, amount) => {
        preview.scrollTop += amount;
      }, pixels),
    cancelDragOnPlaced: async (index) => {
      const { x, y } = await placedOnScreen(page, index);
      await page.evaluate(
        (point) => {
          cv.dispatchEvent(
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

    leaveFields: () =>
      page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      }),
    focusCompanyField: () => page.locator("#empresa").click(),
    companyFieldValue: () => page.locator("#empresa").inputValue(),
    clearCompanyField: () => page.locator("#empresa").fill(""),

    waitForBrandList: () => waitForBrandList(page),
    waitForPicker: () =>
      page.locator(PICKER).waitFor({ state: "attached", timeout: PICKER_TIMEOUT_MS }),
    pickerStaysClosed: async () => {
      await page.waitForTimeout(QUIET_MOMENT_MS);
      return (await page.locator(PICKER).count()) === 0;
    },
    waitForPickerClosed: () => waitForPickerClosed(page),
    brandListVisible: () => page.locator("#fg-lg-list").isVisible(),
    searchBrands: (text) => searchPicker(page, text),
    pickFirstBrand: async () => {
      await page.locator(PICKER_ITEM).first().click();
      await waitForPickerClosed(page);
    },
    pickBrandsInOrder: (count) => pickBrandsInOrder(page, count),
    chooseLogoFile: (file) => page.locator("#fg-lg-file").setInputFiles(file),
    thumbnail: () => readThumbnail(page),
    pickerTargetIndex: () =>
      page.evaluate(() => {
        const place = window._fgLgV.det;
        return place ? _fgLgIndiceDe(place) : -1;
      }),
    textForm: () =>
      page.evaluate(() => ({
        text: document.querySelector<HTMLTextAreaElement>("#fg-lg-tx")?.value ?? "",
        size: Number(document.querySelector<HTMLInputElement>("#fg-lg-fs")?.value),
        colors: [...document.querySelectorAll<HTMLElement>(".fg-lg-col")].map(({ title }) => title),
        chosenColor: document.querySelector("#fg-lg-col-nom")?.textContent ?? "",
      })),
    thumbnailWithPlacedLogoOutOfMemory: (index) =>
      page.evaluate((at) => {
        const { img = "" } = _fgLgActivos()[at] ?? {};
        Reflect.deleteProperty(window._fgLg.imgs, img);
        document.querySelector<HTMLElement>("#fg-lg-herr button[data-a=cambiar]")?.click();
        const canvas = document.querySelector<HTMLCanvasElement>("#fg-lg-ori");
        if (!canvas) throw new Error("The window did not open");
        return {
          width: canvas.width,
          height: canvas.height,
          hidden: canvas.hidden === true,
          ink: 0,
        };
      }, index),

    readUploadedLogo: (drawing) => readUploadedLogo(page, drawing),
    cleanLogo: (image) => cleanLogo(page, image),

    openPickerForArea: ({ x, y, width, height }) =>
      page.evaluate(
        (box) => {
          Reflect.set(window._fgLg, "imgs", {});
          _fgLgAbrir(_fgLgManual(box.x, box.y, box.width, box.height));
        },
        { x, y, width, height },
      ),
    pressFirstBrand: () => page.locator(PICKER_ITEM).first().click(),
    placeBrandInArea: ({ x, y, width, height }, { image, title }) =>
      page.evaluate(
        ({ box, file, name }) => {
          _fgLgPoner(_fgLgManual(box.x, box.y, box.width, box.height), file, name, null);
        },
        { box: { x, y, width, height }, file: image, name: title },
      ),

    writeText: async (at, text) => {
      await touchFlyer(page, at);
      await page.locator("#fg-lg-escribir").click({ timeout: PICKER_TIMEOUT_MS });
      await page.locator("#fg-lg-tx").fill(text);
      await page.locator("#fg-lg-txt-ok").click();
      await page.locator(PICKER).waitFor({ state: "detached", timeout: PICKER_TIMEOUT_MS });
    },
    uploadLogo: async (at, file) => {
      await touchFlyer(page, at);
      const input = page.locator("#fg-lg-file");
      await input.waitFor({ state: "attached", timeout: PICKER_TIMEOUT_MS });
      await input.setInputFiles(file);
      await page.locator(PICKER).waitFor({ state: "detached", timeout: PICKER_TIMEOUT_MS });
    },
    isEditing: () => page.evaluate(() => window._fgLg.on),
    removeAllChanges: () =>
      page.evaluate(() => {
        _fgLg.list = [];
      }),
    resizeFirstChange: (percent) =>
      page.evaluate((value) => {
        window._fgLg.sel = 0;
        _fgLgTam(value);
      }, percent),
    shiftFirstChange: (pixels) =>
      page.evaluate((distance) => {
        const [first] = _fgLg.list;
        if (first) first.tx = (first.tx ?? 0) + distance;
        _fgLgListo();
      }, pixels),
    moveFirstChangeAsStep: (pixels) =>
      page.evaluate((distance) => {
        window._fgLg.sel = 0;
        _fgLgMover(distance, 0);
        _fgLgHistMarcar();
      }, pixels),
    writeUndoStep: () =>
      page.evaluate(() => {
        _fgLgHistMarcar();
      }),
  };
}
