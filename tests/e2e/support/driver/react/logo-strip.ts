import { type Locator, type Page } from "@playwright/test";
import { type FlyerRegion } from "../flyer-editor.ts";
import { type FlyerPoint } from "../logo-editor.ts";
import {
  type BrandFilters,
  type BrandValidityChange,
  type ChooserRow,
  type LogoStripDriver,
  type StripChange,
} from "../logo-strip.ts";
import type { ProbedChange } from "./globals.d.ts";
import { createReactLogoEditorDriver } from "./logo-editor.ts";
import { partialDriver } from "./pending.ts";
import { createReactPromotionsDriver } from "./promotions.ts";

const OPEN_TIMEOUT_MS = 15_000;
const PUT_TIMEOUT_MS = 20_000;
const LOGOS_TIMEOUT_MS = 30_000;
const DAY_MS = 86_400_000;
const CATALOG_TABLE = "**/rest/v1/promos_galicia_cache*";
const FREE_CARD = '[data-testid="brand-card"]:not([data-strip-number])';
const PICK_BUTTON = '[data-testid="pick-brand"]';
const FREE_PICK = `${PICK_BUTTON}:not([aria-pressed="true"]):not([disabled])`;
const ENABLED_PICK = `${PICK_BUTTON}:not([disabled])`;
const CHOSEN_PICK = `${PICK_BUTTON}[aria-pressed="true"]`;
const HIDE_ONLINE_ACTIVE = "Ocultar las de compra online";

function theWindow(page: Page): Locator {
  return page.getByRole("dialog", { name: "Armar franja" });
}

function onePicker(page: Page): Locator {
  return page.getByRole("dialog", { name: /Cambiar esto|Agregar acá|Reemplazar \d+ lugares/ });
}

function chooserBar(page: Page): Locator {
  return page.getByTestId("picking-bar");
}

function adjustBar(page: Page): Locator {
  return page.getByRole("toolbar", { name: "Ajustar el elemento elegido" });
}

function editorBar(page: Page): Locator {
  return page.getByTestId("logo-editor-bar");
}

function selectionRow(page: Page, index: number): Locator {
  return page.locator(`[data-testid="strip-row"][data-index="${String(index)}"]`);
}

function currentStrip(page: Page) {
  return page.evaluate(() => {
    const strip = window["__flyerProbe"]?.logoEditor?.().strip();
    if (!strip) throw new Error("The window of the strip is not open");
    return strip;
  });
}

async function waitForWindow(page: Page): Promise<void> {
  await theWindow(page).getByTestId("brand-card").first().waitFor({ timeout: OPEN_TIMEOUT_MS });
}

async function waitForWindowClosed(page: Page): Promise<void> {
  await theWindow(page).waitFor({ state: "detached", timeout: PUT_TIMEOUT_MS });
}

async function search(page: Page, text: string): Promise<void> {
  await theWindow(page).getByRole("searchbox", { name: "Buscar marca" }).fill(text);
  // The search box waits for a pause in the typing before it filters the list.
  await theWindow(page)
    .locator('[data-testid="brand-list"]')
    .and(page.locator(`[data-search="${text}"]`))
    .waitFor({ timeout: OPEN_TIMEOUT_MS });
}

async function logosOfSelection(page: Page): Promise<string[]> {
  return (await currentStrip(page)).brands.map(({ logo }) => logo);
}

async function tickNext(page: Page, count: number): Promise<void> {
  for (let done = 0; done < count; done += 1) {
    await theWindow(page).locator(FREE_CARD).first().click();
  }
}

async function tickNextAvoiding(
  page: Page,
  count: number,
  avoid: readonly string[],
): Promise<string[]> {
  for (;;) {
    const logos = await logosOfSelection(page);
    if (logos.length >= count) return logos;
    const offers = await theWindow(page)
      .locator(FREE_CARD)
      .evaluateAll((cards) => cards.map((card) => card.getAttribute("data-logo") ?? ""));
    const next = offers.find((logo) => !avoid.includes(logo));
    if (next === undefined) throw new Error("The list has no other brand to tick");
    await theWindow(page).locator(`${FREE_CARD}[data-logo="${next}"]`).click();
  }
}

function normalized(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

/** As a person does: their category, each one by its name. */
async function chooseExactBrands(
  page: Page,
  names: readonly string[],
  category: string,
): Promise<void> {
  await theWindow(page).getByRole("combobox", { name: "Rubro" }).selectOption(category);
  for (const name of names) {
    await search(page, name);
    const titles = await theWindow(page)
      .locator(`${FREE_CARD} [data-testid="brand-title"]`)
      .allTextContents();
    const at = titles.findIndex((title) => normalized(title) === name);
    if (at < 0) throw new Error(`The catalog has no brand "${name}"`);
    await theWindow(page).locator(FREE_CARD).nth(at).click();
  }
  await search(page, "");
}

async function dragBrandRow(page: Page, from: number, to: number): Promise<void> {
  const start = await selectionRow(page, from).boundingBox();
  const end = await selectionRow(page, to).boundingBox();
  if (!start || !end) throw new Error("The rows of the selection are not on screen");
  const x = start.x + start.width / 2;
  const y = start.y + start.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 20, { steps: 4 });
  await page.mouse.move(end.x + end.width / 2, end.y + 4, { steps: 8 });
  await page.mouse.up();
}

/** Playwright has no finger that drags: the events a finger on the handle sends. */
function dragBrandRowWithFinger(page: Page, from: number, belowRow: number): Promise<void> {
  return page.evaluate(
    ({ source, target }) => {
      const rows = [...document.querySelectorAll('[data-testid="strip-row"]')];
      const handle = rows[source]?.querySelector('[data-testid="strip-row-handle"]');
      const list = document.querySelector('[data-testid="strip-selection"]');
      const last = rows[target];
      if (!handle || !list || !last) throw new Error("The selection is not on screen");
      const box = handle.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      const end = last.getBoundingClientRect().bottom + 5;
      const fire = (type: string, clientY: number): PointerEvent =>
        new PointerEvent(type, {
          pointerType: "touch",
          pointerId: 7,
          clientX: x,
          clientY,
          bubbles: true,
          isPrimary: true,
        });
      handle.dispatchEvent(fire("pointerdown", y));
      list.dispatchEvent(fire("pointermove", y + 20));
      list.dispatchEvent(fire("pointermove", end));
      list.dispatchEvent(fire("pointerup", end));
    },
    { source: from, target: belowRow },
  );
}

async function previewPoint(page: Page, index: number): Promise<{ x: number; y: number }> {
  const { drawing } = await currentStrip(page);
  const box = drawing.boxes[index];
  const place = await page.getByTestId("strip-preview").boundingBox();
  if (!box || !place || !drawing.width) throw new Error("That logo is not drawn in the preview");
  const scale = place.width / drawing.width;
  return {
    x: place.x + (box.tx + box.tw / 2 - drawing.x0) * scale,
    y: place.y + (box.ty + box.th / 2 - drawing.y0) * scale,
  };
}

async function readFilters(opened: Locator): Promise<BrandFilters> {
  const province = await opened.getByTestId("brand-province").inputValue();
  const locality = opened.getByTestId("brand-locality");
  const hideOnline = await opened
    .getByRole("checkbox", { name: "Sin las de compra online" })
    .isChecked();
  return {
    province,
    locality: (await locality.count()) > 0 ? await locality.inputValue() : "",
    category: await opened.getByRole("combobox", { name: "Rubro" }).inputValue(),
    joinBranches: await opened
      .getByRole("checkbox", { name: "Juntar sucursales de la misma marca" })
      .isChecked(),
    hideOnline,
    hideOnlineTicked: hideOnline,
  };
}

function regionOf(
  x: number | undefined,
  y: number | undefined,
  width: number | undefined,
  height: number | undefined,
): FlyerRegion | null {
  const isComplete =
    x !== undefined && y !== undefined && width !== undefined && height !== undefined;
  return isComplete ? { x, y, width, height } : null;
}

function describeChange(entry: ProbedChange): StripChange {
  const logo = entry.img ?? "";
  const kind: StripChange["kind"] = entry.tipo === "txt" ? "text" : logo ? "brand" : "empty";
  return {
    strip: entry.franja ?? null,
    isCover: Boolean(entry.franjaBase),
    kind,
    isMovedOriginal: logo.startsWith("orig:"),
    logo,
    title: entry.t ?? "",
    text: entry.texto ?? null,
    fontSize: entry.fs ?? null,
    box: regionOf(entry.tx, entry.ty, entry.tw, entry.th),
    origin: regionOf(entry.ox, entry.oy, entry.ow, entry.oh),
  };
}

async function placedChanges(page: Page): Promise<ProbedChange[]> {
  return page.evaluate(() => [...(window["__flyerProbe"]?.logoEditor?.().placed() ?? [])]);
}

async function firstLogoOfStrip(page: Page, strip: string): Promise<number> {
  const at = (await placedChanges(page)).findIndex(
    ({ franja, franjaBase }) => franja === strip && !franjaBase,
  );
  if (at < 0) throw new Error(`The strip ${strip} has no logos`);
  return at;
}

function dayFromToday(days: number): string {
  const date = new Date(Date.now() + days * DAY_MS);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${String(date.getFullYear())}-${month}-${day}`;
}

type CatalogRow = Record<string, unknown> & { imagen?: string | null };

function withValidity(
  rows: readonly CatalogRow[],
  changes: readonly BrandValidityChange[],
): CatalogRow[] {
  const result = rows.map((row) => Object.assign({}, row));
  let nextId = 999_991;
  for (const { logo, expiresInDays, upcomingEndingInDays } of changes) {
    const ofLogo = result.filter(({ imagen }) => imagen === logo);
    for (const row of ofLogo) {
      row["fecha_hasta"] = dayFromToday(expiresInDays);
      row["proximamente"] = false;
    }
    const [first] = ofLogo;
    if (first && upcomingEndingInDays !== undefined) {
      result.push(
        Object.assign({}, first, {
          id: nextId,
          fecha_hasta: dayFromToday(upcomingEndingInDays),
          proximamente: true,
        }),
      );
      nextId += 1;
    }
  }
  return result;
}

function goToFlyer(page: Page): Promise<void> {
  return page.getByRole("banner").getByRole("tab").first().click();
}

/**
 * From now on this browser reads another catalog, and a person brings it with "Actualizar catálogo
 * ahora". The list on the flyer stays where it is meanwhile.
 */
async function changeBrandValidity(
  page: Page,
  changes: readonly BrandValidityChange[],
): Promise<void> {
  const rows = await page.evaluate(() => [
    ...(window["__flyerProbe"]?.logoEditor?.().catalogRows() ?? []),
  ]);
  const changed = withValidity(rows, changes);
  await page.route(CATALOG_TABLE, async (route) => {
    const url = new URL(route.request().url());
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? changed.length);
    const part = changed.slice(offset, offset + limit);
    await route.fulfill({
      json: part,
      headers: {
        "Content-Range": `${String(offset)}-${String(offset + part.length - 1)}/${String(changed.length)}`,
      },
    });
  });
  const promotions = createReactPromotionsDriver(page);
  await promotions.open("active");
  await promotions.pressUpdateCatalog();
  const wanted = JSON.stringify(changed);
  await page.waitForFunction(
    (expected) =>
      JSON.stringify(window["__flyerProbe"]?.logoEditor?.().catalogRows() ?? []) === expected,
    wanted,
    { timeout: OPEN_TIMEOUT_MS },
  );
  await goToFlyer(page);
}

async function setActivePromotionsFilters(
  page: Page,
  { hideOnline, category }: { hideOnline: boolean; category: string },
): Promise<void> {
  const promotions = createReactPromotionsDriver(page);
  await promotions.open("active");
  await page.getByRole("checkbox", { name: HIDE_ONLINE_ACTIVE }).setChecked(hideOnline);
  await page
    .getByRole("tabpanel", { name: "Activas" })
    .getByRole("combobox")
    .filter({ hasText: "Todos los rubros" })
    .selectOption(category);
  await goToFlyer(page);
}

function readRows(page: Page): Promise<ChooserRow[]> {
  return page
    .getByTestId("promotions-results")
    .locator("tbody tr")
    .evaluateAll((rows) =>
      rows.flatMap((row) => {
        const brand = row.querySelector('[data-part="brand"], [data-part="title"]');
        if (!brand) return [];
        const add = row.querySelector<HTMLButtonElement>('[data-testid="pick-brand"]');
        const state: ChooserRow["add"] = !add ? "absent" : add.disabled ? "disabled" : "enabled";
        return [
          {
            brand: brand.textContent.trim(),
            status: row.querySelector('[data-part="status"]')?.textContent.trim() ?? "",
            add: state,
            chosenAs: Number(add?.textContent) || 0,
            reason: add?.disabled ? add.title : "",
          },
        ];
      }),
    );
}

function createFlyerMethods(page: Page) {
  const editor = createReactLogoEditorDriver(page);
  const pressOnFlyer = async (at: FlyerPoint) => {
    await editor.bringIntoView(at);
    return editor.screenPoint(at);
  };
  return {
    detectLogos: async ({ x, y, width, height }: FlyerRegion) => {
      const read = await page.evaluate(
        (box) =>
          window["__flyerProbe"]?.logoEditor?.().detectStrip(box.x, box.y, box.width, box.height),
        { x, y, width, height },
      );
      if (!read) throw new Error("There is no flyer to read");
      return read;
    },
    detectLogoPlace: (at: FlyerPoint) => editor.flyerLogoAt(at),
    waitForCatalog: () => editor.waitForBrandCatalog(),
    markButtonVisible: () =>
      editorBar(page).getByRole("button", { name: "Armar franja", exact: true }).isVisible(),
    startMarking: () =>
      editorBar(page).getByRole("button", { name: "Armar franja", exact: true }).click(),
    isMarking: () => page.evaluate(() => window["__flyerProbe"]?.logoEditor?.().mode() === "strip"),
    editingHelp: async () => (await page.getByTestId("logo-editor-tip").textContent()) ?? "",
    clickFlyer: (at: FlyerPoint) => editor.touch(at),
    doubleClickFlyer: async (at: FlyerPoint) => {
      const { x, y } = await pressOnFlyer(at);
      await page.mouse.dblclick(x, y);
    },
    shiftClickFlyer: (at: FlyerPoint) => editor.shiftTouch(at),
    dragOnFlyer: async (from: FlyerPoint, by: { x: number; y: number }) => {
      const { x, y } = await pressOnFlyer(from);
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + by.x, y + by.y, { steps: 6 });
      await page.mouse.up();
    },
    markRegionByDragging: (region: FlyerRegion) => editor.drawBox(region),
    changes: async () => (await placedChanges(page)).map(describeChange),
    removeAllChanges: async () => {
      const button = editorBar(page).getByRole("button", {
        name: /^Volver (el cambio|los \d+ cambios) al original$/,
      });
      if ((await button.count()) > 0) await button.click();
      await editor.waitUntilSettled();
    },
    placeBrandsOn: async (regions: readonly FlyerRegion[]) => {
      await editor.placeBrands(regions, { keepLastChosen: true });
      const placed = await editor.placements();
      return placed.slice(-regions.length).map(({ image }) => image);
    },
    /** A person gives a logo the name of its brand; a text carries the words that were written. */
    placeLooseLogoMovedTo: async (region: FlyerRegion, title: string, movedTo: FlyerPoint) => {
      await editor.placeText(region, { text: title, color: "", weight: 500, fontSize: 30 });
      const placed = (await editor.placements()).at(-1)?.box;
      if (!placed) throw new Error("The text was not placed");
      await editor.bringIntoView({ x: placed.x, y: (placed.y + movedTo.y) / 2 });
      const from = await editor.screenPoint({
        x: placed.x + placed.width / 2,
        y: placed.y + placed.height / 2,
      });
      const to = await editor.screenPoint({
        x: movedTo.x + placed.width / 2,
        y: movedTo.y + placed.height / 2,
      });
      await page.mouse.move(from.x, from.y);
      await page.keyboard.down("Alt"); // Without the magnet: it goes exactly there.
      await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps: 6 });
      await page.mouse.up();
      await page.keyboard.up("Alt");
      await editor.waitUntilSettled();
    },
    deleteFirstLogoOfStrip: async (strip: string) => {
      await editor.touchPlaced(await firstLogoOfStrip(page, strip));
      await page.keyboard.press("Delete");
    },
    replaceFirstLogoOfStrip: async (strip: string) => {
      const at = await firstLogoOfStrip(page, strip);
      const old = (await placedChanges(page))[at]?.img ?? "";
      await editor.doubleClickPlaced(at);
      await editor.waitForBrandList();
      const used = new Set((await placedChanges(page)).map(({ img }) => img));
      const offers = await onePicker(page)
        .getByTestId("brand-card")
        .evaluateAll((cards) =>
          cards.map((card) => ({
            logo: card.getAttribute("data-logo") ?? "",
            category: card.getAttribute("data-category") ?? "",
          })),
        );
      const other = offers.find(
        ({ logo, category }) => !used.has(logo) && !/supermercado/i.test(category),
      );
      if (!other) throw new Error("There is nothing to replace it with");
      await onePicker(page).locator(`[data-logo="${other.logo}"]`).click();
      await editor.waitForPickerClosed();
      return old;
    },
    releaseLogos: async () => {
      await page.keyboard.press("Escape");
      await editor.waitUntilSettled();
    },
    logoToolbarVisible: () => adjustBar(page).isVisible(),
    toolbarOffersEditStrip: () =>
      adjustBar(page).getByRole("button", { name: "Editar franja" }).isVisible(),
    pressEditStripOnToolbar: () =>
      adjustBar(page).getByRole("button", { name: "Editar franja" }).click(),
    editStripButtons: () => page.getByTestId("edit-strip").count(),
    pressEditStripOnFlyer: () => page.getByTestId("edit-strip").first().click(),
    flyerMarks: () =>
      page.evaluate(async () => {
        // Their color fades: what counts is the one they end with.
        const fades = document.getAnimations().filter((motion) => motion instanceof CSSTransition);
        await Promise.all(fades.map((fade) => fade.finished.catch(() => null)));
        return [...document.querySelectorAll<HTMLElement>('[data-testid="logo-marker"]')].map(
          (marker) => ({
            expired: marker.dataset["note"] === "expired",
            label: marker.dataset["noteText"] ?? "",
            borderColor: getComputedStyle(marker).borderTopColor,
          }),
        );
      }),
    changeBrandValidity: (changes: readonly BrandValidityChange[]) =>
      changeBrandValidity(page, changes),
    lastNotice: async () =>
      (await page.getByRole("status").and(page.locator("[data-visible]")).textContent()) ?? "",
    setCleanView: async (on: boolean) => {
      const button = editorBar(page).getByRole("button", {
        name: /^(Vista previa|Seguir editando)$/,
      });
      if ((await button.getAttribute("aria-pressed")) !== String(on)) await button.click();
    },
    marksLayerVisible: () => page.getByTestId("logo-editor-layer").isVisible(),
    setActivePromotionsFilters: (filters: { hideOnline: boolean; category: string }) =>
      setActivePromotionsFilters(page, filters),
    activePromotionsHideOnline: () =>
      page.getByRole("checkbox", { name: HIDE_ONLINE_ACTIVE, includeHidden: true }).isChecked(),
  };
}

async function enterIfNeeded(page: Page): Promise<void> {
  const isOn = await page.evaluate(() => window["__flyerProbe"]?.logoEditor?.().isEditing());
  if (isOn) return;
  await editorBar(page).getByRole("button", { name: "Cambiar logos", exact: true }).click();
}

function createWindowMethods(page: Page) {
  const editor = createReactLogoEditorDriver(page);
  const opened = theWindow(page);
  const daysTick = opened.getByRole("checkbox", { name: /poner sus días de descuento/ });
  const button = (name: string | RegExp) => opened.getByRole("button", { name });
  return {
    open: async (
      region: FlyerRegion,
      remembered: { province?: string; daysBelow?: boolean } = {},
    ) => {
      await enterIfNeeded(page);
      const isMarking = await page.evaluate(
        () => window["__flyerProbe"]?.logoEditor?.().mode() === "strip",
      );
      if (!isMarking) {
        await editorBar(page).getByRole("button", { name: "Armar franja", exact: true }).click();
      }
      await editor.drawBox(region);
      await waitForWindow(page);
      if (remembered.province !== undefined) {
        await opened.getByTestId("brand-province").selectOption(remembered.province);
      }
      if (remembered.daysBelow !== undefined) await daysTick.setChecked(remembered.daysBelow);
    },
    waitForWindow: () => waitForWindow(page),
    isOpen: async () => (await opened.count()) > 0,
    state: async () => {
      const { resuming, brands, perRow, sizeOfAll, marked, region, originalLogos } =
        await currentStrip(page);
      return { resuming, brands, perRow, sizeOfAll, marked, region, originalLogos };
    },
    intro: async () => (await opened.getByTestId("strip-intro").textContent()) ?? "",
    putLabel: async () => (await opened.getByTestId("strip-put").textContent()) ?? "",
    search: (text: string) => search(page, text),
    tickBySearch: async (text: string) => {
      await search(page, text);
      await opened.locator(FREE_CARD).first().click();
    },
    tickNext: (count: number) => tickNext(page, count),
    tickNextAvoiding: (count: number, avoid: readonly string[]) =>
      tickNextAvoiding(page, count, avoid),
    chooseExactBrands: (names: readonly string[], category: string) =>
      chooseExactBrands(page, names, category),
    listInfo: async () => (await opened.getByTestId("brand-info").textContent()) ?? "",
    brandsColumnText: async () => (await opened.getByTestId("strip-brands").textContent()) ?? "",
    filters: () => readFilters(opened),
    localityFilterVisible: () => opened.getByTestId("brand-locality").isVisible(),
    setProvince: async (province: string) => {
      await opened.getByTestId("brand-province").selectOption(province);
    },
    setLocality: async (locality: string) => {
      await opened.getByTestId("brand-locality").selectOption(locality);
    },
    waitForLocalityBrands: () =>
      opened
        .locator('[data-testid="brand-list"]:not([data-searching])')
        .waitFor({ timeout: OPEN_TIMEOUT_MS }),
    setCategory: async (category: string) => {
      await opened.getByRole("combobox", { name: "Rubro" }).selectOption(category);
    },
    setJoinBranches: (on: boolean) =>
      opened.getByRole("checkbox", { name: "Juntar sucursales de la misma marca" }).setChecked(on),
    setHideOnline: (on: boolean) =>
      opened.getByRole("checkbox", { name: "Sin las de compra online" }).setChecked(on),
    matchingBrands: () =>
      page.evaluate(() => [...(window["__flyerProbe"]?.logoStripWindow?.().offers() ?? [])]),
    topCategoryIn: (province: string) =>
      page.evaluate(
        (where) => window["__flyerProbe"]?.logoEditor?.().topCategoryIn(where) ?? "",
        province,
      ),
    selectedBrandFacts: (province: string) =>
      page.evaluate(
        (where) => [...(window["__flyerProbe"]?.logoEditor?.().selectionFacts(where) ?? [])],
        province,
      ),
    daysBelowTicked: async () => ((await daysTick.count()) > 0 ? daysTick.isChecked() : null),
    offersFullScreen: () => button("Elegir en pantalla completa").isVisible(),
    pressSuggest: () => button(/Sugerir marcas/).click(),
    waitForSuggestions: async () => {
      await page.waitForFunction(
        () =>
          window["__flyerProbe"]
            ?.logoEditor?.()
            .strip()
            ?.brands.some(({ suggested }) => suggested),
        null,
        { timeout: LOGOS_TIMEOUT_MS },
      );
    },
    offersRemoveSuggested: () => button("Quitar sugeridas").isVisible(),
    pressRemoveSuggested: () => button("Quitar sugeridas").click(),
    selectionRows: () =>
      opened.getByTestId("strip-row").evaluateAll((rows) =>
        rows.map((row) => ({
          number: Number(row.querySelector('[data-part="number"]')?.textContent),
          title: row.querySelector('[data-part="title"]')?.textContent ?? "",
          hasThumbnail: row.querySelector("img") !== null,
          highlighted: row.hasAttribute("data-chosen"),
          suggestedMark: row.querySelector('[data-part="suggested"]') !== null,
        })),
      ),
    moveBrandUp: (index: number) =>
      selectionRow(page, index).getByRole("button", { name: "Subir" }).click(),
    moveBrandDown: (index: number) =>
      selectionRow(page, index).getByRole("button", { name: "Bajar" }).click(),
    removeBrand: (index: number) =>
      selectionRow(page, index).getByRole("button", { name: "Quitar" }).click(),
    clickBrandRow: (index: number) =>
      selectionRow(page, index).locator('[data-part="title"]').click(),
    dragBrandRow: (from: number, to: number) => dragBrandRow(page, from, to),
    dragBrandRowWithFinger: (from: number, belowRow: number) =>
      dragBrandRowWithFinger(page, from, belowRow),
    setPerRow: async (perRow: number) => {
      await opened.getByRole("combobox", { name: "Por fila" }).selectOption(String(perRow));
    },
    pressPut: () => opened.getByTestId("strip-put").click(),
    pressPutTwiceAtOnce: () =>
      opened.getByTestId("strip-put").evaluate((put) => {
        if (!(put instanceof HTMLElement)) throw new Error("That is not a button");
        put.click();
        put.click();
      }),
    put: async () => {
      await opened.getByTestId("strip-put").click();
      await waitForWindowClosed(page);
    },
    waitForWindowClosed: () => waitForWindowClosed(page),
    cancel: () => button("Cancelar").click(),
    close: () => button("Cerrar").click(),
    offersRestoreOriginal: async () => (await button("Volver la franja al original").count()) > 0,
    restoreOriginal: () => button("Volver la franja al original").click(),
  };
}

async function blockOf(block: Locator) {
  const box = await block.boundingBox();
  return { top: Math.round(box?.y ?? 0), height: Math.round(box?.height ?? 0) };
}

function createPreviewMethods(page: Page) {
  const opened = theWindow(page);
  const preview = page.getByTestId("strip-preview");
  const adjust = page.getByTestId("strip-adjust");
  const large = opened.getByRole("button", { name: /(Ampliar|Achicar) vista previa/ });
  return {
    waitForPreviewLogos: async () => {
      await page.waitForFunction(
        () => {
          const strip = window["__flyerProbe"]?.logoEditor?.().strip();
          return (
            strip &&
            strip.drawing.boxes.length === strip.brands.length &&
            strip.drawing.boxes.every(Boolean)
          );
        },
        null,
        { timeout: LOGOS_TIMEOUT_MS },
      );
    },
    previewSize: () =>
      preview.evaluate((canvas) => {
        const { width, height } = canvas.getBoundingClientRect();
        return { width: Math.round(width), height: Math.round(height) };
      }),
    previewPlacement: async () => {
      const { drawing } = await currentStrip(page);
      return {
        boxes: drawing.boxes.map((box) =>
          box ? { x: box.tx, y: box.ty, width: box.tw, height: box.th } : null,
        ),
      };
    },
    previewScale: async () => {
      const { drawing } = await currentStrip(page);
      const place = await preview.boundingBox();
      if (!place || !drawing.width) throw new Error("The preview is not on screen");
      return place.width / drawing.width;
    },
    clickPreviewLogo: async (index: number) => {
      const { x, y } = await previewPoint(page, index);
      await page.mouse.click(x, y);
    },
    dragPreviewLogo: async (index: number, offsets: readonly { x: number; y: number }[]) => {
      const { x, y } = await previewPoint(page, index);
      await page.mouse.move(x, y);
      await page.mouse.down();
      for (const offset of offsets) {
        await page.mouse.move(x + offset.x, y + offset.y, { steps: 4 });
      }
      await page.mouse.up();
    },
    clickPreviewCorner: async () => {
      const box = await preview.boundingBox();
      if (!box) throw new Error("The preview is not on screen");
      await page.mouse.click(box.x + 4, box.y + 4);
    },
    adjustmentsText: async () => (await adjust.textContent()) ?? "",
    markedSizeVisible: () =>
      adjust.getByRole("slider", { name: "Tamaño de este logo" }).isVisible(),
    pressMarkedBigger: () => adjust.getByRole("button", { name: "Más grande" }).click(),
    setMarkedSize: (percent: number) =>
      adjust.getByRole("slider", { name: "Tamaño de este logo" }).fill(String(percent)),
    setSizeOfAll: (percent: number) =>
      adjust.getByRole("slider", { name: "Tamaño de todos los logos" }).fill(String(percent)),
    pressBackToPlace: () => adjust.getByRole("button", { name: "Volver a su lugar" }).click(),
    offersLargePreview: () => large.isVisible(),
    pressLargePreview: () => large.click(),
    largePreviewLabel: async () => (await large.textContent()) ?? "",
    scrollLists: () =>
      page.evaluate(() => {
        const list = document.querySelector('[data-testid="brand-list"]');
        const selection = document.querySelector('[data-testid="strip-selection"]');
        if (list) list.scrollTop = 400;
        if (selection) selection.scrollTop = 300;
      }),
    scrollWindow: (top: number) =>
      opened.evaluate((dialog, position) => {
        dialog.scrollTop = position;
      }, top),
    previewInWindow: async () => {
      const place = await preview.boundingBox();
      const dialog = await opened.boundingBox();
      if (!place || !dialog) throw new Error("The window is not open");
      return { top: Math.round(place.y - dialog.y), height: Math.round(place.height) };
    },
    pageFitsWidth: () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    windowFitsWidth: () => opened.evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth),
    layout: async () => {
      const viewport = page.viewportSize();
      if (!viewport) throw new Error("The page has no size");
      return {
        viewport,
        dialog: await blockOf(opened),
        preview: await blockOf(preview),
        brandList: await blockOf(opened.getByTestId("brand-list")),
        selection: await blockOf(opened.getByTestId("strip-selection")),
        actions: await blockOf(opened.getByTestId("strip-actions")),
      };
    },
    undoRedoEnabled: async () => ({
      undo: await opened.getByRole("button", { name: "Deshacer" }).isEnabled(),
      redo: await opened.getByRole("button", { name: "Rehacer" }).isEnabled(),
    }),
    pressUndo: () => opened.getByRole("button", { name: "Deshacer" }).click(),
    waitForHistoryStep: async () => {
      await page.waitForFunction(() => window["__flyerProbe"]?.logoEditor?.().strip()?.isSettled);
    },
    blurFocus: () =>
      page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      }),
    focusSearch: () => opened.getByRole("searchbox", { name: "Buscar marca" }).focus(),
    visibleParts: async () => ({
      stepTabs: await opened.getByTestId("strip-steps").isVisible(),
      brandList: await opened.getByTestId("brand-list").isVisible(),
      preview: await preview.isVisible(),
      selection: await opened.getByTestId("strip-selection").isVisible(),
      next: await opened.getByRole("button", { name: /^Siguiente/ }).isVisible(),
      put: await opened.getByTestId("strip-put").isVisible(),
      back: await opened.getByRole("button", { name: "← Elegir más" }).isVisible(),
      cancel: await opened.getByRole("button", { name: "Cancelar" }).isVisible(),
    }),
    nextStepLabel: async () =>
      (await opened.getByRole("button", { name: /^Siguiente/ }).textContent()) ?? "",
    pressNextStep: () => opened.getByRole("button", { name: /^Siguiente/ }).click(),
    pressBackToBrands: () => opened.getByRole("button", { name: "← Elegir más" }).click(),
    pressStep: (step: 1 | 2) =>
      opened.getByRole("tab", { name: new RegExp(`^${String(step)}\\.`) }).click(),
    stepLabel: async (step: 1 | 2) =>
      (await opened.getByRole("tab", { name: new RegExp(`^${String(step)}\\.`) }).textContent()) ??
      "",
  };
}

function createChooserMethods(page: Page) {
  const promotions = createReactPromotionsDriver(page);
  const toPromotions = async () => {
    if (await chooserBar(page).isVisible()) return;
    await page.getByRole("banner").getByRole("tab", { name: "Promociones" }).first().click();
  };
  return {
    chooseAtFullScreen: async () => {
      await theWindow(page).getByRole("button", { name: "Elegir en pantalla completa" }).click();
      await chooserBar(page).waitFor({ timeout: OPEN_TIMEOUT_MS });
    },
    waitForChooserRows: () =>
      page.locator(ENABLED_PICK).first().waitFor({ timeout: OPEN_TIMEOUT_MS }),
    chooserBarVisible: async () => (await chooserBar(page).count()) > 0,
    chooserBarText: async () => (await chooserBar(page).textContent()) ?? "",
    promotionsVisible: () => page.getByRole("tablist", { name: "Modo de promociones" }).isVisible(),
    chooserFilters: async () => ({
      province: await page.getByTestId("promotions-province").inputValue(),
      oneBrand: await promotions.oneRowPerBrandIsOn("active"),
    }),
    isChoosing: async () => (await chooserBar(page).count()) > 0,
    chosenTitles: async () => {
      const titles = await chooserBar(page).getAttribute("data-titles");
      const read: unknown = JSON.parse(titles ?? "[]");
      return Array.isArray(read) ? read.map(String) : [];
    },
    chooserAddButtons: () => page.locator(PICK_BUTTON).count(),
    chooserChosenNumbers: () => page.locator(CHOSEN_PICK).allTextContents(),
    chooserAdd: (nth: number) => page.locator(FREE_PICK).nth(nth).click(),
    chooserPress: (nth: number) => page.locator(ENABLED_PICK).nth(nth).click(),
    chooserRemove: (nth: number) => page.locator(CHOSEN_PICK).nth(nth).click(),
    /** A person who went to change the flyer comes back to Promociones first. */
    chooserBack: async () => {
      await toPromotions();
      await chooserBar(page)
        .getByRole("button", { name: /^Volver/ })
        .click();
    },
    chooserCancel: () => chooserBar(page).getByRole("button", { name: "Cancelar" }).click(),
    chooserGoToSearch: () => promotions.switchTab("search"),
    validateBrands: (lines: readonly string[]) => promotions.searchBrands([...lines]),
    chooserRows: () => readRows(page),
    /** What a person cannot do: it takes the "off" away from the button, and clicks it. */
    forcePressDisabledAdd: () =>
      page.evaluate(() => {
        const button = document.querySelector<HTMLButtonElement>(
          '[data-testid="pick-brand"]:disabled',
        );
        if (!button) return false;
        button.disabled = false;
        button.click();
        return true;
      }),
    chooseFirstForOneLogo: async () => {
      const button = page.locator(ENABLED_PICK).first();
      const logo = (await button.getAttribute("data-logo")) ?? "";
      await button.click();
      return logo;
    },
    openPromotions: () =>
      page.getByRole("banner").getByRole("tab", { name: "Promociones" }).first().click(),
    excludeBoxes: () =>
      page
        .getByTestId("promotions-results")
        .getByRole("checkbox", { name: "Excluir del reporte" })
        .count(),
  };
}

function createPickerMethods(page: Page) {
  const editor = createReactLogoEditorDriver(page);
  const promotions = createReactPromotionsDriver(page);
  const opened = onePicker(page);
  return {
    openPickerAt: async (at: FlyerPoint) => {
      await enterIfNeeded(page);
      await editor.touch(at);
      await editor.waitForBrandList();
    },
    openPickerOn: async (region: FlyerRegion, remembered?: { province: string }) => {
      await enterIfNeeded(page);
      await editor.drawBox(region);
      await editor.waitForBrandList();
      if (remembered) await promotions.chooseProvince("brandPicker", remembered.province);
    },
    waitForPicker: () => editor.waitForBrandList(),
    isPickerOpen: async () => (await opened.count()) > 0,
    pickerTitle: () =>
      opened.evaluate(
        (dialog) =>
          document.getElementById(dialog.getAttribute("aria-labelledby") ?? "")?.textContent ?? "",
      ),
    pickerFilters: () => readFilters(opened),
    pickerListedCategories: () =>
      opened
        .getByTestId("brand-card")
        .evaluateAll((cards) => cards.map((card) => card.getAttribute("data-category") ?? "")),
    pickerShowsFilters: () => opened.getByRole("checkbox", { name: "Incluir MODO" }).isVisible(),
    pickerOffersDays: async () =>
      (await opened.getByRole("checkbox", { name: /Si es un súper/ }).count()) > 0,
    pickerWriteText: () => opened.getByRole("button", { name: "Escribir un texto" }).click(),
    pickerSetHideOnline: (on: boolean) =>
      opened.getByRole("checkbox", { name: "Sin las de compra online" }).setChecked(on),
    pickerChooseAtFullScreen: () =>
      page.getByRole("button", { name: "Elegir en pantalla completa" }).click(),
    closePicker: () => opened.getByRole("button", { name: "Cerrar" }).click(),
  };
}

function createPreviewGroupMethods(page: Page) {
  return {
    shiftClickPreviewLogo: async (index: number) => {
      const { x, y } = await previewPoint(page, index);
      await page.keyboard.down("Shift");
      await page.mouse.click(x, y);
      await page.keyboard.up("Shift");
    },
    chosenInPreview: async () => (await currentStrip(page)).chosen,
  };
}

/** Everything goes with mouse and keyboard: only what cannot be seen is read from the app. */
export function createReactLogoStripDriver(page: Page): LogoStripDriver {
  return partialDriver<LogoStripDriver>("logoStrip", {
    ...createFlyerMethods(page),
    ...createWindowMethods(page),
    ...createPreviewMethods(page),
    ...createChooserMethods(page),
    ...createPickerMethods(page),
    ...createPreviewGroupMethods(page),
  });
}
