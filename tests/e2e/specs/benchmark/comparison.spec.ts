// Replaces pruebas/t92_benchmark.cjs (who wins, reference purchase, filters and views).
import { expect, test } from "../../support/test.ts";
import { seedComparison } from "./benchmark-data.ts";

const SUPERMARKETS = "Supermercados";
const PHARMACY = "Salud y Bienestar";

test.beforeEach(({ cloud }) => {
  seedComparison(cloud);
});

test(
  "what it gives back decides, and old or not yet started promotions do not count",
  { tag: "@react" },
  async ({ openApp }) => {
    const { benchmark } = await openApp({ user: "admin" });
    await benchmark.open();

    const promotions = await benchmark.promotions();
    const titles = promotions.map(({ title }) => title);
    expect.soft(promotions, "7 current promotions").toHaveLength(7);
    expect.soft(titles, "one that ended does not count").not.toContain("Vencida SA");
    expect.soft(titles, "one not yet started does not count").not.toContain("Proxima SA");

    const returned = async (bank: string, rubro: string) =>
      (await benchmark.bestOffer({ bank, rubro }))?.returned;
    expect
      .soft(
        await returned("galicia", SUPERMARKETS),
        "the lower of purchase × % and the cap: Galicia",
      )
      .toBe(10_000);
    expect.soft(await returned("bbva", SUPERMARKETS), "the same for BBVA").toBe(30_000);
    expect.soft(await returned("macro", SUPERMARKETS), "the same for Macro").toBe(5000);
    expect.soft(await returned("galicia", PHARMACY), "pharmacy on $40.000: Galicia").toBe(12_000);
    expect.soft(await returned("bbva", PHARMACY), "pharmacy: the cap limits BBVA").toBe(5000);

    const labels = await benchmark.sourceLabels();
    const label = (bank: string) => labels.find(({ text }) => text.startsWith(bank));
    expect.soft(label("BBVA")?.stale, "a source read 20 days ago is marked as old").toBe(true);
    expect.soft(label("Galicia")?.stale, "one read today is not").toBe(false);
    expect.soft(label("Macro")?.text, "a source with an error warns").toContain("⚠");
  },
);

test(
  "the summary by rubro names who wins, with installments apart",
  { tag: "@react" },
  async ({ openApp }) => {
    const { benchmark } = await openApp({ user: "admin" });
    await benchmark.open();

    expect
      .soft(await benchmark.rubroWinners(SUPERMARKETS), "BBVA wins in supermarkets, not Galicia")
      .toEqual(["competitor"]);
    expect
      .soft(await benchmark.rubroWinners(PHARMACY), "Galicia wins in pharmacy")
      .toEqual(["galicia"]);
    const headline = await benchmark.headline();
    expect
      .soft(headline, "the summary counts the rubros Galicia won")
      .toMatch(/Galicia devuelve más en 1/);
    expect.soft(headline, "and the ones it lost to BBVA").toMatch(/BBVA en 1/);
    expect
      .soft(await benchmark.tableCells(), "installments compare apart (Santander: 12)")
      .toEqual(expect.arrayContaining([expect.stringMatching(/12 cuotas/)]));
  },
);

test(
  "changing the reference purchase changes the winner and is remembered",
  { tag: "@react" },
  async ({ openApp }) => {
    const { benchmark } = await openApp({ user: "admin" });
    await benchmark.open();

    await benchmark.setReferencePurchase(SUPERMARKETS, 20_000);

    expect
      .soft(
        (await benchmark.bestOffer({ bank: "galicia", rubro: SUPERMARKETS }))?.returned,
        "with a purchase of $20.000: Galicia 5.000",
      )
      .toBe(5000);
    expect
      .soft(
        (await benchmark.bestOffer({ bank: "bbva", rubro: SUPERMARKETS }))?.returned,
        "and BBVA 4.000",
      )
      .toBe(4000);
    expect
      .soft(await benchmark.rememberedReferencePurchases(), "the purchase stays in the PC")
      .toMatch(/20000/);
  },
);

test(
  "province, audience and card type narrow what counts",
  { tag: "@react" },
  async ({ openApp }) => {
    const { benchmark } = await openApp({ user: "admin" });
    await benchmark.open();
    const all = (await benchmark.promotions()).length;
    const titles = async () => (await benchmark.promotions()).map(({ title }) => title);
    const banks = async () => (await benchmark.promotions()).map(({ bank }) => bank);

    await benchmark.setProvince("CAPITAL FEDERAL");
    expect
      .soft((await benchmark.promotions()).length, "a province leaves only what is valid there")
      .toBeLessThan(all);
    expect
      .soft(await titles(), "YPF is of Buenos Aires by the places of its brand")
      .not.toContain("YPF");

    await benchmark.setProvince("BUENOS AIRES");
    expect
      .soft(await titles(), "the places of the brand complete a promotion without them")
      .toContain("YPF");
    await benchmark.setProvince("");

    await benchmark.setAudience("classic");
    expect.soft(await banks(), "Premium only: not on Clásico/Gold").not.toContain("macro");
    await benchmark.setAudience("premium");
    expect.soft(await banks(), "Premium only: yes on Premium").toContain("macro");
    await benchmark.setAudience("all");

    await benchmark.setCardType("debit");
    const withDebit = await titles();
    expect.soft(withDebit, "Débito leaves the promotions with debit").toContain("YPF");
    expect.soft(withDebit, "and only those").not.toContain("Coto");
  },
);

test("the views by brand and by day", { tag: "@react" }, async ({ openApp }) => {
  const { benchmark } = await openApp({ user: "admin" });
  await benchmark.open();

  await benchmark.showView("brand");
  const rows = await benchmark.tableRows();
  expect
    .soft(
      rows.find((row) => /^ ?Coto/.test(row)),
      "BBVA wins Coto",
    )
    .toMatch(/BBVA gana/);
  expect
    .soft(
      rows.find((row) => /^ ?Farmacity/.test(row)),
      "Galicia wins Farmacity",
    )
    .toMatch(/Galicia gana/);

  await benchmark.setOutcome("we-lose");
  const lost = await benchmark.listedBrands();
  expect.soft(lost, 'the filter "Perdemos" leaves one').toHaveLength(1);
  expect.soft(lost[0], "and it is Coto").toMatch(/Coto/);
  await benchmark.setOutcome("all");

  await benchmark.showView("week");
  expect
    .soft(await benchmark.firstColumn(), "Semana: a row per day")
    .toEqual(["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]);
});
