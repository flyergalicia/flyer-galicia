import { type Page } from "@playwright/test";
import { type FlyerRegion } from "../flyer-editor.ts";
import { type FlyerPoint } from "../logo-editor.ts";
import {
  type BrandFilters,
  type BrandValidityChange,
  type ChooserRow,
  type LogoStripDriver,
  type StripChange,
  type WindowParts,
} from "../logo-strip.ts";

const WINDOW = "#fg-fr-ov";
const BRAND_ITEM = `${WINDOW} .fg-lg-it`;
const FREE_BRAND = "#fg-fr-list .fg-lg-it:not(.fg-fr-on)";
const ROWS = "#fg-fr-sel .fg-fr-it";
const CHOOSER_BAR = "#fg-elegir-bar";
const CHOOSER_ADD = ".promos-elegir";
const CHOOSER_FREE = `${CHOOSER_ADD}:not(.on):not([disabled])`;
const PICKER = "#fg-lg-ov";
const OPEN_TIMEOUT_MS = 15_000;
const PUT_TIMEOUT_MS = 20_000;
const LOGOS_TIMEOUT_MS = 30_000;
const TOAST = ".toast,#toast";

function toRegion({ x, y, width, height }: FlyerRegion): [number, number, number, number] {
  return [x, y, width, height];
}

/** Where a point of the flyer is on the screen, scrolling it to the middle if asked or needed. */
function flyerToScreen(
  page: Page,
  at: FlyerPoint,
  center = false,
): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ({ x, y, alwaysCenter }) => {
      const offscreenBy = (): number => {
        const top = cv.getBoundingClientRect().top + _fgLgAPantalla(x, y, 0, 0).t;
        const needsIt = alwaysCenter || top < 80 || top > innerHeight - 80;
        return needsIt ? top - innerHeight / 2 : 0;
      };
      const scrollBy = offscreenBy();
      if (scrollBy !== 0) {
        let scroller = cv.parentElement;
        while (
          scroller &&
          !(
            scroller.scrollHeight > scroller.clientHeight + 4 &&
            /auto|scroll/.test(getComputedStyle(scroller).overflowY)
          )
        ) {
          scroller = scroller.parentElement;
        }
        if (scroller) scroller.scrollTop += scrollBy;
        else window.scrollBy(0, scrollBy);
      }
      const box = cv.getBoundingClientRect();
      const place = _fgLgAPantalla(x, y, 0, 0);
      return { x: box.left + place.l, y: box.top + place.t };
    },
    { ...at, alwaysCenter: center },
  );
}

async function waitForWindow(page: Page): Promise<void> {
  await page.locator(BRAND_ITEM).first().waitFor({ timeout: OPEN_TIMEOUT_MS });
}

async function waitForWindowClosed(page: Page): Promise<void> {
  await page.locator(WINDOW).waitFor({ state: "detached", timeout: PUT_TIMEOUT_MS });
}

async function search(page: Page, text: string): Promise<void> {
  await page.locator("#fg-fr-q").fill(text);
  // The search box waits for a pause in the typing before it filters the list.
  await page.waitForFunction((query) => _fgFrSt.q === query, text);
}

async function tickNext(page: Page, count: number): Promise<void> {
  for (let done = 0; done < count; done += 1) {
    await page.locator(FREE_BRAND).first().click();
  }
}

async function tickNextAvoiding(
  page: Page,
  count: number,
  avoid: readonly string[],
): Promise<string[]> {
  for (;;) {
    const next = await page.evaluate(
      ({ wanted, skip }) => {
        const state = _fgFrSt;
        if (!state || state.sel.length >= wanted) return -1;
        return [...document.querySelectorAll("#fg-fr-list .fg-lg-it:not(.fg-fr-on)")]
          .map((item) => Number(item.getAttribute("data-i")))
          .find((index) => !skip.includes(state.res[index]?.imagen ?? ""));
      },
      { wanted: count, skip: [...avoid] },
    );
    if (next === undefined) throw new Error("The list has no other brand to tick");
    if (next < 0) break;
    await page.locator(`#fg-fr-list .fg-lg-it[data-i="${String(next)}"]`).click();
  }
  return page.evaluate(() => (_fgFrSt.sel ?? []).map(({ img }) => img));
}

async function clickRowButton(page: Page, action: string, index: number): Promise<void> {
  await page.locator(`#fg-fr-sel button[data-a=${action}][data-i="${String(index)}"]`).click();
}

async function dragBrandRow(page: Page, from: number, to: number): Promise<void> {
  const start = await page.locator(ROWS).nth(from).boundingBox();
  const end = await page.locator(ROWS).nth(to).boundingBox();
  if (!start || !end) throw new Error("The rows of the selection are not on screen");
  const x = start.x + start.width / 2;
  const y = start.y + start.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 20, { steps: 4 });
  await page.mouse.move(end.x + end.width / 2, end.y + 4, { steps: 8 });
  await page.mouse.up();
}

function dragBrandRowWithFinger(page: Page, from: number, belowRow: number): Promise<void> {
  return page.evaluate(
    ({ source, target }) => {
      const rows = [...document.querySelectorAll("#fg-fr-sel .fg-fr-it")];
      const handle = rows[source]?.querySelector(".fg-fr-mango");
      const list = document.getElementById("fg-fr-sel");
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
  return page.evaluate((logo) => {
    const state = _fgFrSt;
    const canvas = document.getElementById("fg-fr-prev");
    const box = state?._cajas?.[logo];
    const view = state?._vista;
    if (!canvas || !box || !view) throw new Error("That logo is not drawn in the preview");
    const place = canvas.getBoundingClientRect();
    const scale = place.width / view.ancho;
    return {
      x: place.left + (box.tx + box.tw / 2 - view.x0) * scale,
      y: place.top + (box.ty + box.th / 2 - view.y0) * scale,
    };
  }, index);
}

function setRange(page: Page, selector: string, percent: number): Promise<void> {
  return page.locator(selector).evaluate((range, value) => {
    if (!(range instanceof HTMLInputElement)) throw new Error("That control is not a range");
    range.value = String(value);
    range.dispatchEvent(new Event("input", { bubbles: true }));
  }, percent);
}

async function readFilters(page: Page, prefix: "fg-fr" | "fg-lg"): Promise<BrandFilters> {
  const remembered = await page.evaluate((isStrip) => {
    const state = isStrip ? _fgFrSt : window._fgLgV;
    return {
      province: state.prov ?? "",
      locality: state.loc ?? "",
      category: state.rubro,
      joinBranches: state.una,
      hideOnline: state.sinOnline,
    };
  }, prefix === "fg-fr");
  return {
    ...remembered,
    hideOnlineTicked: await page.locator(`#${prefix}-onl`).isChecked(),
  };
}

interface RawChange {
  tipo: string | undefined;
  img: string | undefined;
  t: string | undefined;
  texto: string | undefined;
  fs: number | undefined;
  franja: string | undefined;
  isCover: boolean;
  tx: number | undefined;
  ty: number | undefined;
  tw: number | undefined;
  th: number | undefined;
  ox: number | undefined;
  oy: number | undefined;
  ow: number | undefined;
  oh: number | undefined;
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

function describeChange(entry: RawChange): StripChange {
  const logo = entry.img ?? "";
  const kind: StripChange["kind"] = entry.tipo === "txt" ? "text" : logo ? "brand" : "empty";
  return {
    strip: entry.franja ?? null,
    isCover: entry.isCover,
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

async function readChanges(page: Page): Promise<StripChange[]> {
  const entries = await page.evaluate(() =>
    _fgLgActivos().map(
      ({ tipo, img, t, texto, fs, franja, franjaBase, tx, ty, tw, th, ox, oy, ow, oh }) => ({
        tipo,
        img,
        t,
        texto,
        fs,
        franja: typeof franja === "string" ? franja : undefined,
        isCover: Boolean(franjaBase),
        tx,
        ty,
        tw,
        th,
        ox,
        oy,
        ow,
        oh,
      }),
    ),
  );
  return entries.map((entry) => describeChange(entry));
}

function placeBrandsOn(page: Page, regions: readonly FlyerRegion[]): Promise<string[]> {
  return page.evaluate(async (places) => {
    const today = new Date();
    const chosen: { logo: string; title: string; image: HTMLCanvasElement }[] = [];
    for (const { imagen, titulo, proximamente, fecha_hasta: end } of _promosCat ?? []) {
      if (chosen.length >= places.length) break;
      const isValid = imagen && !proximamente && _promoEstado(end, today) !== "VENCIDA";
      if (isValid && !chosen.some(({ logo }) => logo === imagen)) {
        chosen.push({ logo: imagen, title: titulo, image: await _fgLgTraer(imagen) });
      }
    }
    if (chosen.length < places.length) throw new Error("The catalog has too few valid brands");
    chosen.forEach(({ logo, title, image }, index) => {
      const [x = 0, y = 0, width = 0, height = 0] = places[index] ?? [];
      _fgLgPoner(_fgLgManual(x, y, width, height), logo, title, image);
    });
    return chosen.map(({ logo }) => logo);
  }, regions.map(toRegion));
}

function placeLooseLogoMovedTo(
  page: Page,
  region: FlyerRegion,
  title: string,
  movedTo: FlyerPoint,
): Promise<void> {
  return page.evaluate(
    async ({ place, name, target }) => {
      const logo = (_promosCat ?? []).find(({ imagen }) => imagen)?.imagen;
      if (!logo) throw new Error("The catalog has no logos");
      const image = await _fgLgTraer(logo);
      _fgLgPoner(_fgLgManual(place[0], place[1], place[2], place[3]), logo, name, image);
      const placed = _fgLgActivos()[window._fgLg.sel];
      if (!placed) throw new Error("The logo was not placed");
      placed.tx = target.x;
      placed.ty = target.y;
      _fgLgListo();
    },
    { place: toRegion(region), name: title, target: movedTo },
  );
}

function replaceFirstLogoOfStrip(page: Page, strip: string): Promise<string> {
  return page.evaluate(async (id) => {
    const changes = _fgLgActivos();
    const index = changes.findIndex((entry) => entry.franja === id && !entry.franjaBase);
    const old = changes[index];
    const other = (_promosCat ?? []).slice(50).find(({ imagen }) => imagen);
    if (!old || !other?.imagen) throw new Error("There is nothing to replace");
    const oldLogo = old.img ?? "";
    await _fgLgTraer(other.imagen);
    // Its own place on the flyer, and it no longer belongs to the strip.
    Object.assign(old, {
      x: old.tx,
      y: old.ty,
      w: old.tw,
      h: old.th,
      img: other.imagen,
      t: other.titulo,
      bw: old.tw,
      bh: old.th,
      franja: undefined,
    });
    _fgLgListo();
    return oldLogo;
  }, strip);
}

function dayFromToday(days: number): string {
  const date = new Date(Date.now() + days * 86_400_000);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${String(date.getFullYear())}-${month}-${day}`;
}

function changeBrandValidity(page: Page, changes: readonly BrandValidityChange[]): Promise<void> {
  const wanted = changes.map(({ logo, expiresInDays, upcomingEndingInDays }) => ({
    logo,
    end: dayFromToday(expiresInDays),
    upcomingEnd: upcomingEndingInDays === undefined ? null : dayFromToday(upcomingEndingInDays),
  }));
  return page.evaluate((brands) => {
    const catalog = (_promosCat ?? []).map((promotion) => Object.assign({}, promotion));
    let nextId = 999_991;
    for (const { logo, end, upcomingEnd } of brands) {
      const ofLogo = catalog.filter(({ imagen }) => imagen === logo);
      for (const promotion of ofLogo) {
        promotion.fecha_hasta = end;
        promotion.proximamente = false;
      }
      const [first] = ofLogo;
      if (first && upcomingEnd !== null) {
        catalog.push(
          Object.assign({}, first, { id: nextId, fecha_hasta: upcomingEnd, proximamente: true }),
        );
        nextId += 1;
      }
    }
    _promosCat = catalog;
    _fgLgListo();
  }, wanted);
}

function readRows(page: Page): Promise<ChooserRow[]> {
  return page.locator("#promos-tbody tr").evaluateAll((rows) =>
    rows.map((row) => {
      const add = row.querySelector<HTMLButtonElement>(".promos-elegir");
      const state: ChooserRow["add"] = !add ? "absent" : add.disabled ? "disabled" : "enabled";
      return {
        brand: row.children[2]?.textContent ?? "",
        status: row.querySelector(".promos-badge")?.textContent ?? "",
        add: state,
        chosenAs: Number(add?.textContent) || 0,
        reason: add?.disabled ? add.title : "",
      };
    }),
  );
}

function isShown(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((target) => {
    const element = document.querySelector<HTMLElement>(target);
    return (
      element !== null &&
      element.offsetParent !== null &&
      getComputedStyle(element).display !== "none"
    );
  }, selector);
}

async function visibleParts(page: Page): Promise<WindowParts> {
  return {
    stepTabs: await isShown(page, ".fg-fr-pasos"),
    brandList: await isShown(page, "#fg-fr-list"),
    preview: await isShown(page, "#fg-fr-prev"),
    selection: await isShown(page, "#fg-fr-sel"),
    next: await isShown(page, "#fg-fr-sig"),
    put: await isShown(page, "#fg-fr-ok"),
    back: await isShown(page, "#fg-fr-atras"),
    cancel: await isShown(page, "#fg-fr-no"),
  };
}

function chooseFirstForOneLogo(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const buttons = document.querySelectorAll<HTMLButtonElement>(
      "button.promos-elegir:not([disabled])",
    );
    for (const button of buttons) {
      const row = Number((button.getAttribute("onclick") ?? "").replace(/\D+/g, ""));
      const logo = _promosResultados?.[row]?.promo?.imagen;
      if (logo) {
        await _fgLgTraer(logo);
        button.click();
        return logo;
      }
    }
    throw new Error("No row offers a brand to choose");
  });
}

function selectedBrandFacts(page: Page, province: string) {
  return page.evaluate((where) => {
    const catalog = _promosCat ?? [];
    const byLogo = new Map(catalog.map((promotion) => [promotion.imagen, promotion]));
    return _fgFrSt.sel.map(({ img, sug }) => {
      const promotion = byLogo.get(img);
      const sameLogo = catalog.filter(({ imagen }) => imagen === img);
      return {
        logo: img,
        suggested: Boolean(sug),
        category: promotion?.subtitulo ?? "",
        brandKey: _promoClaveMarca(_promoBaseMarca(promotion?.titulo ?? ""), {}),
        promotionId: promotion?.id ?? 0,
        hasLocalPromotion: sameLogo.some(
          (one) => !_promoEsOnline(one) && _promoEnProvincia(one, where),
        ),
        hasPromotionThereOrOnline: sameLogo.some(
          (one) => _promoEnProvincia(one, where) || _promoEsOnline(one),
        ),
      };
    });
  }, province);
}

function createFlyerMethods(page: Page) {
  return {
    detectLogos: (region: FlyerRegion) =>
      page.evaluate(([x, y, width, height]) => {
        const found = _fgFrDetectar(x, y, width, height);
        return { logos: found.n, rows: found.filas.map(({ n }) => n), perRow: found.porFila };
      }, toRegion(region)),
    detectLogoPlace: (at: FlyerPoint) =>
      page.evaluate(({ x, y }) => {
        const place = _fgLgDetectar(x, y);
        return { x: place.x, y: place.y, width: place.w, height: place.h };
      }, at),
    waitForCatalog: async () => {
      await page.waitForFunction(() => Boolean(_promosCat?.length), null, {
        timeout: OPEN_TIMEOUT_MS,
      });
    },
    markButtonVisible: () => page.locator("#fg-lg-franja").isVisible(),
    startMarking: () => page.locator("#fg-lg-franja").click(),
    isMarking: () => page.evaluate(() => window._fgFr.modo),
    editingHelp: async () => (await page.locator("#fg-lg-tip").textContent()) ?? "",
    clickFlyer: async (at: FlyerPoint) => {
      const { x, y } = await flyerToScreen(page, at);
      await page.mouse.click(x, y);
    },
    doubleClickFlyer: async (at: FlyerPoint) => {
      const { x, y } = await flyerToScreen(page, at);
      await page.mouse.dblclick(x, y);
    },
    shiftClickFlyer: async (at: FlyerPoint) => {
      const { x, y } = await flyerToScreen(page, at);
      await page.keyboard.down("Shift");
      await page.mouse.click(x, y);
      await page.keyboard.up("Shift");
    },
    dragOnFlyer: async (from: FlyerPoint, by: { x: number; y: number }) => {
      const { x, y } = await flyerToScreen(page, from);
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + by.x, y + by.y, { steps: 6 });
      await page.mouse.up();
    },
    markRegionByDragging: async ({ x, y, width, height }: FlyerRegion) => {
      await flyerToScreen(page, { x: x + width / 2, y: y + height / 2 }, true);
      const start = await flyerToScreen(page, { x, y });
      const end = await flyerToScreen(page, { x: x + width, y: y + height });
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move((start.x + end.x) / 2, (start.y + end.y) / 2, { steps: 5 });
      await page.mouse.move(end.x, end.y, { steps: 5 });
      await page.mouse.up();
    },
    changes: () => readChanges(page),
    removeAllChanges: () =>
      page.evaluate(() => {
        window._fgLg.list = [];
        _fgLgListo();
      }),
    placeBrandsOn: (regions: readonly FlyerRegion[]) => placeBrandsOn(page, regions),
    placeLooseLogoMovedTo: (region: FlyerRegion, title: string, movedTo: FlyerPoint) =>
      placeLooseLogoMovedTo(page, region, title, movedTo),
    deleteFirstLogoOfStrip: (strip: string) =>
      page.evaluate((id) => {
        window._fgLg.sel = _fgLgActivos().findIndex(
          (entry) => entry.franja === id && !entry.franjaBase,
        );
        window._fgLg.grupo = [];
        _fgLgQuitarElegidos();
      }, strip),
    replaceFirstLogoOfStrip: (strip: string) => replaceFirstLogoOfStrip(page, strip),
    releaseLogos: () =>
      page.evaluate(() => {
        window._fgLg.sel = -1;
        _fgLgListo();
      }),
    logoToolbarVisible: () => page.locator("#fg-lg-herr").isVisible(),
    toolbarOffersEditStrip: () => page.locator("#fg-lg-herr button[data-a=franja]").isVisible(),
    pressEditStripOnToolbar: () => page.locator("#fg-lg-herr button[data-a=franja]").click(),
    editStripButtons: () => page.locator("#fg-lg-mk .fg-lg-fr-edit").count(),
    // It only shows with the mouse over the flyer, so it is pressed directly.
    pressEditStripOnFlyer: () =>
      page
        .locator("#fg-lg-mk .fg-lg-fr-edit")
        .first()
        .evaluate((button) => {
          if (button instanceof HTMLElement) button.click();
        }),
    flyerMarks: () =>
      page.locator("#fg-lg-mk .fg-lg-marca").evaluateAll((marks) =>
        marks.map((mark) => ({
          expired: mark.classList.contains("vencida"),
          label: mark instanceof HTMLElement ? (mark.dataset.v ?? "") : "",
          borderColor: getComputedStyle(mark).borderTopColor,
        })),
      ),
    changeBrandValidity: (changes: readonly BrandValidityChange[]) =>
      changeBrandValidity(page, changes),
    lastNotice: async () => (await page.locator(TOAST).first().textContent()) ?? "",
    setCleanView: async (on: boolean) => {
      const isOn = (await page.locator("#fg-lg-ver").getAttribute("aria-pressed")) === "true";
      if (isOn !== on) await page.locator("#fg-lg-ver").click();
    },
    marksLayerVisible: () => page.locator("#fg-lg-capa").isVisible(),
    setActivePromotionsFilters: ({
      hideOnline,
      category,
    }: {
      hideOnline: boolean;
      category: string;
    }) =>
      page.evaluate(
        ({ online, rubro }) => {
          window._promosFiltros.online = online ? "ocultar" : "";
          window._promosRubro = rubro;
        },
        { online: hideOnline, rubro: category },
      ),
    activePromotionsHideOnline: () =>
      page.evaluate(() => window._promosFiltros.online === "ocultar"),
  };
}

function createWindowMethods(page: Page) {
  return {
    open: async (
      region: FlyerRegion,
      remembered: { province?: string; daysBelow?: boolean } = {},
    ) => {
      await page.evaluate(
        ({ place, province, daysBelow }) => {
          if (province !== undefined) window._fgLgV.prov = province;
          if (daysBelow !== undefined) window._fgLgV.conDias = daysBelow;
          _fgFrAbrir(_fgLgManual(place[0], place[1], place[2], place[3]));
        },
        { place: toRegion(region), ...remembered },
      );
      await waitForWindow(page);
    },
    waitForWindow: () => waitForWindow(page),
    isOpen: async () => (await page.locator(WINDOW).count()) > 0,
    state: () =>
      page.evaluate(() => {
        const state = _fgFrSt;
        return {
          resuming: Boolean(state.previa),
          brands: state.sel.map(({ img, t, k, dx, dy, sug }) => ({
            logo: img,
            title: t,
            size: k ?? 1,
            moved: { x: dx ?? 0, y: dy ?? 0 },
            suggested: Boolean(sug),
          })),
          perRow: state.cols,
          sizeOfAll: state.kt,
          marked: state.elegido,
          region: {
            x: state.rect.x,
            y: state.rect.y,
            width: state.rect.w,
            height: state.rect.h,
          },
          originalLogos: state.info.n,
        };
      }),
    intro: async () => (await page.locator(`${WINDOW} .fg-cf-b`).first().textContent()) ?? "",
    putLabel: async () => (await page.locator("#fg-fr-ok").textContent()) ?? "",
    search: (text: string) => search(page, text),
    tickBySearch: async (text: string) => {
      await search(page, text);
      await page.locator(FREE_BRAND).first().click();
    },
    tickNext: (count: number) => tickNext(page, count),
    tickNextAvoiding: (count: number, avoid: readonly string[]) =>
      tickNextAvoiding(page, count, avoid),
    chooseExactBrands: (names: readonly string[], category: string) =>
      page.evaluate(
        async ({ wanted, rubro }) => {
          for (const name of wanted) {
            const promotion = (_promosCat ?? []).find(
              ({ subtitulo, titulo }) => subtitulo === rubro && _promoNormalizar(titulo) === name,
            );
            if (!promotion?.imagen) throw new Error(`The catalog has no brand "${name}"`);
            await _fgLgTraer(promotion.imagen);
            _fgFrSt.sel.push({ img: promotion.imagen, t: promotion.titulo });
          }
          _fgFrLista();
          _fgFrSelPintar();
          _fgFrPreview();
        },
        { wanted: [...names], rubro: category },
      ),
    listInfo: async () => (await page.locator("#fg-fr-info").textContent()) ?? "",
    brandsColumnText: async () => (await page.locator(`${WINDOW} .fg-fr-izq`).textContent()) ?? "",
    filters: () => readFilters(page, "fg-fr"),
    localityFilterVisible: () => page.locator("#fg-fr-loc").isVisible(),
    setProvince: async (province: string) => {
      await page.locator("#fg-fr-prov").selectOption(province);
    },
    setLocality: async (locality: string) => {
      await page.locator("#fg-fr-loc").selectOption(locality);
    },
    waitForLocalityBrands: async () => {
      await page.waitForFunction(
        () => {
          return Array.isArray(_fgLocIds[`${_fgFrSt.prov ?? ""}|${_fgFrSt.loc ?? ""}`]);
        },
        null,
        { timeout: OPEN_TIMEOUT_MS },
      );
    },
    setCategory: async (category: string) => {
      await page.locator("#fg-fr-rub").selectOption(category);
    },
    setJoinBranches: (on: boolean) => page.locator("#fg-fr-una").setChecked(on),
    setHideOnline: (on: boolean) => page.locator("#fg-fr-onl").setChecked(on),
    matchingBrands: () =>
      page.evaluate(() =>
        _fgPfFiltrar(_fgFrSt, () => undefined).lista.map((promotion) => ({
          id: promotion.id,
          logo: promotion.imagen ?? "",
          title: promotion.titulo,
          isOnline: _promoEsOnline(promotion),
        })),
      ),
    topCategoryIn: (province: string) =>
      page.evaluate((where) => {
        const counts = new Map<string, number>();
        for (const promotion of _promosCat ?? []) {
          if (_promoEnProvincia(promotion, where)) {
            const category = promotion.subtitulo ?? "";
            counts.set(category, (counts.get(category) ?? 0) + 1);
          }
        }
        return [...counts.entries()].toSorted((a, b) => b[1] - a[1])[0]?.[0] ?? "";
      }, province),
    selectedBrandFacts: (province: string) => selectedBrandFacts(page, province),
    daysBelowTicked: async () => {
      const tick = page.locator("#fg-fr-dias");
      return (await tick.count()) > 0 ? tick.isChecked() : null;
    },
    offersFullScreen: () => page.locator("#fg-fr-act").isVisible(),
    pressSuggest: () => page.locator("#fg-fr-sug").click(),
    waitForSuggestions: async () => {
      await page.waitForFunction(() => _fgFrSt.sel.some(({ sug }) => sug), null, {
        timeout: LOGOS_TIMEOUT_MS,
      });
    },
    offersRemoveSuggested: () => page.locator("#fg-fr-qsug").isVisible(),
    pressRemoveSuggested: () => page.locator("#fg-fr-qsug").click(),
    selectionRows: () =>
      page.locator(ROWS).evaluateAll((rows) =>
        rows.map((row) => ({
          number: Number(row.querySelector("b")?.textContent),
          title: row.querySelector(".fg-fr-it-t")?.textContent ?? "",
          hasThumbnail: row.querySelector(".fg-fr-mini img") !== null,
          highlighted: row.classList.contains("sel"),
          suggestedMark: row.querySelector(".fg-fr-sugmark") !== null,
        })),
      ),
    moveBrandUp: (index: number) => clickRowButton(page, "arr", index),
    moveBrandDown: (index: number) => clickRowButton(page, "aba", index),
    removeBrand: (index: number) => clickRowButton(page, "x", index),
    clickBrandRow: (index: number) =>
      page.locator(`${ROWS}[data-i="${String(index)}"] .fg-fr-it-t`).click(),
    dragBrandRow: (from: number, to: number) => dragBrandRow(page, from, to),
    dragBrandRowWithFinger: (from: number, belowRow: number) =>
      dragBrandRowWithFinger(page, from, belowRow),
    setPerRow: async (perRow: number) => {
      await page.locator("#fg-fr-por").selectOption(String(perRow));
    },
    pressPut: () => page.locator("#fg-fr-ok").click(),
    pressPutTwiceAtOnce: () =>
      page.locator("#fg-fr-ok").evaluate((button) => {
        if (!(button instanceof HTMLElement)) throw new Error("That is not a button");
        button.click();
        button.click();
      }),
    put: async () => {
      await page.locator("#fg-fr-ok").click();
      await waitForWindowClosed(page);
    },
    waitForWindowClosed: () => waitForWindowClosed(page),
    cancel: () => page.locator("#fg-fr-no").click(),
    close: () => page.locator("#fg-fr-x").click(),
    offersRestoreOriginal: async () => (await page.locator("#fg-fr-quitar").count()) > 0,
    restoreOriginal: () => page.locator("#fg-fr-quitar").click(),
  };
}

function createPreviewMethods(page: Page) {
  return {
    waitForPreviewLogos: async () => {
      await page.waitForFunction(
        () => {
          const state = _fgFrSt;
          const logos = window._fgLg;
          return state?.sel.every(({ img }) => logos.imgs[img]);
        },
        null,
        { timeout: LOGOS_TIMEOUT_MS },
      );
      await page.evaluate(() => {
        _fgFrPreview();
      });
    },
    previewSize: async () => {
      const box = await page.locator("#fg-fr-prev").evaluate((canvas) => {
        const { width, height } = canvas.getBoundingClientRect();
        return { width: Math.round(width), height: Math.round(height) };
      });
      return box;
    },
    previewPlacement: () =>
      page.evaluate(() => {
        const boxes = _fgFrSt._cajas ?? [];
        return {
          boxes: Array.from(boxes, (box) =>
            box ? { x: box.tx, y: box.ty, width: box.tw, height: box.th } : null,
          ),
        };
      }),
    previewScale: () =>
      page.evaluate(() => {
        const view = _fgFrSt._vista;
        const canvas = document.getElementById("fg-fr-prev");
        if (!view || !canvas) throw new Error("The preview is not on screen");
        return canvas.getBoundingClientRect().width / view.ancho;
      }),
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
      const box = await page.locator("#fg-fr-prev").boundingBox();
      if (!box) throw new Error("The preview is not on screen");
      await page.mouse.click(box.x + 4, box.y + 4);
    },
    adjustmentsText: async () => (await page.locator("#fg-fr-ajuste").textContent()) ?? "",
    markedSizeVisible: () => page.locator("#fg-fr-k1").isVisible(),
    pressMarkedBigger: () => page.locator("#fg-fr-ajuste button[data-aj=mas]").click(),
    setMarkedSize: (percent: number) => setRange(page, "#fg-fr-k1", percent),
    setSizeOfAll: (percent: number) => setRange(page, "#fg-fr-kt", percent),
    pressBackToPlace: () => page.locator("#fg-fr-ajuste button[data-aj=lugar]").click(),
    offersLargePreview: () => page.locator("#fg-fr-amp").isVisible(),
    pressLargePreview: () => page.locator("#fg-fr-amp").click(),
    largePreviewLabel: async () => (await page.locator("#fg-fr-amp").textContent()) ?? "",
    scrollLists: () =>
      page.evaluate(() => {
        const list = document.getElementById("fg-fr-list");
        const selection = document.getElementById("fg-fr-sel")?.parentElement;
        if (list) list.scrollTop = 400;
        if (selection) selection.scrollTop = 300;
      }),
    scrollWindow: (top: number) =>
      page.locator(".fg-cf.fg-fr").evaluate((dialog, position) => {
        dialog.scrollTop = position;
      }, top),
    previewInWindow: () =>
      page.evaluate(() => {
        const preview = document.getElementById("fg-fr-prev")?.getBoundingClientRect();
        const dialog = document.querySelector(".fg-cf.fg-fr")?.getBoundingClientRect();
        if (!preview || !dialog) throw new Error("The window is not open");
        return { top: Math.round(preview.top - dialog.top), height: Math.round(preview.height) };
      }),
    pageFitsWidth: () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    windowFitsWidth: () =>
      page.locator(".fg-cf.fg-fr").evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth),
    layout: async () => {
      const [dialog, preview, brandList, selection, actions, viewport] = await page.evaluate(() => {
        const blocks = [
          ".fg-cf.fg-fr",
          "#fg-fr-prev",
          "#fg-fr-list",
          "#fg-fr-sel",
          ".fg-fr .fg-cf-acts",
        ].map((selector) => {
          const box = document.querySelector(selector)?.getBoundingClientRect();
          return { top: Math.round(box?.top ?? 0), height: Math.round(box?.height ?? 0) };
        });
        return [...blocks, { top: window.innerWidth, height: window.innerHeight }];
      });
      if (!dialog || !preview || !brandList || !selection || !actions || !viewport) {
        throw new Error("The window is not open");
      }
      return {
        viewport: { width: viewport.top, height: viewport.height },
        dialog,
        preview,
        brandList,
        selection,
        actions,
      };
    },
    undoRedoEnabled: async () => ({
      undo: await page.locator("#fg-fr-undo").isEnabled(),
      redo: await page.locator("#fg-fr-redo").isEnabled(),
    }),
    pressUndo: () => page.locator("#fg-fr-undo").click(),
    waitForHistoryStep: async () => {
      await page.waitForFunction(() => {
        const history = _fgFrSt._h;
        return Boolean(history) && !history?.t;
      });
    },
    blurFocus: () =>
      page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      }),
    focusSearch: () => page.locator("#fg-fr-q").focus(),
    visibleParts: () => visibleParts(page),
    nextStepLabel: async () => (await page.locator("#fg-fr-sig").textContent()) ?? "",
    pressNextStep: () => page.locator("#fg-fr-sig").click(),
    pressBackToBrands: () => page.locator("#fg-fr-atras").click(),
    pressStep: (step: 1 | 2) =>
      page.locator(`.fg-fr-pasos button[data-paso="${String(step)}"]`).click(),
    stepLabel: async (step: 1 | 2) =>
      (await page.locator(`.fg-fr-pasos button[data-paso="${String(step)}"]`).textContent()) ?? "",
  };
}

function createChooserMethods(page: Page) {
  return {
    chooseAtFullScreen: async () => {
      await page.locator("#fg-fr-act").click();
      await page.locator(CHOOSER_BAR).waitFor({ timeout: OPEN_TIMEOUT_MS });
    },
    waitForChooserRows: () =>
      page.locator(`${CHOOSER_ADD}:not([disabled])`).first().waitFor({ timeout: OPEN_TIMEOUT_MS }),
    chooserBarVisible: async () => (await page.locator(CHOOSER_BAR).count()) > 0,
    chooserBarText: async () => (await page.locator(CHOOSER_BAR).textContent()) ?? "",
    promotionsVisible: () => page.locator("#view-promos").isVisible(),
    chooserFilters: async () => ({
      province: await page.locator("#promos-prov").inputValue(),
      oneBrand: await page.locator("#promos-unamarca").isChecked(),
    }),
    isChoosing: () => page.evaluate(() => window._fgElegir !== null),
    chosenTitles: () => page.evaluate(() => (window._fgElegir?.st.sel ?? []).map(({ t }) => t)),
    chooserAddButtons: () => page.locator(CHOOSER_ADD).count(),
    chooserChosenNumbers: () => page.locator(`${CHOOSER_ADD}.on`).allTextContents(),
    chooserAdd: (nth: number) => page.locator(CHOOSER_FREE).nth(nth).click(),
    chooserPress: (nth: number) => page.locator(`${CHOOSER_ADD}:not([disabled])`).nth(nth).click(),
    chooserRemove: (nth: number) => page.locator(`${CHOOSER_ADD}.on`).nth(nth).click(),
    chooserBack: () => page.locator(`${CHOOSER_BAR} .btn.bp`).click(),
    chooserCancel: () => page.locator(`${CHOOSER_BAR} .btn.bg`).click(),
    chooserGoToSearch: () => page.locator(".promos-view .ptab").first().click(),
    validateBrands: async (lines: readonly string[]) => {
      await page.locator("#promos-marcas").fill(lines.join("\n"));
      await page.locator("#promos-validar-btn").click();
      await page.locator("#promos-tbody tr").first().waitFor({ timeout: PUT_TIMEOUT_MS });
    },
    chooserRows: () => readRows(page),
    forcePressDisabledAdd: () =>
      page.evaluate(() => {
        const button = document.querySelector<HTMLButtonElement>(".promos-elegir:disabled");
        if (!button) return false;
        button.disabled = false;
        button.click();
        return true;
      }),
    chooseFirstForOneLogo: () => chooseFirstForOneLogo(page),
    openPromotions: () =>
      page.evaluate(() => {
        switchApp("promos");
      }),
    excludeBoxes: () => page.locator(".promos-excl").count(),
  };
}

function createPickerMethods(page: Page) {
  const waitForPicker = (): Promise<void> =>
    page.locator(`${PICKER} .fg-lg-it`).first().waitFor({ timeout: OPEN_TIMEOUT_MS });
  return {
    openPickerAt: async (at: FlyerPoint) => {
      await page.evaluate(({ x, y }) => {
        _fgLgAbrir(_fgLgDetectar(x, y));
      }, at);
      await waitForPicker();
    },
    openPickerOn: async (region: FlyerRegion, remembered?: { province: string }) => {
      await page.evaluate(
        ({ place, province }) => {
          if (province !== undefined) {
            window._fgLgV.prov = province;
            window._fgLgV.loc = "";
          }
          _fgLgAbrir(_fgLgManual(place[0], place[1], place[2], place[3]));
        },
        { place: toRegion(region), province: remembered?.province },
      );
      await waitForPicker();
    },
    waitForPicker,
    isPickerOpen: async () => (await page.locator(PICKER).count()) > 0,
    pickerTitle: async () => (await page.locator("#fg-lg-t").textContent()) ?? "",
    pickerFilters: () => readFilters(page, "fg-lg"),
    pickerListedCategories: () =>
      page.evaluate(() => window._fgLgV.res.map(({ subtitulo }) => subtitulo ?? "")),
    pickerShowsFilters: () => page.locator("#fg-lg-chk").isVisible(),
    pickerOffersDays: async () => (await page.locator("#fg-lg-dias").count()) > 0,
    pickerWriteText: () => page.locator("#fg-lg-escribir").click(),
    pickerSetHideOnline: (on: boolean) => page.locator("#fg-lg-onl").setChecked(on),
    pickerChooseAtFullScreen: async () => {
      await page.locator("#fg-lg-full").click();
      await page.locator(CHOOSER_BAR).waitFor({ timeout: OPEN_TIMEOUT_MS });
    },
    closePicker: () => page.locator("#fg-lg-x").click(),
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
    chosenInPreview: () => page.evaluate(() => _fgFrElegidos(_fgFrSt)),
  };
}

export function createLegacyLogoStripDriver(page: Page): LogoStripDriver {
  return {
    ...createFlyerMethods(page),
    ...createWindowMethods(page),
    ...createPreviewMethods(page),
    ...createChooserMethods(page),
    ...createPickerMethods(page),
    ...createPreviewGroupMethods(page),
  };
}
