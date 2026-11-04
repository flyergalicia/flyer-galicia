// Replaces pruebas/t59_dias_super.cjs.
import { expect, test } from "../../support/test.ts";

const MARKED_PLACE = { x: 140, y: 2650, width: 300, height: 110 };
const DAYS_TICK = /Si es un súper, poner también sus días debajo/;
const SUPERMARKETS = "Supermercados";

const TEXT_STYLE = { color: "rgb(232, 49, 42)", font: "bold 22px Arial" };
const TEST_ARTWORK = {
  width: 800,
  height: 600,
  blocks: [
    { x: 60, y: 60, width: 200, height: 80, color: "rgb(34, 34, 34)" },
    { x: 400, y: 60, width: 200, height: 80, color: "rgb(34, 34, 34)" },
  ],
  texts: [
    { text: "Lunes y martes", x: 80, baseline: 172, ...TEXT_STYLE },
    { text: "Viernes", x: 450, baseline: 158, ...TEXT_STYLE },
  ],
};

test("Activas shows the days of supermarkets and of no other category", async ({ openApp }) => {
  const app = await openApp({ user: "admin" });
  await app.promotions.open("active");
  await app.promotions.chooseProvince("promotions", "BUENOS AIRES");
  await app.promotions.listActive();

  const rows = await app.promotions.rows();
  const supermarkets = rows.filter(({ category }) => category === SUPERMARKETS);
  expect
    .soft(
      supermarkets.filter(({ days }) => days !== "").length,
      "Activas shows the days of supermarkets",
    )
    .toBeGreaterThan(0);
  const catalog = await app.promotions.catalog();
  expect
    .soft(
      catalog.some(({ category, days }) => category !== SUPERMARKETS && days !== ""),
      "other categories do publish days",
    )
    .toBe(true);
  expect
    .soft(
      rows.filter(({ category, days }) => category !== SUPERMARKETS && days !== ""),
      "but they do not show them",
    )
    .toEqual([]);
});

test("the printed days of a logo are found, separate or stuck to it", async ({ openApp }) => {
  const app = await openApp();

  const separate = await app.promotions.findDaysTextOn(TEST_ARTWORK, {
    x: 56,
    y: 56,
    width: 208,
    height: 88,
  });
  const top = separate.daysText?.top;
  expect.soft(top, "it finds the days text separate below the logo").toBeGreaterThanOrEqual(150);
  expect.soft(top, "right below the logo").toBeLessThanOrEqual(160);

  const stuck = await app.promotions.findDaysTextOn(TEST_ARTWORK, {
    x: 396,
    y: 56,
    width: 208,
    height: 110,
  });
  expect.soft(stuck.logoHeight, "it tells the stuck days from the logo").toBeLessThanOrEqual(90);
  expect.soft(stuck.daysText?.top, "and the text stays under the logo").toBeGreaterThanOrEqual(140);
});

test("placing a supermarket brings its days, unless the tick is off", async ({ openApp }) => {
  const app = await openApp();
  await app.logoEditor.enter();
  await app.promotions.waitForCatalog();

  const withDays = (await app.promotions.catalog()).filter(
    ({ category, days, hasLogo }) => category === SUPERMARKETS && days && hasLogo,
  );
  expect.soft(withDays.length, "the catalog has supermarkets with days").toBeGreaterThan(0);
  const title = withDays[0]?.title ?? "";
  const days = await app.promotions.supermarketDaysOnFlyer({ title });

  await app.promotions.openBrandPickerOver(MARKED_PLACE);
  await expect
    .soft(
      app.page.getByRole("checkbox", { name: DAYS_TICK }),
      "the window of a logo brings the days tick on",
    )
    .toBeChecked();
  await app.promotions.searchInBrandPicker(title);
  await app.promotions.pickBrand(title);

  const placed = await app.promotions.placedOnFlyer();
  expect
    .soft(
      placed.texts.map(({ text }) => text),
      "the logo gets its days as a text",
    )
    .toEqual([days]);
  expect
    .soft((await app.logoEditor.changes()).length, "placing it leaves the logo and its days")
    .toBe(2);
  expect.soft(placed.selectedTitle, "the logo stays selected").toBe(title);

  await app.flyerEditor.restoreDefaults();
  await app.promotions.openBrandPickerOver(MARKED_PLACE);
  await app.page.getByRole("checkbox", { name: DAYS_TICK }).uncheck();
  await app.promotions.searchInBrandPicker(title);
  await app.promotions.pickBrand(title);

  expect
    .soft((await app.promotions.placedOnFlyer()).texts, "without the tick, only the logo")
    .toEqual([]);
  expect.soft(app.pageErrors(), "no JavaScript errors").toEqual([]);
});
