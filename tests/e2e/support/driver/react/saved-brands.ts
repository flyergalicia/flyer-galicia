import { type Locator, type Page } from "@playwright/test";
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

const SHOWN_TIMEOUT_MS = 15_000;
const FREE_CARD = '[data-testid="brand-card"]:not([data-strip-number])';
const CATALOG_TABLE = "**/rest/v1/promos_galicia_cache*";
const BUTTONS: readonly PlacementButton[] = [
  "restore",
  "review",
  "keep",
  "placeSure",
  "back",
  "skip",
  "place",
  "finish",
];
const DRAG_STEPS = 4;
const DAY_MS = 86_400_000;

function isPlacementButton(name: string | null): name is PlacementButton {
  return BUTTONS.some((button) => button === name);
}

function placementBar(page: Page): Locator {
  return page.getByTestId("placement-bar");
}

function editorBar(page: Page): Locator {
  return page.getByTestId("logo-editor-bar");
}

function listWindow(page: Page): Locator {
  return page.getByRole("dialog", { name: "Marcas guardadas" });
}

function saveWindow(page: Page): Locator {
  return page.getByRole("dialog", { name: "Guardar las marcas de este flyer" });
}

function onePicker(page: Page): Locator {
  return page.getByRole("dialog", { name: /Cambiar esto|Agregar acá/ });
}

async function waitUntilIdle(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      !document.querySelector('[data-testid="placement-bar"][data-busy="true"]') &&
      window["__flyerProbe"]?.logoEditor?.().isSettled(),
    null,
    { timeout: SHOWN_TIMEOUT_MS },
  );
}

/** What the bar marks comes into view by itself, smoothly: first it has to stop. */
function bringIntoView(page: Page, y: number): Promise<void> {
  return page.evaluate(async (top) => {
    const preview = document.querySelector('[data-testid="flyer-preview"]');
    if (!preview) throw new Error("The preview is not on screen");
    let [last, still] = [preview.scrollTop, 0];
    while (still < 5) {
      await new Promise(requestAnimationFrame);
      still = preview.scrollTop === last ? still + 1 : 0;
      last = preview.scrollTop;
    }
    const point = window["__flyerProbe"]?.logoEditor?.().toClient(0, top);
    if (!point) throw new Error("The editor is not on screen");
    const box = preview.getBoundingClientRect();
    preview.scrollTop += point.y - (box.top + box.height / 2);
  }, y);
}

function screenPoint(page: Page, { x, y }: FlyerPoint): Promise<FlyerPoint> {
  return page.evaluate(
    ({ left, top }) => {
      const point = window["__flyerProbe"]?.logoEditor?.().toClient(left, top);
      if (!point) throw new Error("The editor is not on screen");
      return point;
    },
    { left: x, top: y },
  );
}

async function touch(page: Page, at: FlyerPoint): Promise<void> {
  await bringIntoView(page, at.y);
  const point = await screenPoint(page, at);
  await page.mouse.click(point.x, point.y);
}

async function dragBox(page: Page, box: FlyerBox): Promise<void> {
  await bringIntoView(page, box.y + box.height / 2);
  const from = await screenPoint(page, box);
  const to = await screenPoint(page, { x: box.x + box.width, y: box.y + box.height });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: DRAG_STEPS });
  await page.mouse.move(to.x, to.y, { steps: DRAG_STEPS });
  await page.mouse.up();
}

async function readBar(page: Page): Promise<PlacementBar> {
  const raw = await page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>('[data-testid="placement-bar"]');
    const read = (testId: string) =>
      bar?.querySelector(`[data-testid="${testId}"]`)?.textContent ?? "";
    const buttons = [...(bar?.querySelectorAll<HTMLButtonElement>("button[data-placement]") ?? [])];
    return {
      progress: read("placement-progress"),
      title: read("placement-title"),
      text: bar?.textContent ?? "",
      suggestionShown: Boolean(document.querySelector('[data-testid="placement-suggestion"]')),
      suggestionUncertain: Boolean(
        document.querySelector('[data-testid="placement-suggestion"][data-uncertain="true"]'),
      ),
      markedOnFlyer: document.querySelectorAll('[data-testid="placement-placed"]').length,
      buttons: buttons.map((button) => button.dataset["placement"] ?? ""),
      disabled: buttons
        .filter(({ disabled }) => disabled)
        .map((one) => one.dataset["placement"] ?? ""),
      mode: bar?.dataset["mode"] ?? null,
    };
  });
  const { disabled, mode, buttons, ...rest } = raw;
  return {
    ...rest,
    buttons: buttons.filter(isPlacementButton),
    disabledButtons: disabled.filter(isPlacementButton),
    mode: mode === "preview" || mode === "steps" ? mode : null,
  };
}

async function buildStrip(page: Page, box: FlyerBox, brands: number): Promise<string[]> {
  await editorBar(page).getByRole("button", { name: "Armar franja" }).click();
  await dragBox(page, box);
  const opened = page.getByRole("dialog", { name: "Armar franja" });
  await opened.getByTestId("brand-card").first().waitFor({ timeout: SHOWN_TIMEOUT_MS });
  for (let done = 0; done < brands; done += 1) {
    await opened.locator(FREE_CARD).first().click();
  }
  const chosen = await page.evaluate(() =>
    (window["__flyerProbe"]?.logoEditor?.().strip()?.brands ?? []).map(({ logo }) => logo),
  );
  await opened.getByRole("button", { name: /^Poner \d+ logos?$/ }).click();
  await opened.waitFor({ state: "detached", timeout: SHOWN_TIMEOUT_MS });
  return chosen;
}

function normalized(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replaceAll(" ", "");
}

async function putSupermarket(page: Page, at: FlyerPoint, name: string): Promise<void> {
  await touch(page, at);
  const window = onePicker(page);
  await window.getByTestId("brand-card").first().waitFor({ timeout: SHOWN_TIMEOUT_MS });
  await window.getByRole("combobox", { name: "Rubro" }).selectOption("Supermercados");
  await window.getByRole("searchbox", { name: "Buscar marca" }).fill(name);
  await window
    .locator(`[data-testid="brand-list"][data-search="${name}"]`)
    .waitFor({ timeout: SHOWN_TIMEOUT_MS });
  const titles = await window.getByTestId("brand-title").allTextContents();
  const found = titles.findIndex((title) => normalized(title) === name);
  if (found < 0) throw new Error(`No supermarket ${name}`);
  await window.getByTestId("brand-card").nth(found).click();
  await window.waitFor({ state: "detached", timeout: SHOWN_TIMEOUT_MS });
}

function readLayout(page: Page, brand: RegExp): Promise<FlyerLayout> {
  return page.evaluate(
    ({ source, flags }) => {
      const wanted = new RegExp(source, flags);
      const changes = [...(window["__flyerProbe"]?.logoEditor?.().placed() ?? [])];
      const strip = changes.find((change) => change.franjaBase);
      const found = changes.find((change) => wanted.test(change.t ?? ""));
      return {
        changes: changes.length,
        strip: strip
          ? { x: strip.ox ?? 0, y: strip.oy ?? 0, width: strip.ow ?? 0, height: strip.oh ?? 0 }
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

async function openList(page: Page): Promise<void> {
  if ((await listWindow(page).count()) > 0) return;
  const answered = page.waitForResponse(
    (response) =>
      response.url().includes("/rest/v1/flyer_disenos") && response.request().method() === "GET",
  );
  await editorBar(page).getByRole("button", { name: "Marcas guardadas" }).click();
  await answered;
  await page.evaluate(
    () =>
      new Promise((done) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(done);
        });
      }),
  );
}

async function openSaveWindow(page: Page): Promise<void> {
  await openList(page);
  await listWindow(page).getByRole("button", { name: "Guardar las de este flyer" }).click();
  await saveWindow(page).getByRole("textbox", { name: "Nombre" }).waitFor({
    timeout: SHOWN_TIMEOUT_MS,
  });
}

async function readSaveWindow(page: Page): Promise<SaveSetWindow> {
  const window = saveWindow(page);
  const target = window.getByRole("combobox", { name: "Guardar como" });
  const province = window.getByTestId("saved-set-province");
  return {
    replacing: (await target.count()) > 0 ? (await target.inputValue()) || null : null,
    name: await window.getByRole("textbox", { name: "Nombre" }).inputValue(),
    confirmLabel:
      (await window
        .getByRole("button", { name: /^(Guardar|Reemplazar|Guardando…)$/ })
        .textContent()) ?? "",
    province: (await province.count()) > 0 ? await province.inputValue() : null,
  };
}

async function pickProvince(page: Page, other: string): Promise<string> {
  const select = saveWindow(page).getByTestId("saved-set-province");
  const options = await select
    .locator("option")
    .evaluateAll((all) => all.map((option) => option.getAttribute("value") ?? ""));
  const wanted = options.find((value) => value && value !== other) ?? "";
  await select.selectOption(wanted);
  return wanted;
}

async function pressSave(page: Page): Promise<void> {
  await saveWindow(page)
    .getByRole("button", { name: /^(Guardar|Reemplazar)$/ })
    .click();
  await saveWindow(page).waitFor({ state: "detached", timeout: SHOWN_TIMEOUT_MS });
}

async function readList(page: Page): Promise<SavedSetRow[]> {
  await openList(page);
  return page.getByTestId("saved-set").evaluateAll((rows) =>
    rows.map((row) => ({
      title: row.querySelector("b")?.textContent ?? "",
      content: row.querySelector('[data-testid="saved-set-content"]')?.textContent ?? "",
      hasImage: Boolean(row.querySelector("img")),
      isOutdated: Boolean(row.querySelector('[data-testid="saved-set-outdated"]')),
    })),
  );
}

async function apply(page: Page, id: string): Promise<PlacementBar> {
  await openList(page);
  await page
    .locator(`[data-testid="saved-set"][data-set="${id}"]`)
    .getByRole("button", { name: "Aplicar" })
    .click();
  await placementBar(page).waitFor({ timeout: SHOWN_TIMEOUT_MS });
  await waitUntilIdle(page);
  return readBar(page);
}

async function placeAt(page: Page, { x, y, width, height }: FlyerBox): Promise<void> {
  if (width > 0) await dragBox(page, { x, y, width, height });
  else await touch(page, { x, y });
  await waitUntilIdle(page);
}

async function pressKey(page: Page, key: string): Promise<void> {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await page.keyboard.press(key);
  await waitUntilIdle(page);
}

async function clearFlyer(page: Page): Promise<void> {
  const button = editorBar(page).getByRole("button", {
    name: /^Volver (el cambio|los \d+ cambios) al original$/,
  });
  if ((await button.count()) > 0) await button.click();
  await waitUntilIdle(page);
}

/** The catalog of this page says otherwise, from the next time it is read. */
function catalogEdits(page: Page) {
  const edits = new Map<string, Record<string, unknown>>();
  let rows: readonly Record<string, unknown>[] = [];
  let isRouted = false;

  const edited = () =>
    rows.map((row) => {
      const edit = edits.get(String(row["imagen"]));
      return edit ? Object.assign({}, row, edit) : row;
    });

  const answerWithEdits = () =>
    page.route(CATALOG_TABLE, async (route) => {
      const url = new URL(route.request().url());
      const all = edited();
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? all.length);
      const part = all.slice(offset, offset + limit);
      await route.fulfill({
        json: part,
        headers: {
          "Content-Range": `${String(offset)}-${String(offset + part.length - 1)}/${String(all.length)}`,
        },
      });
    });

  const readAgain = async () => {
    const tabs = page.getByRole("banner").getByRole("tab");
    await tabs.filter({ hasText: /Promociones/ }).click();
    await page.getByRole("button", { name: "Actualizar catálogo ahora" }).click();
    await page.waitForFunction(
      (wanted) =>
        JSON.stringify(window["__flyerProbe"]?.logoEditor?.().catalogRows() ?? []) === wanted,
      JSON.stringify(edited()),
      { timeout: SHOWN_TIMEOUT_MS },
    );
    await tabs.first().click();
  };

  return {
    edit: async (image: string, fields: Record<string, unknown>) => {
      edits.set(image, { ...edits.get(image), ...fields });
      if (!isRouted) {
        isRouted = true;
        rows = await page.evaluate(() => [
          ...(window["__flyerProbe"]?.logoEditor?.().catalogRows() ?? []),
        ]);
        await answerWithEdits();
      }
      await readAgain();
    },
  };
}

interface Painting {
  readonly moves?: readonly BandMove[];
  readonly blank?: { readonly y: number; readonly height: number };
}

/** The bytes of a flyer with its bands somewhere else, or with one blank. */
function paintedArtwork(page: Page, original: string, { moves = [], blank }: Painting) {
  return page.evaluate(
    async ({ address, bands, emptied }) => {
      const image = new Image();
      await new Promise((resolve) => {
        image.addEventListener("load", resolve);
        image.src = address;
      });
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const graphics = canvas.getContext("2d");
      if (!graphics) throw new Error("No canvas context");
      graphics.drawImage(image, 0, 0);
      for (const { fromY, height, toY } of bands) {
        const copy = document.createElement("canvas");
        copy.width = canvas.width;
        copy.height = height;
        copy
          .getContext("2d")
          ?.drawImage(image, 0, fromY, canvas.width, height, 0, 0, canvas.width, height);
        graphics.fillStyle = "#fff";
        graphics.fillRect(0, fromY, canvas.width, height);
        graphics.fillRect(0, toY, canvas.width, height);
        graphics.drawImage(copy, 0, toY);
      }
      if (emptied) {
        graphics.fillStyle = "#fff";
        graphics.fillRect(0, emptied.y, canvas.width, emptied.height);
      }
      return canvas.toDataURL("image/jpeg", 0.92).split(",")[1] ?? "";
    },
    { address: original, bands: moves, emptied: blank ?? null },
  );
}

function optionOnScreen(page: Page): Promise<number> {
  return page.evaluate(
    () => window["__flyerProbe"]?.flyerWorkspace?.().getState().slot.option ?? 0,
  );
}

/**
 * A person cannot change the picture of a flyer: the administrator publishes a new one and whoever
 * enters afterwards sees it. So: the address of the picture answers with the new model, and the page
 * is loaded again.
 */
function artworkDriver(page: Page) {
  let original: { readonly address: string; readonly bytes: string } | null = null;
  let onOption: number | null = null;
  let isRouted = false;

  const wholeArt = () =>
    page.evaluate(() => {
      const scene = window["__flyerProbe"]?.flyerWorkspace?.().getState().slot.scene;
      if (!scene) throw new Error("There is no artwork");
      const canvas = document.createElement("canvas");
      canvas.width = scene.whole.art.width;
      canvas.height = scene.whole.art.height;
      canvas.getContext("2d")?.drawImage(scene.whole.art, 0, 0);
      return { address: scene.whole.artKey, bytes: canvas.toDataURL("image/jpeg", 0.95) };
    });

  const reenter = async () => {
    const option = onOption ?? (await optionOnScreen(page));
    onOption = option;
    await page.reload();
    const tab = page
      .getByTestId("flyer-options")
      .locator(`button[data-option="${String(option)}"]`);
    await tab.click({ timeout: SHOWN_TIMEOUT_MS });
    await page.waitForFunction(
      (wanted) => {
        const slot = window["__flyerProbe"]?.flyerWorkspace?.().getState().slot;
        return slot?.option === wanted && Boolean(slot.scene) && !slot.loading;
      },
      option,
      { timeout: SHOWN_TIMEOUT_MS },
    );
    await editorBar(page).getByRole("button", { name: "Cambiar logos" }).click();
    await page.waitForFunction(
      () => (window["__flyerProbe"]?.logoEditor?.().catalogSize() ?? 0) > 0,
      null,
      { timeout: SHOWN_TIMEOUT_MS },
    );
  };

  const useArtwork = async (painting: Painting) => {
    original ??= await wholeArt();
    const bytes = await paintedArtwork(page, original.bytes, painting);
    const body = Buffer.from(bytes, "base64");
    if (isRouted) await page.unroute(original.address);
    isRouted = true;
    await page.route(original.address, (route) =>
      route.fulfill({
        body,
        contentType: "image/jpeg",
        headers: { "Access-Control-Allow-Origin": "*" },
      }),
    );
    await reenter();
  };

  return {
    useArtworkWithMovedBands: (moves: BandMove[]) => useArtwork({ moves }),
    useArtworkWithBlankBand: (y: number, height: number) => useArtwork({ blank: { y, height } }),
    changeArtworkDuringPlacement: async () => {
      await page
        .getByTestId("flyer-options")
        .locator('button[data-option][aria-pressed="false"]')
        .last()
        .click();
      await placementBar(page).waitFor({ state: "detached", timeout: SHOWN_TIMEOUT_MS });
    },
    restoreArtwork: async () => {
      if (original && isRouted) await page.unroute(original.address);
      isRouted = false;
      await reenter();
    },
  };
}

function twoDaysAgo(): string {
  return new Date(Date.now() - 2 * DAY_MS).toISOString().slice(0, 10);
}

export function createReactSavedBrandsDriver(page: Page): SavedBrandsDriver {
  const catalog = catalogEdits(page);
  return {
    buttonVisible: () =>
      editorBar(page).getByRole("button", { name: "Marcas guardadas" }).isVisible(),
    buildStrip: (box, brands) => buildStrip(page, box, brands),
    putSupermarket: (at, name) => putSupermarket(page, at, name),
    emptyPlace: async (at) => {
      await touch(page, at);
      await onePicker(page).getByRole("button", { name: "Dejar el lugar vacío" }).click();
      await onePicker(page).waitFor({ state: "detached", timeout: SHOWN_TIMEOUT_MS });
    },
    finishChanges: async () => {
      await page.keyboard.press("Escape");
      await waitUntilIdle(page);
    },
    layout: (brand) => readLayout(page, brand),
    brandOnlyInProvince: (image, province) => catalog.edit(image, { provincias: [province] }),
    brandExpired: (image) =>
      catalog.edit(image, { fecha_hasta: twoDaysAgo(), proximamente: false }),
    openSaveWindow: () => openSaveWindow(page),
    openSaveWindowDirectly: () => openSaveWindow(page),
    saveWindow: () => readSaveWindow(page),
    pickProvinceOtherThan: (province) => pickProvince(page, province),
    saveAs: async (name) => {
      await saveWindow(page).getByRole("textbox", { name: "Nombre" }).fill(name);
      await pressSave(page);
    },
    confirmSaveWindow: () => pressSave(page),
    readList: () => readList(page),
    closeList: () => listWindow(page).getByRole("button", { name: "Cerrar" }).click(),
    apply: (id) => apply(page, id),
    bar: () => readBar(page),
    press: async (button) => {
      await placementBar(page).locator(`[data-placement="${button}"]`).click();
      await waitUntilIdle(page);
    },
    touchStep: async (step) => {
      await placementBar(page)
        .locator(`[data-step="${String(step)}"]`)
        .click();
      await waitUntilIdle(page);
    },
    placeAt: (box) => placeAt(page, box),
    pressKey: (key) => pressKey(page, key),
    acceptAll: async () => {
      for (let press = 0; press < 6; press += 1) {
        if ((await placementBar(page).count()) === 0) return;
        await pressKey(page, "Enter");
      }
    },
    traces: () =>
      page.evaluate(() => ({
        placing: Boolean(window["__flyerProbe"]?.logoEditor?.().isPlacing()),
        bar: Boolean(document.querySelector('[data-testid="placement-bar"]')),
        suggestion: Boolean(document.querySelector('[data-testid="placement-suggestion"]')),
        marks: Boolean(document.querySelector('[data-testid="placement-marks"]')),
      })),
    marks: () =>
      page.evaluate(() => {
        const placed = window["__flyerProbe"]?.logoEditor?.().placed() ?? [];
        const markers = document.querySelectorAll<HTMLElement>('[data-testid="logo-marker"]');
        return placed.map((change, index) => ({
          image: change.img ?? "",
          outOfProvince: markers[index]?.dataset["note"] === "province",
          note: markers[index]?.dataset["noteText"] ?? "",
        }));
      }),
    expiredMarks: () => page.locator('[data-testid="logo-marker"][data-note="expired"]').count(),
    clearFlyer: () => clearFlyer(page),
    undoOnce: async () => {
      await waitUntilIdle(page);
      await editorBar(page).getByRole("button", { name: "Deshacer" }).click();
      await waitUntilIdle(page);
    },
    leaveEditor: async () => {
      await editorBar(page).getByRole("button", { name: "Listo" }).click();
      await waitUntilIdle(page);
    },
    reenterEditorClean: async () => {
      await editorBar(page).getByRole("button", { name: "Cambiar logos" }).click();
      await clearFlyer(page);
    },
    ...artworkDriver(page),
  };
}
