// Replaces pruebas/t83_super_con_porcentaje.cjs.
import { expect, test } from "../../support/test.ts";

const MARKED_PLACE = { x: 140, y: 2650, width: 300, height: 110 };
const MARKED_STRIP = { x: 140, y: 2650, width: 1000, height: 230 };
const ONLY_PERCENT = { name: /Sólo súper con % de descuento/ };
const SUPERMARKETS = "Supermercados";

function earnsDot({ category, benefit }: { category: string; benefit: string }): boolean {
  return /supermercado/i.test(category) && benefit.includes("%");
}

test(
  "the windows of brands mark the supermarkets with a % discount",
  { tag: "@react" },
  async ({ openApp }) => {
    const app = await openApp({ user: "admin" });
    await app.logoEditor.enter();
    await app.promotions.waitForCatalog();

    const nonSupermarket = (await app.promotions.catalog()).find(
      ({ category }) => category !== SUPERMARKETS,
    );
    expect
      .soft(
        await app.promotions.hasPercentDiscount({ title: "Coto", benefit: "cuotas" }),
        "Coto has a %, even looking at its promotion in installments",
      )
      .toBe(true);
    expect
      .soft(await app.promotions.hasPercentDiscount({ title: "Jumbo" }), "Jumbo has a %")
      .toBe(true);
    expect
      .soft(
        await app.promotions.hasPercentDiscount({ title: nonSupermarket?.title ?? "" }),
        "something that is not a supermarket does not",
      )
      .toBe(false);

    await app.promotions.openBrandPickerOver(MARKED_PLACE);
    const cards = await app.promotions.brandCards();
    const dotted = cards.filter(({ hasPercentDot }) => hasPercentDot).map(({ title }) => title);
    expect.soft(dotted.length, "some cards carry the red dot").toBeGreaterThan(0);
    expect
      .soft(
        await app.promotions.titlesWithPercentDiscount(dotted),
        "the red dot is only on supermarkets with a %",
      )
      .toEqual(dotted);

    await app.page.getByRole("checkbox", ONLY_PERCENT).check();
    const onlyThose = await app.promotions.brandCards();
    const titles = onlyThose.map(({ title }) => title);
    expect.soft(titles.length, "with the tick some are left").toBeGreaterThan(0);
    expect.soft(titles.length, "fewer than before").toBeLessThan(cards.length);
    expect
      .soft(
        await app.promotions.titlesWithPercentDiscount(titles),
        "with the tick only those are left",
      )
      .toEqual(titles);
    expect
      .soft(
        onlyThose.filter(({ hasPercentDot }) => !hasPercentDot),
        "all of them with the dot",
      )
      .toEqual([]);
    await app.promotions.closeBrandPicker();

    expect
      .soft(await app.promotions.percentDotOnFlyer(), "the dot does not show over the flyer")
      .toBe(false);
  },
);

test("Armar franja also has the tick of the % discount", { tag: "@react" }, async ({ openApp }) => {
  const app = await openApp({ user: "admin" });
  await app.logoEditor.enter();
  await app.promotions.waitForCatalog();
  await app.promotions.openLogoStripOver(MARKED_STRIP);
  await expect
    .soft(app.page.getByRole("checkbox", ONLY_PERCENT), "Armar franja also has the tick")
    .toBeVisible();
  await app.promotions.closeLogoStrip();
});

test("Activas and Buscar mark and filter the same way", { tag: "@react" }, async ({ openApp }) => {
  const app = await openApp({ user: "admin" });
  await app.promotions.open("active");
  await app.promotions.chooseProvince("promotions", "BUENOS AIRES");
  await app.promotions.listActive();

  const rows = await app.promotions.rows();
  expect
    .soft(rows.filter(({ hasPercentDot }) => hasPercentDot).length, "Activas: some rows have a dot")
    .toBeGreaterThan(0);
  expect
    .soft(
      rows.filter((row) => row.hasPercentDot !== earnsDot(row)),
      "Activas: the dot is on supermarket promos with a %, and only on them",
    )
    .toEqual([]);

  const coto = rows.filter(({ title }) => title === "Coto");
  expect
    .soft(
      coto.find(({ benefit }) => benefit.includes("%"))?.hasPercentDot,
      "Coto 25% carries the dot",
    )
    .toBe(true);
  expect
    .soft(
      coto.find(({ benefit }) => /cuotas/.test(benefit))?.hasPercentDot,
      "Coto in installments does not",
    )
    .toBe(false);

  const tick = app.page.getByRole("checkbox", ONLY_PERCENT);
  await tick.check();
  const filtered = await app.promotions.rows();
  expect.soft(filtered.length, "Activas: the tick leaves some").toBeGreaterThan(0);
  expect.soft(filtered.length, "Activas: fewer than before").toBeLessThan(rows.length);
  expect
    .soft(
      filtered.filter((row) => !earnsDot(row)),
      "Activas: the tick leaves only supermarkets with a %",
    )
    .toEqual([]);

  await app.promotions.switchTab("search");
  await expect.soft(tick, "Buscar has the same tick, and it follows Activas").toBeChecked();
  await tick.uncheck();
  expect.soft(app.pageErrors(), "no JavaScript errors").toEqual([]);
});

test("Armar franja carries the tick to the full screen", { tag: "@react" }, async ({ openApp }) => {
  const app = await openApp({ user: "admin" });
  await app.logoEditor.enter();
  await app.promotions.openLogoStripOver(MARKED_STRIP);
  const tick = app.page.getByRole("checkbox", ONLY_PERCENT);
  await tick.check();
  await app.page.getByRole("button", { name: "Elegir en pantalla completa" }).click();
  await expect.soft(tick, "Armar franja: the tick travels to the full screen").toBeChecked();
  expect.soft(app.pageErrors(), "no JavaScript errors").toEqual([]);
});
