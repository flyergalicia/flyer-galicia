// Replaces pruebas/t63_dias_super_real.cjs.
import { expect, test } from "../../support/test.ts";

// The grid of supermarkets on the flyer: its logos have their days printed below.
const PLACES = [
  { at: { x: 905, y: 1310 }, title: "Vea" },
  { at: { x: 730, y: 1310 }, title: "Coto" },
  { at: { x: 710, y: 1465 }, title: "Changomas" },
  { at: { x: 830, y: 1465 }, title: "DIA" },
];
const CENTERING_TOLERANCE_PX = 3;
const OVERLAP_TOLERANCE_PX = 2;

test("the days of a supermarket replace the printed ones, with their look", async ({ openApp }) => {
  const app = await openApp();
  await app.logoEditor.enter();
  await app.promotions.waitForCatalog();

  expect
    .soft(
      await app.promotions.supermarketDaysOnFlyer({ title: "Coto" }),
      "Coto: only the days of the % discount",
    )
    .toBe("Martes");
  expect
    .soft(
      await app.promotions.supermarketDaysOnFlyer({ title: "DIA" }),
      'DIA: "Viernes y Sábado" reads as the flyer writes it',
    )
    .toBe("Viernes y sábados");

  for (const [index, { at, title }] of PLACES.entries()) {
    expect
      .soft(await app.promotions.hasDaysTextBelowLogoAt(at), `${title}: days found below the logo`)
      .toBe(true);
    await app.promotions.openBrandPickerAt(at);
    await app.promotions.searchInBrandPicker(title);
    await app.promotions.pickBrand(title);
    const { texts } = await app.promotions.placedOnFlyer();
    expect
      .soft(texts[index]?.text.replace(/\s+/g, " "), `${title}: its days replace the printed ones`)
      .toBe(await app.promotions.supermarketDaysOnFlyer({ title }));
  }

  const { texts, logos } = await app.promotions.placedOnFlyer();
  expect.soft(texts.length, "four texts on the flyer").toBe(PLACES.length);
  for (const [index, text] of texts.entries()) {
    const logo = logos[index];
    const name = logo?.title ?? String(index);
    expect.soft(text.fontSize, `${name}: letter of the original`).toBeGreaterThanOrEqual(20);
    expect.soft(text.fontSize, `${name}: letter of the original`).toBeLessThanOrEqual(24);
    expect.soft(text.weight, `${name}: not bold`).toBe(500);
    expect.soft(text.color, `${name}: dark as the original`).toMatch(/^#[0-3]/);
    expect
      .soft(Math.abs(text.centerX - (logo?.centerX ?? Number.NaN)), `${name}: centered under logo`)
      .toBeLessThanOrEqual(CENTERING_TOLERANCE_PX);
    expect
      .soft(text.top, `${name}: no text over its logo`)
      .toBeGreaterThanOrEqual((logo?.bottom ?? Number.NaN) - OVERLAP_TOLERANCE_PX);
  }
  expect.soft(app.pageErrors(), "no JavaScript errors").toEqual([]);
});
