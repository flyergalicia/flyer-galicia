// Replaces pruebas/t22_franja_filtros_localidad.cjs.
import { localityPromotionIds } from "../../support/cloud/seed-data.ts";
import { expect, test } from "../../support/test.ts";

const LOGOS_STRIP = { x: 140, y: 2650, width: 1000, height: 230 };
const PROVINCE = "NEUQUEN";
const LOCALITY = "SAN MARTIN DE LOS ANDES";
const FIRST_LOGO = { x: 850, y: 2708 };

test("the filters of the window narrow the brands down to a locality", async ({
  cloud,
  openApp,
}) => {
  const app = await openApp();
  const strip = app.logoStrip;
  await app.logoEditor.enter();
  await strip.open(LOGOS_STRIP);

  expect.soft(await strip.listInfo(), "with no filters, it counts all of them").toMatch(/marcas/);
  expect
    .soft(await strip.localityFilterVisible(), "no locality is offered without a province")
    .toBe(false);

  await strip.setProvince(PROVINCE);
  expect
    .soft(await strip.listInfo(), "with a province it says where they are")
    .toMatch(/Neuqu[eé]n/i);
  expect
    .soft(await strip.localityFilterVisible(), "with a province the localities appear")
    .toBe(true);

  const joined = (await strip.matchingBrands()).length;
  await strip.setJoinBranches(false);
  const apart = (await strip.matchingBrands()).length;
  expect
    .soft(apart, '"Juntar sucursales de la misma marca" joins branches of a brand')
    .toBeGreaterThan(joined);
  await strip.setJoinBranches(true);

  await strip.setHideOnline(true);
  const withoutOnline = await strip.matchingBrands();
  expect
    .soft(
      withoutOnline.filter(({ isOnline }) => isOnline),
      '"Sin las de compra online" hides them',
    )
    .toEqual([]);
  await strip.setHideOnline(false);

  await strip.setLocality(LOCALITY);
  expect
    .soft(await strip.brandsColumnText(), "while it asks, it says it is searching")
    .toMatch(/Buscando las promos de San Mart[ií]n De Los Andes/i);
  await strip.waitForLocalityBrands();
  await expect
    .poll(() => strip.listInfo(), { message: "once they arrive, it says where they are" })
    .toMatch(/San Mart[ií]n De Los Andes/i);

  const ofLocality = new Set(localityPromotionIds);
  const brands = await strip.matchingBrands();
  expect.soft(brands.length, "the locality has brands").toBeGreaterThan(0);
  expect
    .soft(
      brands.filter(({ id, isOnline }) => !ofLocality.has(id) && !isOnline),
      "only its promotions and the online ones remain",
    )
    .toEqual([]);

  const callsBefore = cloud.locationCalls;
  await strip.setLocality("");
  await strip.setLocality(LOCALITY);
  await app.page.waitForTimeout(300);
  expect
    .soft(cloud.locationCalls, "choosing it again does not ask Galicia again")
    .toBe(callsBefore);

  await strip.cancel();
  await strip.openPickerAt(FIRST_LOGO);
  const filters = await strip.pickerFilters();
  expect.soft(filters.province, "the window of one logo remembers the province").toBe(PROVINCE);
  expect.soft(filters.locality, "and the locality").toBe(LOCALITY);

  await strip.pickerWriteText();
  expect.soft(await strip.pickerShowsFilters(), "writing a text hides the filters").toBe(false);
});
