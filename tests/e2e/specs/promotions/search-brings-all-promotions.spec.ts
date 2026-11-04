// Replaces pruebas/t81_buscar_todas_promos.cjs.
import { expect, test } from "../../support/test.ts";

const ONE_ROW_PER_BRAND = { name: "Una sola fila por marca" };

function row(id: number, titulo: string, beneficio: string) {
  return {
    id,
    titulo,
    subtitulo: "Indumentaria",
    imagen: "gofarma_180.png",
    fecha_hasta: "2027-12-31",
    tipo_promocion: "Marca",
    provincias: [],
    primera_vez: "2026-01-01",
    proximamente: false,
    fecha_desde: null,
    dias: null,
    beneficio,
  };
}

test(
  "Buscar brings every promotion of each pasted brand",
  { tag: "@react" },
  async ({ openApp }) => {
    const app = await openApp({ user: "admin" });
    await app.promotions.open("search");
    await app.promotions.searchBrands(["Coto", "Farmacity"]);

    const rows = await app.promotions.rows();
    const coto = rows.filter(({ brand }) => brand === "Coto");
    const farmacity = rows.filter(({ brand }) => brand === "Farmacity");
    const cotoBenefits = coto.map(({ benefit }) => benefit);
    expect.soft(coto.length, '"Coto" brings its 3 promotions').toBe(3);
    expect.soft(cotoBenefits, "12 installments").toContainEqual(expect.stringMatching(/12 cuotas/));
    expect.soft(cotoBenefits, "18 installments").toContainEqual(expect.stringMatching(/18 cuotas/));
    expect.soft(cotoBenefits, "25% off").toContainEqual(expect.stringMatching(/25%/));
    expect
      .soft(coto[0]?.benefit, "the first of Coto is the one that ends later (installments)")
      .not.toMatch(/25%/);
    expect.soft(farmacity.length, '"Farmacity" brings its 4').toBe(4);
    expect
      .soft(
        farmacity.filter(({ title }) => title !== "Farmacity"),
        'and none of "Farmacity.com"',
      )
      .toEqual([]);
    expect.soft(rows.length, "seven rows in all").toBe(7);
    expect
      .soft(
        rows.slice(0, 3).map(({ brand }) => brand),
        "those of each brand go together, in the order they were pasted",
      )
      .toEqual(["Coto", "Coto", "Coto"]);

    const tick = app.page.getByRole("checkbox", ONE_ROW_PER_BRAND);
    await expect.soft(tick, 'Buscar has the tick "Una sola fila por marca"').toBeVisible();
    await expect.soft(tick, "and it starts off").not.toBeChecked();

    await tick.click();
    const oneEach = await app.promotions.rows();
    expect
      .soft(
        oneEach.map(({ brand }) => brand),
        "with the tick there is one row per brand",
      )
      .toEqual(["Coto", "Farmacity"]);
    expect.soft(oneEach[0]?.description, "the row of Coto says there are 2 more").toMatch(/\+2/);
    expect
      .soft(await app.promotions.oneRowPerBrandIsOn("active"), "the tick of Activas follows")
      .toBe(true);

    await tick.click();
    expect.soft((await app.promotions.rows()).length, "unticking brings all back").toBe(7);
    expect.soft(app.pageErrors(), "no JavaScript errors").toEqual([]);
  },
);

// Only for the current app: a brand with a clear match has no way to be chosen again, and the driver
// marks the row for review from inside. The next test covers the rule with real actions.
test("confirming the match of a clear brand does not repeat its promotions", async ({
  openApp,
}) => {
  const app = await openApp({ user: "admin" });
  await app.promotions.open("search");
  await app.promotions.searchBrands(["Coto", "Farmacity"]);

  await app.promotions.confirmMatchAgain("Coto");
  const afterConfirming = await app.promotions.rows();
  expect
    .soft(
      afterConfirming.filter(({ brand }) => brand === "Coto").length,
      "confirming a match adds the others of the brand without repeating them",
    )
    .toBe(3);
  expect.soft(afterConfirming.length, "and no other row changes").toBe(7);
  expect.soft(app.pageErrors(), "no JavaScript errors").toEqual([]);
});

test(
  "choosing the match of a row to review brings the others of that brand, and only those",
  { tag: "@react" },
  async ({ cloud, openApp }) => {
    const brand = "Ambigua";
    cloud.promotionCatalog = [
      row(1, "Ambigua Sur", "10% de ahorro"),
      row(2, "Ambigua Sur", "20% de ahorro"),
      row(3, "Ambigua Norte", "30% de ahorro"),
      row(4, "Ambigua Norte", "40% de ahorro"),
      row(5, "Ambigua Norte", "50% de ahorro"),
    ];
    const app = await openApp({ user: "admin" });
    await app.promotions.open("search");
    await app.promotions.searchBrands([brand]);

    const [review] = await app.promotions.rows();
    expect.soft(review?.status, "two names that fit: it has to be reviewed").toMatch(/Revisar/);
    expect.soft((await app.promotions.rows()).length, "nothing else comes yet").toBe(1);

    const match = app.page.getByRole("combobox").filter({ hasText: "Elegir coincidencia" });
    await match.selectOption({ label: "Ambigua Norte" });
    const north = await app.promotions.rows();
    expect
      .soft(north.map(({ benefit }) => benefit).toSorted(), "the three of that name, each one once")
      .toEqual(["30% de ahorro", "40% de ahorro", "50% de ahorro"]);
    expect
      .soft(
        north.map(({ brand: pasted }) => pasted),
        "all under the pasted brand",
      )
      .toEqual([brand, brand, brand]);
    expect.soft(north[0]?.status, "it is no longer to review").toMatch(/Vigente/);
    expect.soft(app.pageErrors(), "no JavaScript errors").toEqual([]);
  },
);
