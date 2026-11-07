// Replaces pruebas/t92_benchmark.cjs (labels and links, Por comercio, salary-only promotions).
import { expect, test } from "../../support/test.ts";
import {
  seedComparison,
  seedHandLoaded,
  seedMacroLevels,
  seedSalaryOnly,
} from "./benchmark-data.ts";

const SALARY = "Combustible Haberes";
const EMINENT = "Combustible Eminent";

test.beforeEach(({ cloud }) => {
  seedComparison(cloud);
});

test("each promotion links to its page and says when and how much", async ({ openApp }) => {
  const { benchmark } = await openApp({ user: "admin" });
  await benchmark.open();

  const link = async (row: Record<string, unknown>) => (await benchmark.presentPromotion(row)).link;
  expect
    .soft(await link({ fuente: "modo", slug: "abc-oct26", banco: "bbva" }), "MODO")
    .toBe("https://www.modo.com.ar/promos/abc-oct26");
  expect
    .soft(await link({ fuente: "galicia", id: "galicia:g187090", banco: "galicia" }), "Galicia")
    .toBe("https://beneficios.galicia.ar/promocion/187090");
  expect
    .soft(await link({ fuente: "santander", slug: "brand:546", banco: "santander" }), "Santander")
    .toMatch(/brandId=546$/);
  expect
    .soft(await link({ fuente: "manual", fuente_url: "https://x.com/a", banco: "bbva" }), "by hand")
    .toBe("https://x.com/a");

  const singleDay = await benchmark.presentPromotion({
    fecha_desde: "2026-11-10",
    fecha_hasta: "2026-11-10",
  });
  expect.soft(singleDay.schedule, "a promotion of a single day says so").toMatch(/^Sólo el 10\/11/);
  const totalCap = await benchmark.presentPromotion({ tope: 15_000, tope_por: "total" });
  expect.soft(totalCap.cap, 'a total cap says "en total"').toMatch(/en total/);

  const audience = async (segmento_txt: string) =>
    (await benchmark.presentPromotion({ segmento: "clasico", segmento_txt })).audience;
  expect.soft(await audience("Clientes Plus Gold"), "Galicia names its segment").toBe("Plus Gold");
  expect.soft(await audience("Clientes Move"), "whatever it is").toBe("Move");
});

test("Por comercio finds a merchant, by day, with the best one on top", async ({
  cloud,
  openApp,
}) => {
  seedMacroLevels(cloud);
  seedHandLoaded(cloud);
  const { benchmark } = await openApp({ user: "admin" });
  await benchmark.open();

  expect.soft(await benchmark.tabs(), "the tab is there").toContain("Por comercio");
  await benchmark.showView("merchant");
  await benchmark.setMerchantDay(null);
  await benchmark.searchMerchant("ypf");

  const found = await benchmark.merchantResults();
  expect.soft(found.rows, "it lists the promotions of YPF").toBeGreaterThan(0);
  expect.soft(found.banks.length, "of several banks").toBeGreaterThanOrEqual(2);
  expect.soft(found.text, "with the best one on top").toMatch(/La que más devuelve/);

  await benchmark.searchMerchant("zzzz");
  expect
    .soft((await benchmark.merchantResults()).text, "it warns if there are none")
    .toMatch(/No hay promos/);
  await benchmark.searchMerchant("");
  expect
    .soft((await benchmark.merchantResults()).text, "it asks for a name")
    .toMatch(/Escribí el nombre/);

  await benchmark.searchMerchant("ypf");
  await benchmark.setMerchantDay(3);
  const thursday = (await benchmark.merchantResults()).rows;
  expect.soft(thursday, "filtering by day still finds").toBeGreaterThan(0);
  expect.soft(thursday, "and never more than every day").toBeLessThanOrEqual(found.rows);
});

test("promotions only for whoever gets their salary there enter on demand", async ({
  cloud,
  openApp,
}) => {
  seedSalaryOnly(cloud);
  const { benchmark } = await openApp({ user: "admin" });
  await benchmark.open();
  const fuelTitles = async () =>
    (await benchmark.promotions())
      .map(({ title }) => title)
      .filter((title) => title === SALARY || title === EMINENT);

  expect
    .soft(await fuelTitles(), "without the filter, no salary-only promotions")
    .toEqual([EMINENT]);
  expect
    .soft(
      (await benchmark.bestOffer({ titles: [SALARY, EMINENT] }))?.title,
      "without them, Galicia's best is the one for Éminent clients",
    )
    .toBe(EMINENT);

  await benchmark.setIncludeSalaryOnly(true);

  expect.soft(await fuelTitles(), "with the filter, both").toHaveLength(2);
  expect
    .soft(
      (await benchmark.promotions()).find(({ title }) => title === SALARY)?.audience,
      "labelled in full",
    )
    .toBe("Haberes Galicia Éminent");
});
