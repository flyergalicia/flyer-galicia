// Replaces pruebas/t92_benchmark.cjs (web sources, Galicia vs X, shared promotions, levels).
import { expect, test } from "../../support/test.ts";
import {
  promotion,
  seedComparison,
  seedMacroLevels,
  seedOwnWebsites,
  seedSharedAndUpcoming,
} from "./benchmark-data.ts";

const FUEL = "Combustible";

test.describe("with the websites of the banks", () => {
  test.beforeEach(({ cloud }) => {
    seedComparison(cloud);
    seedOwnWebsites(cloud);
  });

  test(
    "the same promotion counts once and the website one stays",
    { tag: "@react" },
    async ({ openApp }) => {
      const { benchmark } = await openApp({ user: "admin" });
      await benchmark.open();
      const promotions = await benchmark.promotions();

      const pharmacy = promotions.filter(
        ({ title, bank }) => title === "Farmacity" && bank === "bbva",
      );
      expect.soft(pharmacy, "BBVA on MODO and on its website counts once").toHaveLength(1);
      expect.soft(pharmacy[0]?.source, "and it is the one of the website").toBe("bbva");
      expect
        .soft(
          (await benchmark.bestOffer({ bank: "bbva", titles: ["Farmacity"] }))?.returned,
          "with its cap of 8.000",
        )
        .toBe(8000);
      expect
        .soft(
          promotions.find(({ title }) => title === "Cabify")?.returned,
          '"100% OFF" is no refund',
        )
        .toBeNull();

      const labels = await benchmark.sourceLabels();
      const label = (bank: string) => labels.find(({ text }) => text.startsWith(bank))?.text;
      expect.soft(label("BBVA"), "BBVA says it has a website").toMatch(/MODO \+ web propia/);
      expect.soft(label("Galicia"), "Galicia says it has a website").toMatch(/MODO \+ web propia/);
      expect.soft(label("Macro"), "Macro remains through MODO").toMatch(/vía MODO/);
      expect
        .soft(await benchmark.mostInstallments("galicia"), "the 18 of Galicia's own catalog enter")
        .toBe(18);
    },
  );

  test('"Galicia vs BBVA" puts it in words', { tag: "@react" }, async ({ openApp }) => {
    const { benchmark } = await openApp({ user: "admin" });
    await benchmark.open();

    await benchmark.showView("versus");

    const tabs = await benchmark.tabs();
    expect.soft(tabs, 'the tab "Galicia vs BBVA" is there').toContain("Galicia vs BBVA");
    expect.soft(tabs, 'and "Evolución" no longer').not.toContain("Evolución");
    const text = await benchmark.screenText();
    expect.soft(text, "where we are strong").toMatch(/Dónde somos fuertes/);
    expect
      .soft(text, "Farmacity, with numbers and conditions")
      .toMatch(
        /Farmacity: Galicia devuelve \$12\.000 \(30 %, tope \$15\.000 por mes, lunes\) contra \$8\.000/,
      );
    expect.soft(text, "where they beat us").toMatch(/Dónde nos ganan/);
    expect.soft(text, "Coto: what Galicia gives").toMatch(/Coto: Galicia devuelve \$10\.000/);
    expect.soft(text, "Coto: what BBVA gives").toMatch(/contra \$30\.000.{0,70}de BBVA/);
    expect
      .soft(text, "installments: Galicia gets to 18 and BBVA to 12 in supermarkets")
      .toMatch(/Supermercados[^·]*Galicia 18 cuotas[^·]*BBVA 12 cuotas/);
    expect.soft(text, "installments: more of them at Galicia").toMatch(/más cuotas Galicia/);
  });

  test(
    "promotions shared by every bank and promotions yet to start",
    { tag: "@react" },
    async ({ cloud, openApp }) => {
      seedSharedAndUpcoming(cloud);
      const { benchmark } = await openApp({ user: "admin" });
      await benchmark.open();

      const promotions = await benchmark.promotions();
      expect
        .soft(
          promotions.filter(({ banksSharing }) => (banksSharing ?? 0) > 1),
          "those valid with any bank are not compared",
        )
        .toEqual([]);
      const best = await benchmark.bestOffer({ bank: "galicia", rubro: FUEL });
      expect.soft(best?.title, "its own promotion of Tuesdays wins, not the shared 50%").toBe(FUEL);
      expect.soft(best?.returned, "25 % on $60.000").toBe(15_000);
      expect
        .soft(
          promotions.map(({ title }) => title),
          "one that starts in 30 days does not enter (only the next 15)",
        )
        .not.toContain("Shell Lejana");

      await benchmark.setRubro(FUEL);
      await benchmark.showView("rubro");
      const text = await benchmark.screenText();
      expect.soft(text, 'the one in 10 days enters as "Empieza el dd/mm"').toMatch(/Empieza el/);
      expect.soft(text, "the shared ones are told apart").toMatch(/Con MODO y cualquier banco/);
      expect
        .soft(text.match(/WICO Combustibles: 15% de reintegro/g), "and only once")
        .toHaveLength(1);
      expect.soft(text.match(/WICO Combustibles:/g), "with no other mention").toHaveLength(1);

      const santander = (await benchmark.sourceLabels()).find(({ text: label }) =>
        label.startsWith("Santander"),
      )?.text;
      expect
        .soft(santander, "Santander without its monthly load says so")
        .toMatch(/se carga una vez por mes/);
      expect.soft(santander, "without marking it as an error").not.toContain("⚠");
    },
  );

  test(
    "a warning appears only with many promotions of BBVA with no rubro",
    { tag: "@react" },
    async ({ cloud, openApp }) => {
      const { benchmark, page } = await openApp({ user: "admin" });
      await benchmark.open();
      expect
        .soft(await benchmark.screenText(), "with few it does not bother")
        .not.toMatch(/no informa el rubro de sus promos/);

      for (let index = 0; index < 60; index += 1) {
        cloud.benchmarkPromotions.push(
          promotion({
            k: `o${String(index)}`,
            banco: "bbva",
            fuente: "bbva",
            rubro: "Otros",
            titulo: `Otra ${String(index)}`,
          }),
        );
      }
      await benchmark.reload();

      await expect
        .soft(
          page.getByText(/no informa el rubro de sus promos: 61 quedan en/),
          "with many, the screen warns",
        )
        .toBeVisible();
    },
  );
});

test.describe("with the levels of Macro Selecta", () => {
  test.beforeEach(({ cloud }) => {
    seedComparison(cloud);
    seedMacroLevels(cloud);
  });

  test(
    "the most accessible of a tie is shown and its audience is named",
    { tag: "@react" },
    async ({ openApp }) => {
      const { benchmark } = await openApp({ user: "admin" });
      await benchmark.open();

      const best = await benchmark.bestOffer({ bank: "macro", rubro: FUEL });
      expect.soft(best?.returned, "levels 2 and 4 tie").toBe(18_000);
      expect.soft(best?.cap, "the most accessible: cap $30.000, not $90.000").toBe(30_000);
      expect.soft(best?.audience, "named by its level").toBe("Selecta Nivel 2");
      const general = (await benchmark.promotions()).find(
        ({ bank, cap }) => bank === "macro" && cap === 10_000,
      );
      expect
        .soft(
          general?.audience,
          'the general 20 % of Macro says "Sólo Visa Platinum", not "Premium"',
        )
        .toBe("Visa Platinum");
    },
  );

  test(
    "a website promotion with no place is shown with a province, marked",
    { tag: "@react" },
    async ({ openApp }) => {
      const { benchmark } = await openApp({ user: "admin" });
      await benchmark.open();

      await benchmark.setProvince("CAPITAL FEDERAL");
      expect
        .soft(
          (await benchmark.promotions()).map(({ title }) => title),
          "it still counts with a province chosen",
        )
        .toContain("Dia Prueba");
      await benchmark.setRubro("Supermercados");
      await benchmark.showView("rubro");
      expect.soft(await benchmark.screenText(), "marked as such").toMatch(/Zona sin confirmar/);
    },
  );
});
