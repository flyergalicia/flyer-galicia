// Replaces pruebas/t85_pct_por_zona.cjs.
import { type Cloud, localitiesOf } from "../../support/cloud/index.ts";
import { expect, test } from "../../support/test.ts";

const MARKED_PLACE = { x: 140, y: 2650, width: 300, height: 110 };
const ONLY_PERCENT = { name: /Sólo súper con % de descuento/ };
const PROVINCE = "NEUQUEN";
const TITLE = "Super Prueba";
const INSTALLMENTS_ID = 990_001;
const DISCOUNT_ID = 990_002;

const SUPERMARKET = {
  titulo: TITLE,
  subtitulo: "Supermercados",
  imagen: "superprueba_180.png",
  fecha_hasta: "2027-12-31",
  provincias: [PROVINCE],
  proximamente: false,
  tipo_promocion: "Marca",
  primera_vez: "2026-01-01",
  fecha_desde: null,
};

/** A supermarket with installments in the locality and the 20% only elsewhere in the province. */
function addSupermarket(cloud: Cloud): void {
  cloud.promotionCatalog = [
    ...cloud.promotionCatalog,
    {
      ...SUPERMARKET,
      id: INSTALLMENTS_ID,
      beneficio: "Hasta 12 cuotas sin interés.",
      dias: "Todos los días",
    },
    { ...SUPERMARKET, id: DISCOUNT_ID, beneficio: "20% de ahorro.", dias: "Lunes" },
  ];
  cloud.extraLocalityPromotionIds.push(INSTALLMENTS_ID);
}

const LOCALITY = localitiesOf(PROVINCE).find((name) => /MARTIN DE LOS ANDES/.test(name));

test("the flyer days look at the chosen zone", { tag: "@react" }, async ({ cloud, openApp }) => {
  addSupermarket(cloud);
  const app = await openApp({ user: "admin" });
  await app.promotions.open("active");

  expect.soft(LOCALITY, "the locality of the test exists").toBeDefined();
  const inLocality = { provinces: [PROVINCE], locality: LOCALITY ?? "" };
  const inProvince = { provinces: [PROVINCE] };
  const query = { title: TITLE, benefit: "cuotas" };

  expect
    .soft(await app.promotions.hasPercentDiscount(query), "in the country it has a %")
    .toBe(true);
  expect
    .soft(await app.promotions.hasPercentDiscount(query, inProvince), "in the province, too")
    .toBe(true);
  expect
    .soft(
      await app.promotions.supermarketDaysOnFlyer(query, inProvince),
      "and its days go on the flyer",
    )
    .toBe("Lunes");
  expect
    .soft(
      await app.promotions.hasPercentDiscount(query, inLocality),
      "in the locality it only has installments: no %",
    )
    .toBe(false);
  expect
    .soft(
      await app.promotions.supermarketDaysOnFlyer(query, inLocality),
      "and no days for the flyer",
    )
    .toBe("");
});

test("the red dot and the tick of the windows look at the chosen zone", async ({
  cloud,
  openApp,
}) => {
  addSupermarket(cloud);
  const app = await openApp({ user: "admin" });
  await app.logoEditor.enter();
  await app.promotions.waitForCatalog();
  const locality = LOCALITY;

  const card = async () => (await app.promotions.brandCards()).find(({ title }) => title === TITLE);

  await app.promotions.openBrandPickerOver(MARKED_PLACE);
  await app.promotions.chooseProvince("brandPicker", PROVINCE);
  await app.promotions.chooseLocality("brandPicker", locality ?? "");
  await app.promotions.searchInBrandPicker("super prueba");
  const withLocality = await card();
  expect.soft(withLocality, "window with a locality: it shows up").toBeDefined();
  expect.soft(withLocality?.hasPercentDot, "without the red dot").toBe(false);

  const tick = app.page.getByRole("checkbox", ONLY_PERCENT);
  await tick.check();
  expect.soft(await card(), 'with the tick "Sólo súper con %" it does not show up').toBeUndefined();
  expect
    .soft(
      (await app.promotions.brandCards()).filter(({ hasPercentDot }) => !hasPercentDot),
      "and all those left carry the dot",
    )
    .toEqual([]);
  await tick.uncheck();

  await app.promotions.chooseLocality("brandPicker", "");
  const withProvince = await card();
  expect
    .soft((await app.promotions.localityField("brandPicker")).inUse, "only the province is left")
    .toBe("");
  expect.soft(withProvince?.hasPercentDot, "only with the province: with the dot").toBe(true);
  expect.soft(withProvince?.detail, 'and "2 promos"').toMatch(/2 promos/);

  await tick.check();
  expect.soft((await card())?.hasPercentDot, "and it passes the tick").toBe(true);
  await tick.uncheck();
  await app.promotions.closeBrandPicker();
});

test("a card is one logo: several promotions read as a count, with the detail on hover", async ({
  openApp,
}) => {
  const province = "CAPITAL FEDERAL";
  const app = await openApp({ user: "admin" });
  await app.logoEditor.enter();
  await app.promotions.waitForCatalog();

  await app.promotions.openBrandPickerOver(MARKED_PLACE);
  await app.promotions.chooseProvince("brandPicker", province);
  await app.promotions.searchInBrandPicker("coto");

  const coto = (await app.promotions.brandCards()).find(({ title }) => title === "Coto");
  const offers = await app.promotions.currentOfferCount("Coto", province);
  expect.soft(offers, "Coto has several promotions there").toBeGreaterThan(1);
  expect
    .soft(coto?.morePromos, "Coto is a single logo and says how many")
    .toBe(`${String(offers)} promos`);
  expect.soft(coto?.morePromosOnHover, "with the detail on hover").toMatch(/cuotas/i);
  expect.soft(app.pageErrors(), "no JavaScript errors").toEqual([]);
});
