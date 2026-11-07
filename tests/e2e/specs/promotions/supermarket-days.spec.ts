// Replaces pruebas/t59_dias_super.cjs.
import { expect, test } from "../../support/test.ts";

const MARKED_PLACE = { x: 140, y: 2650, width: 300, height: 110 };
const DAYS_TICK = /Si es un súper, poner también sus días debajo/;
const SUPERMARKETS = "Supermercados";

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
