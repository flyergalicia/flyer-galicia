// Replaces pruebas/t80_dias_por_promo.cjs.
import { expect, test } from "../../support/test.ts";

const COTO_IN_INSTALLMENTS = { title: "Coto", benefit: "cuotas" };
const MARKED_PLACE = { x: 140, y: 2650, width: 300, height: 110 };

function published(id: number, titulo: string, dias: string) {
  return {
    id,
    titulo,
    subtitulo: "Supermercados",
    imagen: `${String(id)}.png`,
    fecha_hasta: "2027-12-31",
    tipo_promocion: "Marca",
    provincias: [],
    primera_vez: "2026-01-01",
    proximamente: false,
    fecha_desde: null,
    dias,
    beneficio: "Hasta 3 cuotas sin interés.",
  };
}

test("each row shows the days of that promotion; the flyer, those of the discount", async ({
  openApp,
}) => {
  const app = await openApp({ user: "admin" });
  await app.promotions.open("active");
  await app.promotions.chooseProvince("promotions", "BUENOS AIRES");
  await app.promotions.listActive();

  const coto = (await app.promotions.rows()).filter(({ title }) => /^coto$/i.test(title));
  const installments = coto.filter(({ benefit }) => /cuotas/i.test(benefit));
  const discount = coto.filter(({ benefit }) => benefit.includes("%"));
  expect.soft(installments.length, "Coto has promotions in installments").toBeGreaterThan(0);
  expect
    .soft(
      installments.map(({ days }) => days),
      'Coto in installments: "Todos los días", as on galicia.ar',
    )
    .toEqual(installments.map(() => "Todos los días"));
  expect.soft(discount.length, "Coto has a promotion with a discount").toBeGreaterThan(0);
  expect
    .soft(
      discount.map(({ days }) => days),
      'Coto 25% de ahorro: "Martes"',
    )
    .toEqual(discount.map(() => "Martes"));

  expect
    .soft(
      await app.promotions.supermarketDaysOnFlyer(COTO_IN_INSTALLMENTS),
      "the flyer keeps the days of the %",
    )
    .toBe("Martes");
  expect
    .soft(await app.promotions.ownDays(COTO_IN_INSTALLMENTS), "the promo itself is every day")
    .toBe("Todos los días");
  expect.soft(app.pageErrors(), "no JavaScript errors").toEqual([]);
});

test("the list of brands says the days of the promotion and those of the flyer", async ({
  openApp,
}) => {
  const app = await openApp({ user: "admin" });
  await app.logoEditor.enter();
  await app.promotions.openBrandPickerOver(MARKED_PLACE);
  await app.promotions.searchInBrandPicker("coto");
  const card = (await app.promotions.brandCards()).find(({ title }) => title === "Coto");
  expect
    .soft(card?.detail, "list of brands: its days and, as they differ, those of the flyer")
    .toContain("Todos los días (en el flyer: Martes)");
  expect.soft(app.pageErrors(), "no JavaScript errors").toEqual([]);
});

test("the days read exactly as Galicia publishes them", async ({ cloud, openApp }) => {
  cloud.promotionCatalog = [
    ...cloud.promotionCatalog,
    published(990_101, "Super Con Feriados", "Todos los días excepto feriados"),
    published(990_102, "Super Con Espacio", "Viernes y Sábado "),
    published(990_103, "Super Sin Dias", ""),
  ];
  const app = await openApp({ user: "admin" });
  await app.promotions.open("search");
  await app.promotions.searchBrands(["Super Con Feriados", "Super Con Espacio", "Super Sin Dias"]);

  const days = (await app.promotions.rows()).map((row) => row.days);
  expect
    .soft(days, "whole, without the extra spaces, and nothing when there are none")
    .toEqual(["Todos los días excepto feriados", "Viernes y Sábado", ""]);
});
