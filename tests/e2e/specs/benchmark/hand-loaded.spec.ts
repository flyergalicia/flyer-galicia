// Replaces pruebas/t92_benchmark.cjs (promotions loaded by hand and benefits of a package).
import { expect, test } from "../../support/test.ts";
import { seedComparison, seedHandLoaded, seedPackageBenefit } from "./benchmark-data.ts";

const PACKAGE_CONDITION = "Paquete Black+ All · Visa Signature por NFC";

test.beforeEach(({ cloud }) => {
  seedComparison(cloud);
  seedHandLoaded(cloud);
});

test(
  "a hand-loaded promotion enters the comparison and its page is hidden",
  { tag: "@react" },
  async ({ openApp }) => {
    const { benchmark } = await openApp({ user: "admin" });
    await benchmark.open();

    const best = await benchmark.bestOffer({ bank: "santander", rubro: "Combustible" });
    expect.soft(best?.title, "a hand-loaded one of Santander enters").toBe("YPF");
    expect.soft(best?.source, "as hand-loaded").toBe("manual");
    expect.soft(best?.returned, "15 %: $9.000 on a fill of $60.000").toBe(9000);
    expect
      .soft(
        (await benchmark.promotions()).map(({ title }) => title),
        "one that already ended does not count",
      )
      .not.toContain("Vieja SA");
    expect
      .soft(
        (await benchmark.sourceLabels()).find(({ text }) => text.startsWith("Santander"))?.text,
        "the label of Santander says how many it has",
      )
      .toMatch(/1 cargada a mano/);
    expect
      .soft(await benchmark.screenText(), "the reminder to review them is no longer shown")
      .not.toMatch(/Es día de revisar las promos cargadas a mano/);
    expect
      .soft(await benchmark.tabs(), 'the tab "Cargadas a mano" is not shown, not even to the admin')
      .not.toEqual(expect.arrayContaining([expect.stringMatching(/Cargadas a mano/)]));
  },
);

test(
  "Semana lists all the promotions of a bank on a day",
  { tag: "@react" },
  async ({ openApp }) => {
    const { benchmark } = await openApp({ user: "admin" });
    await benchmark.open();
    await benchmark.showView("week");

    const listing = await benchmark.openFirstDayListing();

    expect.soft(listing, 'there is a "Ver las N promos"').not.toBeNull();
    expect.soft(listing?.announced, "for more than one").toBeGreaterThan(1);
    expect
      .soft(listing?.rows, "it lists them all, up to 120")
      .toBe(Math.min(listing?.announced ?? 0, 120));
    expect.soft(listing?.hasHeading, "with its heading").toBe(true);
  },
);

test("the administrator adds one, and it needs a percent or installments", async ({
  cloud,
  openApp,
}) => {
  const { benchmark } = await openApp({ user: "admin" });
  await benchmark.open();

  await benchmark.showHandLoadedPromotions();
  const page = await benchmark.screenText();
  expect.soft(page, "the page lists them").toMatch(/Promos cargadas a mano/);
  expect.soft(page, "the one that ended is marked").toMatch(/Vencida/);
  const buttons = await benchmark.buttons();
  expect.soft(buttons, "with + Agregar promo").toContain("+ Agregar promo");
  expect
    .soft(
      buttons.filter((label) => label === "Editar"),
      "and Editar on each",
    )
    .toHaveLength(2);

  await benchmark.startNewHandLoadedPromotion();
  await benchmark.fillHandLoadedPromotion({
    bank: "macro",
    rubro: "Supermercados",
    title: "Changomas",
    percent: "20",
    cap: "15000",
    capPerMonth: true,
    days: [2],
  });
  await benchmark.saveEditor();
  await benchmark.waitForEditorClosed();
  await benchmark.waitForData();

  expect
    .soft(
      cloud.benchmarkManual.find(({ titulo }) => titulo === "Changomas"),
      "it saves Macro's (20 %, cap $15.000 per month, Wednesdays, the whole country)",
    )
    .toMatchObject({
      banco: "macro",
      pct: 20,
      tope: 15_000,
      tope_por: "month",
      dias_n: [2],
      provincias: null,
    });
  const added = (await benchmark.promotions()).find(({ title }) => title === "Changomas");
  expect.soft(added?.days, "it enters the comparison at once, with its days").toBe("Miércoles");
  expect.soft(added?.source, "as hand-loaded").toBe("manual");
  expect.soft(added?.brandKey, "and the same brand key as other sources").toBe("changomas");

  await benchmark.startNewHandLoadedPromotion();
  await benchmark.fillHandLoadedPromotion({ title: "Sin beneficio" });
  await benchmark.saveEditor();
  expect
    .soft(await benchmark.editorIsOpen(), "without % or installments it does not save")
    .toBe(true);
});

test("somebody else cannot edit and sees no reminder", async ({ cloud, openApp }) => {
  cloud.setPermissions("asesor", { benchmark: true });
  const { benchmark } = await openApp();
  await benchmark.open();

  await benchmark.showHandLoadedPromotions();

  const buttons = await benchmark.buttons();
  expect.soft(buttons, "not an admin: no + Agregar promo").not.toContain("+ Agregar promo");
  expect.soft(buttons, "not an admin: no Editar").not.toContain("Editar");
  expect
    .soft(await benchmark.screenText(), "not an admin: no reminder to review")
    .not.toMatch(/Es día de revisar/);
});

// Split in two: the page of hand-loaded promotions is shown to nobody, so only the labels can be
// seen on the React version; the page and its editor stay in the second part.
test("a benefit of a package is labelled", { tag: "@react" }, async ({ cloud, openApp }) => {
  seedPackageBenefit(cloud);
  const { benchmark } = await openApp({ user: "admin" });
  await benchmark.open();

  expect
    .soft(
      (await benchmark.promotions()).find(({ title }) => title === "Supermercados")?.audience,
      'it shows "Sólo Paquete Black+ All"',
    )
    .toBe("Paquete Black+ All");
  expect
    .soft(
      (await benchmark.sourceLabels()).find(({ text }) => text.startsWith("Macro"))?.text,
      "Macro by the assisted load: the label says so",
    )
    .toMatch(/carga asistida/);
});

test("the condition of a benefit of a package is edited", async ({ cloud, openApp }) => {
  seedPackageBenefit(cloud);
  const { benchmark } = await openApp({ user: "admin" });
  await benchmark.open();

  await benchmark.showHandLoadedPromotions();
  expect
    .soft(await benchmark.screenText(), "the page shows the condition of the package")
    .toContain(PACKAGE_CONDITION);

  await benchmark.editHandLoadedPromotion("BBVA", "Supermercados");
  expect
    .soft(await benchmark.handLoadedCondition(), "the editor brings the condition saved")
    .toBe(PACKAGE_CONDITION);
  await benchmark.fillHandLoadedPromotion({ condition: "Paquete Black+ Travel" });
  await benchmark.saveEditor();
  await benchmark.waitForEditorClosed();
  await benchmark.waitForData();
  expect
    .soft(
      cloud.benchmarkManual.find(({ id }) => id === "pq1")?.condicion,
      "saving writes the condition",
    )
    .toBe("Paquete Black+ Travel");
});
