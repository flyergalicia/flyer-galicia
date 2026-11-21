// Replaces pruebas/t92_benchmark.cjs (Excel, Actualizar ahora, missing tables and no data).
import { expect, test } from "../../support/test.ts";
import { seedCards, seedComparison, seedOwnWebsites } from "./benchmark-data.ts";

test.beforeEach(({ cloud }) => {
  seedComparison(cloud);
  seedOwnWebsites(cloud);
  seedCards(cloud);
});

test("the Excel carries the same numbers as the screen", async ({ openApp }) => {
  const { benchmark, page } = await openApp({ user: "admin" });
  await benchmark.open();

  const { sheetNames, sheets } = await benchmark.downloadExcel();

  expect
    .soft(sheetNames, "the sheets")
    .toEqual(["Resumen", "Por rubro", "Por marca", "Semana", "Tarjetas y salas VIP", "Promos"]);
  const supermarketsBbva = sheets["Por rubro"]?.find(
    ([rubro, , bank]) => rubro === "Supermercados" && bank === "BBVA",
  );
  expect.soft(supermarketsBbva?.[4], "Supermarkets/BBVA gives $30.000, as on screen").toBe(30_000);
  expect.soft(supermarketsBbva?.[5], "20 %, as on screen").toBe(20);
  expect
    .soft((sheets["Tarjetas y salas VIP"]?.length ?? 0) - 1, "the sheet of cards has its 4 rows")
    .toBe(4);
  expect
    .soft((sheets.Promos?.length ?? 0) - 1, "Promos has the same promotions as the screen")
    .toBe((await benchmark.promotions()).length);
  expect
    .soft(
      sheets.Resumen?.find(([label]) => label === "Supermercados"),
      "Resumen keeps the reference purchases used",
    )
    .toEqual(["Supermercados", 150_000]);
  await expect
    .soft(page.getByRole("button", { name: "Descargar Excel" }), "the button is back to its text")
    .toBeVisible();
});

test("Actualizar ahora asks bank by bank, then websites, catalog and places", async ({
  cloud,
  openApp,
}) => {
  const { benchmark } = await openApp({ user: "admin" });
  await benchmark.open();

  await benchmark.refreshNow();

  expect
    .soft(
      cloud.benchmarkCalls.map(({ action, banco }) =>
        typeof banco === "string" ? `${String(action)}:${banco}` : action,
      ),
      "MODO bank by bank, the websites of BBVA and Supervielle, Galicia and at last the places",
    )
    .toEqual([
      "sync:galicia",
      "sync:bbva",
      "sync:macro",
      "sync:supervielle",
      "sync:santander",
      "sync:icbc",
      "bbva",
      "supervielle",
      "galicia",
      "marcas",
    ]);
});

test("without the tables it says so and offers Reintentar; without data it says how to get it", async ({
  cloud,
  openApp,
}) => {
  const { benchmark } = await openApp({ user: "admin" });
  await benchmark.open();

  cloud.benchmarkTablesMissing = true;
  await benchmark.reload();
  const missing = await benchmark.screenText();
  expect
    .soft(missing, "without the tables the screen asks for the migration")
    .toMatch(/migración 039/);
  expect.soft(missing, "and offers Reintentar").toMatch(/Reintentar/);

  cloud.benchmarkTablesMissing = false;
  cloud.benchmarkPromotions = [];
  cloud.benchmarkManual = [];
  await benchmark.reload();
  expect
    .soft(await benchmark.screenText(), "without data it says there are none yet")
    .toMatch(/Todavía no hay promos/);
});
