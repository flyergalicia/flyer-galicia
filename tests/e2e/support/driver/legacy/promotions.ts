import { readFile } from "node:fs/promises";
import { type Page } from "@playwright/test";
import {
  type BrandCardView,
  type CatalogPromotion,
  type DaysTextSearch,
  type DesignLogo,
  type DrawnArtwork,
  type FlyerBox,
  type LocalityFieldView,
  type PlacedOnFlyer,
  type PromotionQuery,
  type PromotionRowView,
  type PromotionsDriver,
  type PromotionsTab,
  type PromotionZone,
  type ProvinceField,
  type ProvinceFieldView,
  type WatchedBrandView,
} from "../promotions.ts";

const WAIT_MS = 15_000;
const SEPARATOR = ";";
const TAB_NAME: Readonly<Record<PromotionsTab, string>> = { search: "buscar", active: "activas" };
const PROVINCE_SELECT: Readonly<Record<ProvinceField, string>> = {
  promotions: "#promos-prov",
  brandPicker: "#fg-lg-prov",
  logoStrip: "#fg-fr-prov",
};
const LOCALITY_SELECT: Readonly<Record<ProvinceField, string>> = {
  promotions: "#promos-loc",
  brandPicker: "#fg-lg-loc",
  logoStrip: "#fg-fr-loc",
};
const ONE_ROW_TICK: Readonly<Record<PromotionsTab, string>> = {
  search: "#promos-unamarca-b",
  active: "#promos-unamarca",
};
const MENU = ".prov-pop";
const BRAND_PICKER = "#fg-lg-ov";
const BRAND_CARD = `${BRAND_PICKER} .fg-lg-it`;
const LOGO_STRIP = "#fg-fr-ov";
const STRIP_CARD = `${LOGO_STRIP} .fg-lg-it`;
const TABLE_ROW = ".promos-table tbody tr";
const WATCHED_ROW = "#vig-body .vig-fila";

type LogoState = typeof _fgLg & { on?: boolean; sel?: number };
type PickerState = typeof _fgLgV & LegacyBrandFilters;
type PromotionQuestion = "flyerDays" | "hasPercent" | "ownDays" | "inProvince";

function splitProvinces(text: string): string[] {
  return text.split(SEPARATOR).filter(Boolean);
}

function menuRow(province: string): string {
  return `${MENU} .prov-it[data-v="${province}"]`;
}

function zoneChoice(zone: PromotionZone | undefined): LegacyZoneChoice | null {
  if (!zone) return null;
  return {
    prov: zone.provinces.join(SEPARATOR),
    ...(zone.locality === undefined ? {} : { loc: zone.locality }),
  };
}

/** A zone with a locality needs Galicia's answer for it first, as the windows ask for it. */
async function learnLocality(page: Page, zone: PromotionZone | undefined): Promise<void> {
  if (zone?.locality === undefined) return;
  await page.evaluate(
    ({ province, locality }) =>
      new Promise<void>((resolve, reject) => {
        const key = `${province}|${locality}`;
        if (Array.isArray(_fgLocIds[key])) {
          resolve();
          return;
        }
        _callPromosFn("ubicacion", { provincia: province, localidad: locality }, (error, reply) => {
          if (error || !reply?.data) {
            reject(new Error("Galicia did not answer for the locality"));
            return;
          }
          _fgLocIds[key] = reply.data.ids ?? [];
          resolve();
        });
      }),
    { province: zone.provinces.join(SEPARATOR), locality: zone.locality },
  );
}

async function ask(
  page: Page,
  question: PromotionQuestion,
  query: PromotionQuery,
  zone?: PromotionZone,
): Promise<string | boolean> {
  await learnLocality(page, zone);
  return page.evaluate(
    ({ question: asked, query: { title, benefit }, choice }) => {
      const found = (_promosCat ?? []).find(
        (promotion) =>
          promotion.titulo === title &&
          (benefit === undefined ||
            (promotion.beneficio ?? "").toLowerCase().includes(benefit.toLowerCase())),
      );
      if (!found) throw new Error(`The catalog has no promotion "${title}" (${String(benefit)})`);
      const inZone = choice ? _promoZona(choice) : null;
      const answers: Record<PromotionQuestion, () => string | boolean> = {
        flyerDays: () => _promoDias(found, inZone),
        hasPercent: () => _promoTienePct(found, inZone),
        ownDays: () => _promoDiasPropios(found),
        inProvince: () => _promoEnProvincia(found, choice?.prov ?? ""),
      };
      return answers[asked]();
    },
    { question, query, choice: zoneChoice(zone) },
  );
}

async function readRows(page: Page): Promise<PromotionRowView[]> {
  return page.locator(TABLE_ROW).evaluateAll((rows) =>
    rows.flatMap((row) => {
      const description = row.querySelector(".pc-promo");
      if (!description) return [];
      const text = (selector: string): string =>
        row.querySelector(selector)?.textContent.trim() ?? "";
      const link = row.querySelector(".promos-link");
      return [
        {
          brand: text(".pc-marca"),
          title: description.childNodes[0]?.textContent?.trim() ?? "",
          benefit: text(".promos-benef"),
          note: text(".promos-acl"),
          days: text(".promos-dias"),
          category: text(".pc-cat"),
          where: text(".pc-donde"),
          status: text(".pc-est"),
          description: description.textContent ?? "",
          logoUrl: row.querySelector("img.promos-logo")?.getAttribute("src") ?? "",
          hasPercentDot: Boolean(row.querySelector(".pc-logo .fg-pf-pct")),
          hasModoTag: Boolean(row.querySelector(".promos-modo")),
          linkText: link?.textContent.trim() ?? "",
          linkUrl: link?.getAttribute("href") ?? "",
        },
      ];
    }),
  );
}

async function readCards(page: Page, selector: string): Promise<BrandCardView[]> {
  return page.locator(selector).evaluateAll((cards) =>
    cards.map((card) => {
      const text = (part: string): string => card.querySelector(part)?.textContent ?? "";
      const more = card.querySelector(".fg-pf-mas");
      return {
        title: text(".fg-lg-it-t"),
        detail: text(".fg-lg-it-s"),
        logoUrl: card.querySelector("img")?.getAttribute("src") ?? "",
        hasPercentDot: Boolean(card.querySelector(".fg-pf-pct")),
        hasModoTag: Boolean(card.querySelector(".fg-pf-modo")),
        noteOnHover: card.querySelector(".fg-pf-acl")?.getAttribute("title") ?? "",
        morePromos: more?.textContent ?? "",
        morePromosOnHover: more?.getAttribute("title") ?? "",
      };
    }),
  );
}

async function readWatched(page: Page): Promise<WatchedBrandView[]> {
  return page.locator(WATCHED_ROW).evaluateAll((rows) =>
    rows.map((row) => ({
      brand: row.querySelector(".vig-m")?.textContent ?? "",
      status: row.querySelector(".vig-e")?.textContent ?? "",
    })),
  );
}

async function readProvinceField(page: Page, field: ProvinceField): Promise<ProvinceFieldView> {
  const { value, label, inUse } = await page
    .locator(PROVINCE_SELECT[field])
    .evaluate((element: HTMLSelectElement, where) => {
      const filters: Record<ProvinceField, () => string | undefined> = {
        promotions: () => _promosProv,
        brandPicker: () => (_fgLgV as PickerState).prov,
        logoStrip: () => _fgFrSt.prov,
      };
      return {
        value: element.value,
        label: element.selectedOptions[0]?.textContent ?? "",
        inUse: filters[where]() ?? "",
      };
    }, field);
  return { selected: splitProvinces(value), label, inUse: splitProvinces(inUse) };
}

async function readLocalityField(page: Page, field: ProvinceField): Promise<LocalityFieldView> {
  return page.locator(LOCALITY_SELECT[field]).evaluate((element: HTMLSelectElement, where) => {
    const filters: Record<ProvinceField, () => string | undefined> = {
      promotions: () => _promosLoc,
      brandPicker: () => (_fgLgV as PickerState).loc,
      logoStrip: () => _fgFrSt.loc,
    };
    return {
      hidden: element.hidden === true,
      disabled: element.disabled,
      placeholder: element.options[0]?.textContent ?? "",
      inUse: filters[where]() ?? "",
    };
  }, field);
}

async function waitForLocalityAnswer(page: Page, field: ProvinceField): Promise<void> {
  if (field === "promotions") {
    await page.waitForFunction(() => !_promosLoc || Boolean(_promosLocIds), null, {
      timeout: WAIT_MS,
    });
    return;
  }
  await page.waitForFunction(
    (where) => {
      const filters = where === "brandPicker" ? (_fgLgV as PickerState) : _fgFrSt;
      const locality = filters.loc;
      return !locality || Array.isArray(_fgLocIds[`${filters.prov ?? ""}|${locality}`]);
    },
    field,
    { timeout: WAIT_MS },
  );
}

async function searchInBrandPicker(page: Page, text: string): Promise<void> {
  await page.locator("#fg-lg-q").fill(text);
  // The search box waits for a pause in the typing before it filters the list.
  await page.waitForFunction((query) => _fgLgV.q === query, text, { timeout: WAIT_MS });
}

async function findDaysTextOn(
  page: Page,
  artwork: DrawnArtwork,
  logo: FlyerBox,
): Promise<DaysTextSearch> {
  return page.evaluate(
    ({ drawing, place }) => {
      const canvas = document.createElement("canvas");
      canvas.width = drawing.width;
      canvas.height = drawing.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("The browser did not give a 2D canvas");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, drawing.width, drawing.height);
      for (const { x, y, width, height, color } of drawing.blocks) {
        context.fillStyle = color;
        context.fillRect(x, y, width, height);
      }
      for (const { text, x, baseline, color, font } of drawing.texts) {
        context.fillStyle = color;
        context.font = font;
        context.fillText(text, x, baseline);
      }
      const real = baseImg;
      Reflect.set(globalThis, "baseImg", canvas);
      const split = _fgLgPartirDias({
        x: place.x,
        y: place.y,
        w: place.width,
        h: place.height,
        bg: "rgb(255,255,255)",
      });
      baseImg = real;
      return {
        logoHeight: Math.round(split.logo.h),
        daysText: split.texto
          ? { top: Math.round(split.texto.y), height: Math.round(split.texto.h) }
          : null,
      };
    },
    { drawing: artwork, place: logo },
  );
}

function legacyDesignLogo(logo: DesignLogo): LegacyDesignLogo {
  if (logo.kind === "text") return { tipo: "txt", texto: logo.text };
  if (logo.kind === "catalogBrand") return { img: logo.logoFile, t: logo.title };
  return { img: logo.kind === "uploaded" ? "pc:abc" : "orig:1,2,3,4", t: logo.title };
}

async function openProvinceMenu(page: Page, field: ProvinceField): Promise<void> {
  await page.click(PROVINCE_SELECT[field]);
  await page.locator(MENU).waitFor({ timeout: WAIT_MS });
}

async function placedOnFlyer(page: Page): Promise<PlacedOnFlyer> {
  return page.evaluate(() => {
    const changes = _fgLgActivos();
    const selected = (_fgLg as LogoState).sel ?? -1;
    return {
      logos: changes
        .filter(({ img, tipo }) => img && tipo !== "txt")
        .map(({ t = "", img = "", tx = 0, ty = 0, tw = 0, th = 0 }) => ({
          title: t,
          logoFile: img,
          centerX: Math.round(tx + tw / 2),
          bottom: Math.round(ty + th),
        })),
      texts: changes
        .filter(({ tipo }) => tipo === "txt")
        .map(({ texto = "", fs = 0, peso = 0, color = "", tx = 0, ty = 0, tw = 0 }) => ({
          text: texto,
          fontSize: fs,
          weight: peso,
          color,
          centerX: Math.round(tx + tw / 2),
          top: Math.round(ty),
        })),
      selectedTitle: changes[selected]?.t ?? "",
    };
  });
}

function createTableActions(page: Page) {
  return {
    sortBy: async (column: string) => {
      await page.locator(".promos-table thead th", { hasText: column }).first().click();
    },
    statusCounters: () => page.locator(".promos-chip:visible").allInnerTexts(),
    filterResults: (text: string) => page.locator("#promos-buscar").pressSequentially(text),
    resultsFilterHasFocus: () =>
      page.locator("#promos-buscar").evaluate((field) => document.activeElement === field),
    filterColumn: (hint: string, text: string) =>
      page
        .locator(`.promos-table thead input.promos-fil[placeholder="${hint}"]`)
        .first()
        .fill(text),
    filterStatus: async (label: string) => {
      await page
        .locator(".promos-table thead select.promos-fil", { hasText: "Todos" })
        .last()
        .selectOption({ label });
    },
    pressValidate: async (brands: string[]) => {
      await page.locator("#promos-marcas").fill(brands.join("\n"));
      await page.locator("#promos-validar-btn").click();
    },
    validateWithShortcut: async (brands: string[]) => {
      await page.locator("#promos-marcas").fill(brands.join("\n"));
      await page.locator("#promos-marcas").press("Control+Enter");
    },
    pressUpdateCatalog: () => page.locator("#promos-sync-btn").click(),
    updateCatalogButton: async () => ({
      text: ((await page.locator("#promos-sync-btn").textContent()) ?? "").trim(),
      locked: await page.locator("#promos-sync-btn").isDisabled(),
    }),
    catalogStatus: async () => (await page.locator("#promos-sync-info").textContent()) ?? "",
    validateIsLocked: () => page.locator("#promos-validar-btn").isDisabled(),
    validateButtonText: async () => (await page.locator("#promos-validar-btn").textContent()) ?? "",
    downloadSheet: async () => {
      await page.evaluate(() => _lib("exceljs"));
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.locator("#promos-dl-btn").click(),
      ]);
      const content = await readFile(await download.path());
      const cells = await page.evaluate(async (encoded) => {
        const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
        const book = new ExcelJS.Workbook();
        await book.xlsx.load(bytes.buffer);
        const sheet = book.worksheets[0];
        if (!sheet) return [];
        const lines: string[][] = [];
        for (let at = 1; at <= sheet.rowCount; at += 1) {
          lines.push(
            Array.from(sheet.getRow(at).values, (value) =>
              typeof value === "string" ? value : JSON.stringify(value ?? ""),
            ).slice(1),
          );
        }
        return lines;
      }, content.toString("base64"));
      const [head = [], ...rows] = cells;
      return { head, rows };
    },
    setOnlyNew: (on: boolean) => page.locator("#promos-nuevas").setChecked(on),
    setOneRowPerBrand: (on: boolean) => page.locator("#promos-unamarca").setChecked(on),
  };
}

export function createLegacyPromotionsDriver(page: Page): PromotionsDriver {
  const waitForCatalog = () =>
    page
      .waitForFunction(() => (_promosCat?.length ?? 0) > 0, null, { timeout: WAIT_MS })
      .then(() => undefined);
  return {
    ...createTableActions(page),
    waitForCatalog,
    open: async (tab) => {
      await page.evaluate((name) => {
        if ((_fgLg as LogoState).on) fgLogosModo(false);
        switchApp("promos");
        switchPromoTab(name);
      }, TAB_NAME[tab]);
      await waitForCatalog();
      await page.waitForFunction(
        () => document.querySelectorAll("#promos-prov option").length > 3,
        null,
        { timeout: WAIT_MS },
      );
    },
    openWithoutCatalog: (tab) =>
      page.evaluate((name) => {
        switchApp("promos");
        switchPromoTab(name);
      }, TAB_NAME[tab]),
    switchTab: (tab) =>
      page.evaluate((name) => {
        switchPromoTab(name);
      }, TAB_NAME[tab]),
    backToFlyer: () =>
      page.evaluate(() => {
        switchApp("flyer");
      }),
    listActive: async () => {
      await page.locator("#promos-activas-btn").click();
      await page.locator(TABLE_ROW).first().waitFor({ timeout: WAIT_MS });
    },
    searchBrands: async (brands) => {
      await page.locator("#promos-marcas").fill(brands.join("\n"));
      await page.locator("#promos-validar-btn").click();
      await page.locator(TABLE_ROW).first().waitFor({ timeout: WAIT_MS });
    },
    rows: () => readRows(page),
    confirmMatchAgain: (brand) =>
      page.evaluate((pasted) => {
        const results = _promosResultados ?? [];
        const row = results.findIndex(({ marca, hermanaDe }) => marca === pasted && !hermanaDe);
        const result = results[row];
        if (!result) throw new Error(`No row for the pasted brand "${pasted}"`);
        result.necesitaRevision = true;
        _promoElegirCandidato(row, 0);
      }, brand),
    oneRowPerBrandIsOn: (tab) => page.locator(ONE_ROW_TICK[tab]).isChecked(),
    activeResultIds: () =>
      page.evaluate(() => (_promosResultados ?? []).map(({ promo }) => String(promo?.id ?? ""))),

    catalog: () =>
      page.evaluate(() =>
        (_promosCat ?? []).map((promotion): CatalogPromotion => ({
          sourceId: String(promotion.id).replace(/^m:/, ""),
          origin: _promoEsModo(promotion) ? "modo" : "galicia",
          title: promotion.titulo,
          category: promotion.subtitulo ?? "",
          benefit: promotion.beneficio ?? "",
          days: promotion.dias ?? "",
          hasLogo: Boolean(promotion.imagen),
        })),
      ),
    promotionIdsIn: (provinces) =>
      page.evaluate(
        (names) =>
          (_promosCat ?? [])
            .filter((promotion) => names.some((name) => _promoEnProvincia(promotion, name)))
            .map(({ id }) => String(id)),
        provinces,
      ),
    currentOfferCount: (title, province) =>
      page.evaluate(
        ({ wanted, where }) => {
          const today = new Date();
          return (_promosCat ?? []).filter(
            (promotion) =>
              promotion.titulo === wanted &&
              !promotion.proximamente &&
              _promoEstado(promotion.fecha_hasta, today) !== "VENCIDA" &&
              _promoEnProvincia(promotion, where),
          ).length;
        },
        { wanted: title, where: province },
      ),
    supermarketDaysOnFlyer: async (promotion, zone) =>
      String(await ask(page, "flyerDays", promotion, zone)),
    hasPercentDiscount: async (promotion, zone) =>
      Boolean(await ask(page, "hasPercent", promotion, zone)),
    titlesWithPercentDiscount: (titles) =>
      page.evaluate(
        (wanted) =>
          wanted.filter((title) => {
            const found = (_promosCat ?? []).find(({ titulo }) => titulo === title);
            return found ? _promoTienePct(found) : false;
          }),
        titles,
      ),
    ownDays: async (promotion) => String(await ask(page, "ownDays", promotion)),
    appliesInProvince: async (promotion, province) =>
      Boolean(await ask(page, "inProvince", promotion, { provinces: [province] })),
    modoPromotionShownInLocality: ({ province, locality, cities }) =>
      page.evaluate(
        ({ where, town, stores }) =>
          _promoEnLocalidad(
            {
              id: "modo",
              titulo: "",
              origen: "modo",
              provincias: [where],
              localidades: stores.map((city) => `${where}|${city}`),
            },
            where,
            town,
            {},
          ),
        { where: province, town: locality, stores: cities },
      ),

    includeModoIsOn: () => page.evaluate(() => _promosConModo),
    setIncludeModo: (on) =>
      page.evaluate((value) => {
        _promoSetModo(value);
        // The marks on the flyer remember their index for the day; it must not hide a change.
        _fgLgVencIdx.cat = null;
      }, on),
    rememberedIncludeModo: async () => {
      const stored = await page.evaluate(() => localStorage.getItem("fg_promos_modo"));
      return stored === null ? null : stored === "1";
    },

    openBrandPickerOver: async ({ x, y, width, height }) => {
      await page.evaluate(
        (place) => {
          _fgLgAbrir(_fgLgManual(place.x, place.y, place.width, place.height));
        },
        { x, y, width, height },
      );
      await page.locator(BRAND_CARD).first().waitFor({ timeout: WAIT_MS });
    },
    openBrandPickerAt: async ({ x, y }) => {
      await page.evaluate(
        (point) => {
          _fgLgAbrir(_fgLgDetectar(point.x, point.y));
        },
        { x, y },
      );
      await page.locator(BRAND_CARD).first().waitFor({ timeout: WAIT_MS });
    },
    closeBrandPicker: async () => {
      await page.locator("#fg-lg-x").click();
      await page.locator(BRAND_PICKER).waitFor({ state: "detached", timeout: WAIT_MS });
    },
    searchInBrandPicker: (text) => searchInBrandPicker(page, text),
    brandCards: () => readCards(page, BRAND_CARD),
    pickBrand: async (title) => {
      await page
        .locator(BRAND_CARD)
        .filter({ has: page.getByText(title, { exact: true }) })
        .first()
        .click();
      await page.locator(BRAND_PICKER).waitFor({ state: "detached", timeout: WAIT_MS });
    },

    openLogoStripOver: async ({ x, y, width, height }) => {
      await page.evaluate(
        (place) => {
          _fgFrAbrir(_fgLgManual(place.x, place.y, place.width, place.height));
        },
        { x, y, width, height },
      );
      await page.locator(STRIP_CARD).first().waitFor({ timeout: WAIT_MS });
    },
    closeLogoStrip: async () => {
      await page.locator("#fg-fr-no").click();
      await page.locator(LOGO_STRIP).waitFor({ state: "detached", timeout: WAIT_MS });
    },
    searchInLogoStrip: async (text) => {
      await page.locator("#fg-fr-q").fill(text);
      // The search box waits for a pause in the typing before it filters the list.
      await page.waitForFunction((query) => _fgFrSt.q === query, text, {
        timeout: WAIT_MS,
      });
    },
    logoStripCards: () => readCards(page, STRIP_CARD),
    logoStripOfferIds: () =>
      page.evaluate(() => _fgPfFiltrar(_fgFrSt, () => undefined).lista.map(({ id }) => String(id))),

    chooseProvince: async (field, province) => {
      await page.selectOption(PROVINCE_SELECT[field], province);
    },
    chooseLocality: async (field, locality) => {
      await page.selectOption(LOCALITY_SELECT[field], locality);
      await waitForLocalityAnswer(page, field);
    },
    provinceField: (field) => readProvinceField(page, field),
    localityField: (field) => readLocalityField(page, field),

    openProvinceMenu: (field) => openProvinceMenu(page, field),
    openProvinceMenuWithKeyboard: async (field) => {
      await page.focus(PROVINCE_SELECT[field]);
      await page.keyboard.press("ArrowDown");
    },
    provinceMenuIsOpen: () => page.isVisible(MENU),
    provinceMenuTicked: () =>
      page
        .locator(`${MENU} .prov-it.on`)
        .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-v") ?? "")),
    clickInProvinceMenu: (province) => page.locator(menuRow(province)).click(),
    shiftClickInProvinceMenu: (province) =>
      page.locator(menuRow(province)).click({ modifiers: ["Shift"] }),
    removeInProvinceMenu: (province) =>
      page.locator(menuRow(province)).locator(".prov-mas").click(),
    clickAllProvincesInProvinceMenu: () => page.locator(menuRow("")).click(),

    percentDotOnFlyer: async () => (await page.locator("#fg-lg-capa .fg-pf-pct").count()) > 0,
    expiredLogosOnFlyer: () =>
      page.evaluate(() =>
        _fgLgActivos()
          .filter((change) => _fgLgVencida(change))
          .map((change) => change.t ?? ""),
      ),
    placedOnFlyer: () => placedOnFlyer(page),
    findDaysTextOn: (artwork, logo) => findDaysTextOn(page, artwork, logo),
    hasDaysTextBelowLogoAt: ({ x, y }) =>
      page.evaluate(
        (point) => {
          const place = _fgLgDetectar(point.x, point.y);
          const below = _fgLgPartirDias(place).texto;
          return Boolean(below) && (below?.y ?? 0) >= place.y + place.h;
        },
        { x, y },
      ),

    watchFoundBrandsOn: async (option) => {
      await page.selectOption("#vig-opt", String(option));
      await page.locator("#vig-btn").click();
      await page.locator("#fg-cf-ok").click();
      await page
        .getByText(/se vigilan \d+ marcas/)
        .first()
        .waitFor({ timeout: WAIT_MS });
    },
    openWatchedBrands: async () => {
      await page.evaluate(() => {
        openAdminPanel();
        switchAdminTab(null, "vigiladas");
      });
      await page.locator(WATCHED_ROW).first().waitFor({ timeout: WAIT_MS });
      return readWatched(page);
    },
    closeWatchedBrands: async () => {
      await page.evaluate(() => {
        closeAdminPanel();
      });
      // It hides a moment later; opening it meanwhile would hide it again.
      await page.locator("#admin-panel").waitFor({ state: "hidden", timeout: WAIT_MS });
    },
    stopWatchingFirstBrand: async () => {
      const before = await page.locator(WATCHED_ROW).count();
      await page.locator("#vig-body .vig-x").first().click();
      await page.waitForFunction(
        ({ selector, count }) => document.querySelectorAll(selector).length === count,
        { selector: WATCHED_ROW, count: before - 1 },
        { timeout: WAIT_MS },
      );
      return readWatched(page);
    },
    addDesignLogosToWatchedBrands: async (baseOption, newOption, logos) => {
      await page.evaluate(
        ({ base, created, changes }) => _vigSumarEstudio(base, created, changes),
        { base: baseOption, created: newOption, changes: logos.map(legacyDesignLogo) },
      );
    },
  };
}
