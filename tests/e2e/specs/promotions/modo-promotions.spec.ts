// Replaces pruebas/t87_promos_modo.cjs.
import { fixtureFile, localitiesOf, type Row } from "../../support/cloud/index.ts";
import { expect, test } from "../../support/test.ts";

const MARKED_PLACE = { x: 140, y: 2650, width: 300, height: 110 };
const ATOMO = "Supermercados Atomo Prueba";
const COTO_DISCOUNT = { title: "Coto", benefit: "25%" };
const FLYER_OPTION = "9";
const [MENDOZA_FIRST = "", MENDOZA_SECOND = ""] = localitiesOf("MENDOZA");
const [CAPITAL_FIRST = ""] = localitiesOf("CAPITAL FEDERAL");

function modoRow(row: Row): Row {
  return {
    slug: "",
    subtitulo: "Supermercados",
    imagen: "",
    beneficio: "",
    tope: null,
    dias: null,
    canales: ["instore"],
    solo_galicia: false,
    provincias: null,
    localidades: null,
    fecha_desde: "2026-10-01",
    fecha_hasta: "2027-12-31",
    proximamente: false,
    primera_vez: null,
    ...row,
  };
}

const MODO_ROWS: readonly Row[] = [
  // YPF Boxes: the note of MODO says it is not fuel.
  {
    id: "a1",
    slug: "ypf-cuotas",
    titulo: "YPF",
    subtitulo: "Vehículos",
    imagen: "modo/317.png",
    beneficio: "Hasta 6 cuotas sin interés",
    dias: "Todos los días",
    aclaracion:
      "Aplica exclusivamente en cambio de aceite, filtro y escaneo electrónico de tu vehículo",
  },
  // The same as Galicia's "Coto · 25% de ahorro.": it is not added.
  {
    id: "a2",
    slug: "coto-oct26",
    titulo: "COTO",
    imagen: "coto_180.png",
    beneficio: "25% de reintegro",
    dias: "Martes",
    provincias: ["BUENOS AIRES", "CAPITAL FEDERAL"],
    fecha_hasta: "2026-10-31",
  },
  // Another one of Coto that Galicia does not have: it goes on the same card.
  {
    id: "a3",
    slug: "coto-30",
    titulo: "COTO",
    imagen: "coto_180.png",
    beneficio: "30% de reintegro",
    dias: "Jueves",
    provincias: ["CAPITAL FEDERAL"],
    localidades: [`CAPITAL FEDERAL|${CAPITAL_FIRST}`],
  },
  // The same % as Galicia on another day: it is another promotion.
  {
    id: "a7",
    slug: "coto-dom",
    titulo: "COTO",
    imagen: "coto_180.png",
    beneficio: "25% de reintegro",
    dias: "Domingos",
    provincias: ["SANTA FE"],
  },
  {
    id: "a4",
    slug: "wico",
    titulo: "WICO Combustibles",
    subtitulo: "Combustible",
    beneficio: "15% de reintegro",
    dias: "Jueves",
  },
  {
    id: "a5",
    slug: "atomo",
    titulo: ATOMO,
    imagen: "modo/328.png",
    beneficio: "20% de reintegro",
    dias: "Miércoles",
    provincias: ["MENDOZA"],
    localidades: [`MENDOZA|${MENDOZA_FIRST}`],
  },
  {
    id: "a6",
    slug: "farma-online",
    titulo: "Farmacia Online Prueba",
    subtitulo: "Salud y Bienestar",
    beneficio: "20% de reintegro",
    canales: ["online"],
    provincias: [],
    localidades: [],
  },
];

test.beforeEach(({ cloud }) => {
  const logo = fixtureFile("gofarma_180.png");
  // Logos copied to the bucket (flyers/modo/...).
  cloud.bucketBinaries["317.png"] = logo;
  cloud.bucketBinaries["328.png"] = logo;
  cloud.modoPromotions = MODO_ROWS.map(modoRow);
  cloud.bucketJson["_vigilar.json"] = {
    opciones: { [FLYER_OPTION]: [{ m: "YPF", t: "YPF", origen: "manual" }] },
  };
});

test(
  "MODO joins the catalog without repeating Galicia, with the same supermarket rules",
  { tag: "@react" },
  async ({ openApp }) => {
    const app = await openApp({ user: "admin" });
    await app.promotions.open("search");

    expect
      .soft(await app.promotions.includeModoIsOn(), 'the tick "Incluir MODO" starts on')
      .toBe(true);

    const catalog = await app.promotions.catalog();
    const modoIds = catalog
      .filter(({ origin }) => origin === "modo")
      .map(({ sourceId }) => sourceId);
    expect.soft(modoIds.length, "six are added from MODO").toBe(6);
    expect
      .soft(modoIds, "the Coto 25% on Tuesdays, already on Galicia, is not repeated")
      .not.toContain("a2");
    expect
      .soft(
        catalog.filter(
          ({ title, benefit }) => title.toLowerCase() === "coto" && benefit.includes("25%"),
        ).length,
        "Coto 25%: the one of Galicia on Tuesdays and the one of MODO on Sundays",
      )
      .toBe(2);
    expect.soft(modoIds, "a Coto 25% on another day is another promotion: added").toContain("a7");
    expect
      .soft(
        catalog.some(({ origin, title }) => origin === "modo" && title === "YPF"),
        "YPF, which Galicia does not have, joins",
      )
      .toBe(true);

    const inCapital = await app.promotions.supermarketDaysOnFlyer(COTO_DISCOUNT, {
      provinces: ["CAPITAL FEDERAL"],
    });
    expect
      .soft(inCapital, "in Capital, the flyer days of Coto sum the % of MODO")
      .toMatch(/martes/i);
    expect.soft(inCapital, "both of them").toMatch(/jueves/i);
    expect
      .soft(
        await app.promotions.supermarketDaysOnFlyer(COTO_DISCOUNT, { provinces: ["BUENOS AIRES"] }),
        "in Buenos Aires the 30% of MODO, only for Capital, does not count",
      )
      .not.toMatch(/jueves/i);

    const atomo = { title: ATOMO };
    expect
      .soft(
        await app.promotions.hasPercentDiscount(atomo),
        "a MODO supermarket with % earns the dot",
      )
      .toBe(true);
    expect
      .soft(await app.promotions.supermarketDaysOnFlyer(atomo), "and its days")
      .toBe("Miércoles");
    expect
      .soft(await app.promotions.appliesInProvince(atomo, "MENDOZA"), "its province filters it in")
      .toBe(true);
    expect
      .soft(await app.promotions.appliesInProvince(atomo, "NEUQUEN"), "and other provinces out")
      .toBe(false);
  },
);

test(
  "the window of a logo offers MODO with its tag, and placing it keeps it valid",
  { tag: "@react" },
  async ({ openApp }) => {
    const app = await openApp({ user: "admin" });
    await app.logoEditor.enter();
    await app.promotions.waitForCatalog();
    await app.promotions.openBrandPickerOver(MARKED_PLACE);

    const modoTick = app.page.getByRole("checkbox", { name: "Incluir MODO" });
    await expect.soft(modoTick, 'the window has the tick "Incluir MODO", on').toBeChecked();

    await app.promotions.searchInBrandPicker("ypf");
    const card = (await app.promotions.brandCards()).find(({ title }) => title === "YPF");
    expect.soft(card, "YPF shows up").toBeDefined();
    expect.soft(card?.hasModoTag, "with the MODO tag").toBe(true);
    expect.soft(card?.logoUrl, "and its logo from the bucket").toMatch(/flyers\/modo\/317\.png/);
    expect
      .soft(card?.noteOnHover, "the card shows the note of MODO: oil change, not fuel")
      .toMatch(/cambio de aceite/);

    await app.promotions.chooseProvince("brandPicker", "MENDOZA");
    expect
      .soft(
        await app.promotions.brandCards(),
        "with a province chosen, YPF has no stores: not offered",
      )
      .toEqual([]);
    await app.promotions.chooseProvince("brandPicker", "");

    await app.promotions.searchInBrandPicker("wico");
    expect
      .soft(await app.promotions.brandCards(), "one of MODO without a logo is not offered")
      .toEqual([]);

    await app.promotions.chooseProvince("brandPicker", "CAPITAL FEDERAL");
    await app.promotions.searchInBrandPicker("coto");
    const coto = (await app.promotions.brandCards()).filter(({ title }) => /coto/i.test(title));
    expect.soft(coto.length, "Coto is a single card").toBe(1);
    expect.soft(coto[0]?.morePromosOnHover, "its detail includes the 30% of MODO").toMatch(/30%/);
    expect.soft(coto[0]?.morePromosOnHover, "saying it is MODO").toMatch(/MODO/);
    await app.promotions.chooseProvince("brandPicker", "");

    await app.promotions.searchInBrandPicker("ypf");
    await modoTick.uncheck();
    expect.soft(await app.promotions.brandCards(), "with the tick off, YPF disappears").toEqual([]);
    expect.soft(await app.promotions.rememberedIncludeModo(), "and that is remembered").toBe(false);
    await modoTick.check();
    expect.soft((await app.promotions.brandCards()).length, "with the tick on, it is back").toBe(1);

    await app.promotions.pickBrand("YPF");
    const placed = await app.promotions.placedOnFlyer();
    expect
      .soft(
        placed.logos.map(({ logoFile }) => logoFile),
        "choosing YPF places the logo of MODO",
      )
      .toContain("modo/317.png");
    expect
      .soft(await app.promotions.expiredLogosOnFlyer(), "and it does not read as expired")
      .toEqual([]);
  },
);

test(
  "Activas filters MODO by province and locality, with its tag and link",
  { tag: "@react" },
  async ({ openApp }) => {
    const app = await openApp({ user: "admin" });
    await app.promotions.open("active");
    await app.promotions.chooseProvince("promotions", "MENDOZA");
    await app.promotions.listActive();

    const modoTick = app.page.getByRole("checkbox", { name: "Incluir MODO" });
    await expect.soft(modoTick, 'Activas has the tick "Incluir MODO", on').toBeChecked();

    const rows = await app.promotions.rows();
    const atomo = rows.find(({ title }) => title === ATOMO);
    expect.soft(atomo, "in Mendoza the supermarket of MODO shows up").toBeDefined();
    expect.soft(atomo?.hasModoTag, "with its tag").toBe(true);
    expect.soft(atomo?.linkText, 'and "Ver en MODO"').toBe("Ver en MODO");
    expect
      .soft(atomo?.linkUrl, "the link opens its page on MODO")
      .toBe("https://www.modo.com.ar/promos/atomo");
    expect
      .soft(atomo?.logoUrl, "its logo comes from the bucket")
      .toMatch(/\/storage\/v1\/object\/public\/flyers\/modo\/328\.png$/);
    expect
      .soft(
        rows.find(({ hasModoTag, logoUrl }) => !hasModoTag && logoUrl)?.logoUrl,
        "the logos of Galicia, from galicia.ar",
      )
      .toMatch(/galicia\.ar/);
    expect.soft(atomo?.hasPercentDot, "with the red dot, as a supermarket of Galicia").toBe(true);
    expect.soft(atomo?.days, "and its days").toBe("Miércoles");
    expect
      .soft(
        rows.filter(({ title }) => title.startsWith("WICO")),
        "with a province chosen, one of MODO without stores does not show up",
      )
      .toEqual([]);
    expect
      .soft(
        rows.some(({ title }) => title === "Farmacia Online Prueba"),
        "an online one does",
      )
      .toBe(true);

    const showsAtomo = async (): Promise<boolean> =>
      (await app.promotions.rows()).some(({ title }) => title === ATOMO);
    await app.promotions.chooseLocality("promotions", MENDOZA_FIRST);
    expect
      .soft(await showsAtomo(), "the locality filter uses the stores of MODO: yes here")
      .toBe(true);
    await app.promotions.chooseLocality("promotions", MENDOZA_SECOND);
    expect.soft(await showsAtomo(), "and not there").toBe(false);
    await app.promotions.chooseLocality("promotions", "");

    await app.promotions.chooseProvince("promotions", "NEUQUEN");
    expect
      .soft(await showsAtomo(), "in Neuquén the supermarket of Mendoza does not show up")
      .toBe(false);
    const modoRows = async (): Promise<number> =>
      (await app.promotions.rows()).filter(({ hasModoTag }) => hasModoTag).length;
    await modoTick.uncheck();
    expect.soft(await modoRows(), "the tick of Activas takes MODO out").toBe(0);
    await modoTick.check();
    expect.soft(await modoRows(), "and puts it back").toBeGreaterThan(0);

    await app.promotions.switchTab("search");
    await expect.soft(modoTick, 'Buscar has the tick "Incluir MODO"').toBeVisible();
  },
);

test(
  "a logo of MODO on the flyer stays current in Marcas vigiladas",
  { tag: "@react" },
  async ({ openApp }) => {
    const app = await openApp({ user: "admin" });
    await app.logoEditor.enter();
    await app.promotions.waitForCatalog();
    await app.promotions.openBrandPickerOver(MARKED_PLACE);
    await app.promotions.searchInBrandPicker("ypf");
    await app.promotions.pickBrand("YPF");

    const watched = await app.promotions.openWatchedBrands();
    expect
      .soft(watched[0]?.status, "Marcas vigiladas: YPF, only on MODO, is current")
      .toBe("Vigente");
    await app.promotions.closeWatchedBrands();

    await app.promotions.setIncludeModo(false);
    expect
      .soft(
        await app.promotions.expiredLogosOnFlyer(),
        "with the tick off, the logo of MODO on the flyer stays current",
      )
      .toEqual([]);
    const watchedWithoutModo = await app.promotions.openWatchedBrands();
    expect
      .soft(watchedWithoutModo[0]?.status, "and so it does on Marcas vigiladas")
      .toBe("Vigente");
    await app.promotions.setIncludeModo(true);
  },
);

test.describe("MODO writes the cities its own way", { tag: "@react" }, () => {
  const SAME_PLACE = [
    { province: "TUCUMAN", locality: "SAN MIGUEL DE TUCUMAN", city: "TUCUMAN", name: "Tucumán" },
    { province: "BUENOS AIRES", locality: "LANUS OESTE", city: "LANUS", name: "Lanús" },
    { province: "RIO NEGRO", locality: "GENERAL ROCA", city: "GRAL ROCA", name: '"Gral Roca"' },
    { province: "CAPITAL FEDERAL", locality: "PALERMO", city: "CABA", name: '"CABA"' },
  ];
  const OTHER_PLACE = [
    { province: "BUENOS AIRES", locality: "MAR DEL PLATA", city: "BAHIA BLANCA", name: "Another" },
    { province: "ENTRE RIOS", locality: "VILLA SAN JOSE", city: "SAN", name: "A short word" },
  ];

  test("the same place matches, a different one does not", async ({ openApp }) => {
    const app = await openApp({ user: "admin" });
    await app.promotions.open("search");
    const shown = ({ province, locality, city }: (typeof SAME_PLACE)[number]) =>
      app.promotions.modoPromotionShownInLocality({ province, locality, cities: [city] });

    for (const place of SAME_PLACE) {
      expect.soft(await shown(place), `${place.name} matches the name of Galicia`).toBe(true);
    }
    for (const place of OTHER_PLACE) {
      expect.soft(await shown(place), `${place.name} does not match`).toBe(false);
    }
    expect
      .soft(
        await app.promotions.modoPromotionShownInLocality({
          province: "MENDOZA",
          locality: "GODOY CRUZ",
          cities: [],
        }),
        "with a province but no cities, it is not hidden when choosing a locality",
      )
      .toBe(true);
  });
});

test(
  "Buscar finds what is only on MODO and repeats nothing",
  { tag: "@react" },
  async ({ openApp }) => {
    const app = await openApp({ user: "admin" });
    await app.promotions.open("search");
    await app.promotions.searchBrands(["YPF", "Coto"]);

    const rows = await app.promotions.rows();
    const ypf = rows.find(({ brand }) => brand === "YPF");
    expect.soft(ypf?.title, "Buscar finds YPF").toBe("YPF");
    expect.soft(ypf?.hasModoTag, "on MODO").toBe(true);
    expect.soft(ypf?.status, "it is found").not.toMatch(/no encontrada/i);
    expect
      .soft(ypf?.note, "on the table, YPF carries the note below the benefit")
      .toMatch(/exclusivamente en cambio de aceite/);
    expect.soft(ypf?.where, 'without a province YPF says "Sin dato" on Dónde').toBe("Sin dato");

    const coto = rows.filter(({ brand }) => brand === "Coto");
    expect
      .soft(
        coto.filter(({ benefit, days }) => benefit.includes("25%") && /martes/i.test(days)).length,
        "Coto brings its 25% on Tuesdays just once",
      )
      .toBe(1);
    expect
      .soft(
        coto.filter(({ benefit }) => benefit.includes("30%")).length,
        "and also the 30% of MODO",
      )
      .toBe(1);

    await app.promotions.chooseProvince("promotions", "MENDOZA");
    const inMendoza = (await app.promotions.rows()).find(({ brand }) => brand === "YPF");
    expect
      .soft(inMendoza?.status, "with a province chosen it is out of the province")
      .toMatch(/fuera de la provincia/i);
    expect.soft(app.pageErrors(), "no JavaScript errors").toEqual([]);
  },
);

test(
  "without the table of MODO, Promociones keeps working with Galicia",
  { tag: "@react" },
  async ({ cloud, openApp }) => {
    cloud.modoTableMissing = true;

    const app = await openApp({ user: "admin" });
    await app.promotions.open("search");

    const catalog = await app.promotions.catalog();
    expect.soft(catalog.length, "the catalog of Galicia is there").toBeGreaterThan(100);
    expect
      .soft(
        catalog.filter(({ origin }) => origin === "modo"),
        "and nothing from MODO",
      )
      .toEqual([]);
    expect.soft(app.pageErrors(), "and no JavaScript errors").toEqual([]);
  },
);
