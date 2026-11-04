import { type Page } from "@playwright/test";
import { type FlyerPoint } from "../logo-editor.ts";
import {
  type BandMove,
  type FlyerBox,
  type FlyerLayout,
  type PlacementBar,
  type PlacementButton,
  type SaveSetWindow,
  type SavedBrandsDriver,
  type SavedSetRow,
} from "../saved-brands.ts";

const BAR = "#mg-paso";
const SHOWN_TIMEOUT_MS = 15_000;
const SOON_TIMEOUT_MS = 8000;
const STRIP_CLOSED_TIMEOUT_MS = 20_000;
// The bar animates and the flyer redraws a moment after it stops being busy.
const IDLE_SETTLE_MS = 250;
// A change becomes an undo step 450 ms after the last touch.
const UNDO_STEP_SETTLE_MS = 600;
const SHORT_SETTLE_MS = 200;
const MAX_ENTER_PRESSES = 6;
const BUTTONS: readonly (readonly [PlacementButton, string])[] = [
  ["restore", "volver"],
  ["review", "revisar"],
  ["keep", "dejar"],
  ["placeSure", "seguros"],
  ["back", "atras"],
  ["skip", "saltar"],
  ["place", "poner"],
  ["finish", "fin"],
];
const BUTTON_OF_NAME = new Map(BUTTONS.map(([button, name]) => [name, button]));
const NAME_OF_BUTTON = new Map(BUTTONS);

function buttonsFrom(names: string[]): PlacementButton[] {
  return names.flatMap((name) => {
    const button = BUTTON_OF_NAME.get(name);
    return button ? [button] : [];
  });
}

async function waitUntilIdle(page: Page): Promise<void> {
  await page.waitForFunction(() => !_mgPaso?.ocupado, null, { timeout: SHOWN_TIMEOUT_MS });
  await page.waitForTimeout(IDLE_SETTLE_MS);
}

async function readBar(page: Page): Promise<PlacementBar> {
  const raw = await page.evaluate(() => {
    const bar = document.getElementById("mg-paso");
    const read = (selector: string) => bar?.querySelector(selector)?.textContent ?? "";
    const buttons = [
      ...document.querySelectorAll<HTMLButtonElement>("#mg-paso button[data-mp]"),
    ].filter((button) => button.getAttribute("data-mp") !== "ir");
    return {
      progress: read(".mg-pb-que"),
      title: read(".mg-pb-tit"),
      text: read(".mg-pb-txt"),
      suggestionShown: Boolean(document.getElementById("mg-sug")),
      suggestionUncertain: Boolean(document.querySelector("#mg-sug.aprox")),
      markedOnFlyer: document.querySelectorAll("#mg-sugs .mg-sug.vista").length,
      buttons: buttons.map((button) => button.getAttribute("data-mp") ?? ""),
      disabled: buttons
        .filter((button) => button.disabled)
        .map((button) => button.getAttribute("data-mp") ?? ""),
      mode: _mgPaso?.modo ?? null,
    };
  });
  const { disabled, mode, ...rest } = raw;
  const modes: Record<string, PlacementBar["mode"]> = { vista: "preview", paso: "steps" };
  return {
    ...rest,
    buttons: buttonsFrom(raw.buttons),
    disabledButtons: buttonsFrom(disabled),
    mode: mode === null ? null : (modes[mode] ?? null),
  };
}

function buildStrip(page: Page, box: FlyerBox, brands: number): Promise<string[]> {
  return page.evaluate(
    async ({ x, y, width, height, wanted }) => {
      window._fgLgV.prov = "";
      window._fgLgV.conDias = true;
      _fgFrAbrir(_fgLgManual(x, y, width, height));
      while (!document.querySelector("#fg-fr-ov .fg-lg-it")) {
        await new Promise((resolve) => {
          setTimeout(resolve, 50);
        });
      }
      const strip = _fgFrSt;
      for (const hit of strip.res) {
        if (strip.sel.length >= wanted) break;
        if (_fgLgVencida({ img: hit.imagen })) continue;
        await _fgLgTraer(hit.imagen);
        strip.sel.push({ img: hit.imagen, t: hit.titulo });
      }
      _fgFrLista();
      _fgFrSelPintar();
      _fgFrPreview();
      return strip.sel.map((brand) => brand.img);
    },
    { ...box, wanted: brands },
  );
}

async function closeStripWindow(page: Page): Promise<void> {
  await page.locator("#fg-fr-ok").click();
  await page.locator("#fg-fr-ov").waitFor({ state: "detached", timeout: STRIP_CLOSED_TIMEOUT_MS });
}

function putSupermarket(page: Page, at: FlyerPoint, name: string): Promise<void> {
  return page.evaluate(
    async ({ x, y, wanted }) => {
      const promotion = (window._promosCat ?? []).find(
        (row) =>
          row.subtitulo === "Supermercados" &&
          _promoNormalizar(row.titulo).replace(/ /g, "") === wanted,
      );
      if (!promotion) throw new Error(`No supermarket ${wanted}`);
      const logo = await _fgLgTraer(promotion.imagen);
      _fgLgPonerMarca(_fgLgDetectar(x, y), promotion, logo, true);
    },
    { ...at, wanted: name },
  );
}

function readLayout(page: Page, brand: RegExp): Promise<FlyerLayout> {
  return page.evaluate(
    ({ source, flags }) => {
      const wanted = new RegExp(source, flags);
      const changes = _fgLgActivos();
      const strip = changes.find((change) => change.franjaBase);
      const found = changes.find((change) => wanted.test(change.t ?? ""));
      return {
        changes: changes.length,
        strip: strip
          ? {
              x: strip.ox ?? 0,
              y: strip.oy ?? 0,
              width: strip.ow ?? 0,
              height: strip.oh ?? 0,
            }
          : null,
        stripBrands: changes
          .filter((change) => change.franja && !change.franjaBase && change.tipo !== "txt")
          .map((change) => change.img ?? ""),
        brand: found
          ? {
              centerX: (found.tx ?? 0) + (found.tw ?? 0) / 2,
              centerY: (found.ty ?? 0) + (found.th ?? 0) / 2,
            }
          : null,
        texts: changes
          .filter((change) => change.tipo === "txt" && !change.franja)
          .map((change) => change.texto ?? "")
          .toSorted((a, b) => a.localeCompare(b)),
        emptyPlaces: changes.filter(
          (change) =>
            !change.img &&
            change.tipo !== "txt" &&
            !change.franjaBase &&
            !change.franja &&
            (change.w ?? 0) > 0,
        ).length,
      };
    },
    { source: brand.source, flags: brand.flags },
  );
}

function readSaveWindow(page: Page): Promise<SaveSetWindow> {
  return page.evaluate(() => {
    const window = document.querySelector("#fg-mgg-ov");
    const value = (id: string) =>
      window?.querySelector<HTMLSelectElement | HTMLInputElement>(`#${id}`)?.value ?? null;
    return {
      replacing: value("fg-mgg-dest"),
      name: value("fg-mgg-nom") ?? "",
      confirmLabel: document.getElementById("fg-mgg-ok")?.textContent ?? "",
      province: value("fg-mgg-prov"),
    };
  });
}

function pickProvince(page: Page, province: string): Promise<string> {
  return page.evaluate((other) => {
    const select = document.querySelector<HTMLSelectElement>("#fg-mgg-prov");
    if (!select) return "";
    const option = [...select.options].find((item) => item.value && item.value !== other);
    select.value = option?.value ?? "";
    return select.value;
  }, province);
}

async function saveAs(page: Page, name: string): Promise<void> {
  await page.locator("#fg-mgg-nom").fill(name);
  await page.locator("#fg-mgg-ok").click();
  await page
    .waitForFunction((saved) => _MG.lista?.some((row) => row.nombre === saved), name, {
      timeout: SOON_TIMEOUT_MS,
    })
    .catch(() => undefined);
}

async function readList(page: Page): Promise<SavedSetRow[]> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        _MG.lista = null;
        fgMarcasGuardadas();
        _mgCargar(() => {
          _mgPintarListas();
          resolve();
        });
      }),
  );
  return page.locator("#fg-mg-lista .mg-fila").evaluateAll((rows) =>
    rows.map((row) => ({
      title: row.querySelector("b")?.textContent ?? "",
      content: row.querySelector(".mg-fila-c")?.textContent ?? "",
      hasImage: Boolean(row.querySelector(".mg-fila-img img")),
      isOutdated: Boolean(row.querySelector(".mg-vieja")),
    })),
  );
}

async function apply(page: Page, id: string): Promise<PlacementBar> {
  await page.evaluate((design) => {
    fgMgAplicar(design);
  }, id);
  await page.waitForFunction(() => Boolean(_mgPaso) && !_mgPaso?.ocupado, null, {
    timeout: SHOWN_TIMEOUT_MS,
  });
  await page.waitForTimeout(IDLE_SETTLE_MS);
  return readBar(page);
}

async function placeAt(page: Page, { x, y, width, height }: FlyerBox): Promise<void> {
  await page.evaluate(
    (box) => {
      const canvas = document.getElementById("cv");
      if (!canvas) throw new Error("The flyer is not on screen");
      const origin = canvas.getBoundingClientRect();
      const screen = _fgLgAPantalla(box.x, box.y, box.width, box.height);
      const left = origin.left + screen.l;
      const top = origin.top + screen.t;
      _mgPasoTocar(left, top, left + screen.w, top + screen.h, box.width > 0);
    },
    { x, y, width, height },
  );
  await waitUntilIdle(page);
}

async function pressKey(page: Page, key: string): Promise<void> {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await page.keyboard.press(key);
  await waitUntilIdle(page);
}

async function acceptAll(page: Page): Promise<void> {
  for (let press = 0; press < MAX_ENTER_PRESSES; press += 1) {
    if (!(await page.evaluate(() => Boolean(_mgPaso)))) return;
    await page.evaluate(() => {
      _mgPasoEnter();
    });
    await waitUntilIdle(page);
  }
}

function useArtworkWithMovedBands(page: Page, moves: BandMove[]): Promise<void> {
  return page.evaluate(async (bands) => {
    const original = window.__savedBrandsArtwork ?? baseImg;
    if (!original) throw new Error("There is no artwork");
    window.__savedBrandsArtwork = original;
    const canvas = document.createElement("canvas");
    canvas.width = original.width;
    canvas.height = original.height;
    const graphics = canvas.getContext("2d");
    if (!graphics) throw new Error("No canvas context");
    graphics.drawImage(original, 0, 0);
    for (const { fromY, height, toY } of bands) {
      const copy = document.createElement("canvas");
      copy.width = original.width;
      copy.height = height;
      copy
        .getContext("2d")
        ?.drawImage(original, 0, fromY, original.width, height, 0, 0, original.width, height);
      graphics.fillStyle = "#fff";
      graphics.fillRect(0, fromY, original.width, height);
      graphics.fillRect(0, toY, original.width, height);
      graphics.drawImage(copy, 0, toY);
    }
    const image = new Image();
    await new Promise((resolve) => {
      image.addEventListener("load", resolve);
      image.src = canvas.toDataURL("image/jpeg", 0.92);
    });
    window.baseImg = image;
    _fgLg.list = [];
    window._fgLg.src = _fgLgSrc();
    window._fgLg.sel = -1;
  }, moves);
}

function useArtworkWithBlankBand(page: Page, y: number, height: number): Promise<void> {
  return page.evaluate(
    async ({ top, rows }) => {
      const original = window.__savedBrandsArtwork;
      if (!original) throw new Error("There is no artwork");
      const canvas = document.createElement("canvas");
      canvas.width = original.width;
      canvas.height = original.height;
      const graphics = canvas.getContext("2d");
      if (!graphics) throw new Error("No canvas context");
      graphics.drawImage(original, 0, 0);
      graphics.fillStyle = "#fff";
      graphics.fillRect(0, top, original.width, rows);
      const image = new Image();
      await new Promise((resolve) => {
        image.addEventListener("load", resolve);
        image.src = canvas.toDataURL("image/jpeg", 0.92);
      });
      window.baseImg = image;
      _fgLg.list = [];
      window._fgLg.src = _fgLgSrc();
      window._fgLg.sel = -1;
    },
    { top: y, rows: height },
  );
}

function changeArtworkDuringPlacement(page: Page): Promise<void> {
  return page.evaluate(async () => {
    const image = new Image();
    await new Promise((resolve) => {
      image.addEventListener("load", resolve);
      image.src = window.__savedBrandsArtwork?.src ?? "";
    });
    window.baseImg = image;
    redrawNow();
    _fgLgMarcas();
  });
}

function preparingDriver(page: Page) {
  return {
    buildStrip: async (box: FlyerBox, brands: number) => {
      const chosen = await buildStrip(page, box, brands);
      await closeStripWindow(page);
      return chosen;
    },
    putSupermarket: (at: FlyerPoint, name: string) => putSupermarket(page, at, name),
    emptyPlace: (at: FlyerPoint) =>
      page.evaluate(({ x, y }) => {
        _fgLgPoner(_fgLgDetectar(x, y), "", "", null);
      }, at),
    finishChanges: () =>
      page.evaluate(() => {
        window._fgLg.sel = -1;
        _fgLgListo();
      }),
    layout: (brand: RegExp) => readLayout(page, brand),
    brandOnlyInProvince: (image: string, province: string) =>
      page.evaluate(
        ({ file, only }) => {
          const edited = (window._promosCat ?? []).map((row) =>
            row.imagen === file ? Object.assign({}, row, { provincias: [only] }) : row,
          );
          Reflect.set(window, "_promosCat", edited);
        },
        { file: image, only: province },
      ),
    brandExpired: (image: string) =>
      page.evaluate((file) => {
        const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000);
        const date = [
          twoDaysAgo.getFullYear(),
          String(twoDaysAgo.getMonth() + 1).padStart(2, "0"),
          String(twoDaysAgo.getDate()).padStart(2, "0"),
        ].join("-");
        const edited = (window._promosCat ?? []).map((row) =>
          row.imagen === file
            ? Object.assign({}, row, { fecha_hasta: date, proximamente: false })
            : row,
        );
        Reflect.set(window, "_promosCat", edited);
      }, image),
  };
}

function savingDriver(page: Page) {
  return {
    openSaveWindow: async () => {
      await page.evaluate(() => {
        fgMarcasGuardadas();
      });
      await page.locator("#fg-mg-g").click({ timeout: SOON_TIMEOUT_MS });
      await page.locator("#fg-mgg-nom").waitFor({ timeout: SOON_TIMEOUT_MS });
    },
    openSaveWindowDirectly: async () => {
      await page.evaluate(() => {
        _mgGuardar();
      });
      await page.locator("#fg-mgg-nom").waitFor({ timeout: SOON_TIMEOUT_MS });
    },
    saveWindow: () => readSaveWindow(page),
    pickProvinceOtherThan: (province: string) => pickProvince(page, province),
    saveAs: (name: string) => saveAs(page, name),
    confirmSaveWindow: async () => {
      await page.locator("#fg-mgg-ok").click();
      await page
        .locator("#fg-mgg-ov")
        .waitFor({ state: "detached", timeout: SOON_TIMEOUT_MS })
        .catch(() => undefined);
    },
    readList: () => readList(page),
    closeList: () =>
      page.evaluate(() => {
        document.getElementById("fg-mg-ov")?.remove();
        _MG.lista = null;
      }),
  };
}

function placingDriver(page: Page) {
  return {
    apply: (id: string) => apply(page, id),
    bar: () => readBar(page),
    press: async (button: PlacementButton) => {
      await page.locator(`${BAR} button[data-mp=${NAME_OF_BUTTON.get(button) ?? ""}]`).click();
      await waitUntilIdle(page);
    },
    touchStep: async (step: number) => {
      await page.locator(`${BAR} .mg-pb-pts button[data-k="${String(step)}"]`).click();
      await waitUntilIdle(page);
    },
    placeAt: (box: FlyerBox) => placeAt(page, box),
    pressKey: (key: string) => pressKey(page, key),
    acceptAll: () => acceptAll(page),
    traces: () =>
      page.evaluate(() => ({
        placing: Boolean(_mgPaso),
        bar: Boolean(document.getElementById("mg-paso")),
        suggestion: Boolean(document.getElementById("mg-sug")),
        marks: Boolean(document.getElementById("mg-sugs")),
      })),
    marks: () =>
      page.evaluate(() => {
        const marks = document.getElementById("fg-lg-mk")?.children;
        return _fgLgActivos().map((change, index) => ({
          image: change.img ?? "",
          outOfProvince: Boolean(marks?.[index]?.classList.contains("fueraprov")),
          note: marks?.[index]?.getAttribute("data-v") ?? "",
        }));
      }),
    expiredMarks: () => page.locator("#fg-lg-mk .fg-lg-marca.vencida").count(),
    clearFlyer: async () => {
      await page.evaluate(() => {
        _fgLg.list = [];
        window._fgLg.sel = -1;
        _fgLgListo();
      });
      await page.waitForTimeout(UNDO_STEP_SETTLE_MS);
    },
    undoOnce: async () => {
      await page.waitForTimeout(UNDO_STEP_SETTLE_MS);
      await page.evaluate(() => {
        fgLgDeshacer();
      });
      await page.waitForTimeout(SHORT_SETTLE_MS);
    },
    leaveEditor: async () => {
      await page.evaluate(() => {
        fgLogosModo(false);
      });
      await page.waitForTimeout(IDLE_SETTLE_MS);
    },
    reenterEditorClean: async () => {
      await page.evaluate(() => {
        fgLogosModo(true);
        _fgLg.list = [];
        window._fgLg.sel = -1;
        _fgLgListo();
      });
      await page.waitForTimeout(UNDO_STEP_SETTLE_MS);
    },
  };
}

function artworkDriver(page: Page) {
  return {
    useArtworkWithMovedBands: (moves: BandMove[]) => useArtworkWithMovedBands(page, moves),
    useArtworkWithBlankBand: (y: number, height: number) =>
      useArtworkWithBlankBand(page, y, height),
    changeArtworkDuringPlacement: () => changeArtworkDuringPlacement(page),
    restoreArtwork: () =>
      page.evaluate(() => {
        window.baseImg = window.__savedBrandsArtwork ?? window.baseImg;
        _fgLg.list = [];
        window._fgLg.src = _fgLgSrc();
      }),
  };
}

export function createLegacySavedBrandsDriver(page: Page): SavedBrandsDriver {
  return {
    buttonVisible: () => page.locator("#fg-lg-mg").isVisible(),
    ...preparingDriver(page),
    ...savingDriver(page),
    ...placingDriver(page),
    ...artworkDriver(page),
  };
}
