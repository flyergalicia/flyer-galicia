// Replaces pruebas/t92_benchmark.cjs (promotions loaded by hand and benefits of a package).
import { expect, test } from "../../support/test.ts";
import { seedComparison, seedHandLoaded, seedPackageBenefit } from "./benchmark-data.ts";

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
