// Replaces pruebas/t47_franja_sugerir.cjs.
import { localityPromotionIds } from "../../support/cloud/seed-data.ts";
import { expect, test } from "../../support/test.ts";

const LOGOS_STRIP = { x: 140, y: 2650, width: 1000, height: 230 };
const PROVINCE = "NEUQUEN";
const LOCALITY = "SAN MARTIN DE LOS ANDES";
const MAX_LOGOS = 30;
const MIN_CATEGORIES = 3;

test('"Sugerir marcas" fills the strip with brands of the zone', async ({ openApp }) => {
  const app = await openApp();
  const strip = app.logoStrip;
  await strip.open(LOGOS_STRIP, { province: "" });
  await strip.setProvince(PROVINCE);

  await strip.tickNext(1);
  await app.page.waitForTimeout(500);
  const chosenByHand = (await strip.state()).brands.map(({ logo }) => logo);

  await strip.pressSuggest();
  await strip.waitForSuggestions();
  await app.page.waitForTimeout(400);

  const state = await strip.state();
  const facts = await strip.selectedBrandFacts(PROVINCE);
  const suggested = facts.filter((brand) => brand.suggested);
  const places = state.originalLogos;
  expect
    .soft(state.brands.length, "it fills almost every place of the strip")
    .toBeGreaterThanOrEqual(Math.min(places, MAX_LOGOS) - 1);
  expect.soft(state.brands.length, "and no more than those").toBeLessThanOrEqual(places);
  expect.soft(state.brands[0]?.logo, "the one chosen by hand stays first").toBe(chosenByHand[0]);
  const keys = suggested.map(({ brandKey }) => brandKey);
  expect.soft(new Set(keys).size, "no brand is repeated").toBe(keys.length);
  expect
    .soft(new Set(suggested.map(({ category }) => category)).size, "categories vary")
    .toBeGreaterThanOrEqual(MIN_CATEGORIES);
  expect
    .soft(
      suggested.filter(({ hasPromotionThereOrOnline }) => !hasPromotionThereOrOnline),
      "all of them are of the province, or online",
    )
    .toEqual([]);
  expect
    .soft(
      suggested.filter(({ hasLocalPromotion }) => !hasLocalPromotion),
      "with a province chosen it does not suggest online ones",
    )
    .toEqual([]);
  expect.soft(await strip.offersRemoveSuggested(), '"Quitar sugeridas" appears').toBe(true);
  expect
    .soft(
      (await strip.selectionRows()).filter(({ suggestedMark }) => suggestedMark).length,
      "the suggested ones are marked",
    )
    .toBe(state.brands.length - 1);

  await strip.pressRemoveSuggested();
  await app.page.waitForTimeout(200);
  expect
    .soft((await strip.state()).brands.length, '"Quitar sugeridas" leaves the one by hand')
    .toBe(1);
});

test("with a category it suggests only that category", async ({ openApp }) => {
  const app = await openApp();
  const strip = app.logoStrip;
  await strip.open(LOGOS_STRIP, { province: "" });
  await strip.setProvince(PROVINCE);
  const category = await strip.topCategoryIn(PROVINCE);

  await strip.setCategory(category);
  await strip.pressSuggest();
  await strip.waitForSuggestions();
  await app.page.waitForTimeout(300);

  const categories = (await strip.selectedBrandFacts(PROVINCE)).map((brand) => brand.category);
  expect.soft(categories.length, "it suggests something").toBeGreaterThan(0);
  expect
    .soft(
      categories.filter((one) => one !== category),
      "all of that category",
    )
    .toEqual([]);
});

test("with a locality it suggests only the ones of that locality", async ({ openApp }) => {
  const app = await openApp();
  const strip = app.logoStrip;
  await strip.open(LOGOS_STRIP, { province: "" });
  await strip.setProvince(PROVINCE);
  await strip.setLocality(LOCALITY);
  await strip.waitForLocalityBrands();

  await strip.pressSuggest();
  await strip.waitForSuggestions();
  await app.page.waitForTimeout(300);

  const ofLocality = new Set(localityPromotionIds);
  const facts = await strip.selectedBrandFacts(PROVINCE);
  expect.soft(facts.length, "it suggests something").toBeGreaterThan(0);
  expect
    .soft(
      facts.filter(({ promotionId }) => !ofLocality.has(promotionId)),
      "all of that locality",
    )
    .toEqual([]);
});
