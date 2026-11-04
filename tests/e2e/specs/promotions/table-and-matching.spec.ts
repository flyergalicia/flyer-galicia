// Protects the table of Promociones: how brands match, filters, order, link, new and upcoming.
import { type PromotionRow } from "../../support/cloud/index.ts";
import { gate } from "../../support/settled.ts";
import { expect, test } from "../../support/test.ts";

const PROVINCE = "BUENOS AIRES";
const BRAND_FILTER_HINT = "Filtrar...";
const TODAY = new Date();
const inDays = (days: number): string =>
  new Date(TODAY.getTime() + days * 86_400_000).toISOString().slice(0, 10);

function promotion(id: number, titulo: string, extra: Partial<PromotionRow> = {}): PromotionRow {
  return {
    id,
    titulo,
    subtitulo: "",
    imagen: "gofarma_180.png",
    fecha_hasta: inDays(40),
    tipo_promocion: "Marca",
    provincias: [],
    primera_vez: "2026-01-01",
    proximamente: false,
    fecha_desde: null,
    dias: null,
    beneficio: "10% de ahorro",
    ...extra,
  };
}

test.describe("matching the pasted brands", () => {
  const CATALOG = [
    promotion(1, "SushiClub"),
    promotion(2, "Golf Club"),
    promotion(3, "Niceto Club"),
    promotion(4, "Starbucks Coffee"),
    promotion(5, "Vencida SA", { fecha_hasta: inDays(-40) }),
    promotion(6, "Café Martínez"),
  ];

  test("the same brand written differently is found", async ({ cloud, openApp }) => {
    cloud.promotionCatalog = CATALOG;
    const { promotions } = await openApp({ user: "admin" });
    await promotions.open("search");

    await promotions.searchBrands(["Sushi Club", "Starbucks", "cafe martinez"]);

    const rows = await promotions.rows();
    const of = (brand: string) => rows.find((row) => row.brand === brand)?.title;
    expect.soft(of("Sushi Club"), "with spaces or without").toBe("SushiClub");
    expect.soft(of("Starbucks"), "a part of the name").toBe("Starbucks Coffee");
    expect.soft(of("cafe martinez"), "no accents, no capitals").toBe("Café Martínez");
  });

  test("a generic word alone does not hold a match", async ({ cloud, openApp }) => {
    cloud.promotionCatalog = CATALOG;
    const { promotions } = await openApp({ user: "admin" });
    await promotions.open("search");

    await promotions.searchBrands(["Rugby Club"]);

    const [row] = await promotions.rows();
    expect.soft(row?.status, '"Club" is not a brand').toMatch(/No encontrada/);
  });

  test("the status tells what happens with each brand", async ({ cloud, openApp }) => {
    cloud.promotionCatalog = CATALOG;
    const { promotions } = await openApp({ user: "admin" });
    await promotions.open("search");

    await promotions.searchBrands(["SushiClub", "Vencida SA", "Inexistente"]);

    const rows = await promotions.rows();
    const status = (brand: string) => rows.find((row) => row.brand === brand)?.status ?? "";
    expect.soft(status("SushiClub")).toMatch(/Vigente/);
    expect.soft(status("Vencida SA")).toMatch(/Vencida/);
    expect.soft(status("Inexistente")).toMatch(/No encontrada/);
  });

  test("Ctrl+Enter validates from inside the box", async ({ cloud, openApp }) => {
    cloud.promotionCatalog = CATALOG;
    const { promotions } = await openApp({ user: "admin" });
    await promotions.open("search");

    await promotions.validateWithShortcut(["SushiClub"]);

    await expect.poll(async () => (await promotions.rows()).length).toBe(1);
  });

  test("validating while the catalog is on its way waits for it, instead of saying nothing", async ({
    cloud,
    openApp,
  }) => {
    cloud.promotionCatalog = CATALOG;
    const { promise: held, open: release } = gate();
    let asked = 0;
    const app = await openApp({
      user: "admin",
      beforeNavigation: async (page) => {
        await page.route("**/rest/v1/promos_galicia_cache*", async (route) => {
          asked += 1;
          await held;
          await route.fallback();
        });
      },
    });
    await app.session.chooseHeaderTab("Promociones");

    await app.promotions.pressValidate(["SushiClub"]);
    await expect.poll(() => app.promotions.validateButtonText()).toMatch(/Cargando cat.logo/);
    expect.soft(await app.promotions.validateIsLocked(), "it cannot be asked twice").toBe(true);
    release();

    await expect.poll(async () => (await app.promotions.rows()).length).toBe(1);
    expect.soft(asked, "a single catalog is asked for").toBeLessThanOrEqual(2);
    await expect.poll(() => app.promotions.validateButtonText()).not.toMatch(/Cargando/);
  });

  test("a catalog longer than one page of the database arrives whole", async ({
    cloud,
    openApp,
  }) => {
    const many = Array.from({ length: 2_300 }, (_, at) =>
      promotion(1000 + at, `Marca ${String(at)}`),
    );
    cloud.promotionCatalog = [...many, promotion(9000, "Ultima Del Catalogo")];
    const { promotions } = await openApp({ user: "admin" });
    await promotions.open("search");

    await promotions.searchBrands(["Ultima Del Catalogo"]);

    expect
      .soft((await promotions.rows())[0]?.title, "what is on the last page")
      .toBe("Ultima Del Catalogo");
  });
});

test.describe("updating the catalog", () => {
  const OLD = [promotion(1, "Marca Vieja")];
  const NEW = [promotion(1, "Marca Vieja"), promotion(2, "Marca Recien Llegada")];

  test("the button asks Galicia, says how many there are and the new ones can be found", async ({
    cloud,
    openApp,
  }) => {
    cloud.promotionCatalog = OLD;
    cloud.promotionCatalogAfterSync = NEW;
    const { promotions, flyerEditor, page } = await openApp({ user: "admin" });
    await promotions.open("search");
    const hold = gate();
    await page.route("**/functions/v1/promos-galicia", async (route) => {
      await hold.promise;
      await route.fallback();
    });

    await promotions.pressUpdateCatalog();

    expect.soft(await promotions.updateCatalogButton(), "it shows it is working").toEqual({
      text: "Actualizando catálogo…",
      locked: true,
    });
    hold.open();
    await expect.poll(() => cloud.promotionSyncCalls).toEqual([{ action: "sync" }]);
    await expect.poll(() => flyerEditor.latestNotice()).toBe("Catálogo actualizado: 2 promociones");
    await expect.poll(async () => (await promotions.updateCatalogButton()).locked).toBe(false);
    await expect.poll(() => promotions.catalogStatus()).toMatch(/2 promociones/);
    await promotions.searchBrands(["Marca Recien Llegada"]);
    expect.soft((await promotions.rows())[0]?.title).toBe("Marca Recien Llegada");
  });

  const refusals = [
    [403, "Galicia respondió 403", /Galicia no dej. actualizar el cat.logo ahora/],
    [500, "se cortó", /No se pudo actualizar el cat.logo de promociones: se cortó/],
  ] as const;
  for (const [status, message, notice] of refusals) {
    test(`a ${String(status)} tells what happened and keeps the last copy`, async ({
      cloud,
      openApp,
    }) => {
      cloud.promotionCatalog = OLD;
      cloud.promotionCatalogAfterSync = NEW;
      cloud.promotionSyncRefusal = { status, message };
      const { promotions, flyerEditor } = await openApp({ user: "admin" });
      await promotions.open("search");

      await promotions.pressUpdateCatalog();

      await expect.poll(() => flyerEditor.latestNotice()).toMatch(notice);
      expect
        .soft((await promotions.updateCatalogButton()).locked, "it can be tried again")
        .toBe(false);
      await promotions.searchBrands(["Marca Vieja"]);
      expect.soft((await promotions.rows())[0]?.title).toBe("Marca Vieja");
    });
  }

  test("a catalog that was never updated asks for itself on opening, once", async ({
    cloud,
    openApp,
  }) => {
    cloud.promotionCatalog = [];
    cloud.promotionCatalogAfterSync = OLD;
    const { promotions } = await openApp({ user: "admin" });

    await promotions.open("search");

    await expect.poll(() => cloud.promotionSyncCalls).toEqual([{ action: "sync" }]);
    await promotions.searchBrands(["Marca Vieja"]);
    expect.soft((await promotions.rows())[0]?.title).toBe("Marca Vieja");
    expect.soft(cloud.promotionSyncCalls, "no second time").toHaveLength(1);
  });

  test("the update that starts by itself also shows on the button", async ({ cloud, openApp }) => {
    cloud.promotionCatalog = [];
    const { promotions, page } = await openApp({ user: "admin" });
    const hold = gate();
    await page.route("**/functions/v1/promos-galicia", async (route) => {
      await hold.promise;
      await route.fallback();
    });

    await promotions.openWithoutCatalog("search");

    await expect
      .poll(() => promotions.updateCatalogButton())
      .toEqual({ text: "Actualizando catálogo…", locked: true });
    hold.open();
    await expect.poll(async () => (await promotions.updateCatalogButton()).locked).toBe(false);
  });

  test("a Galicia that brings nothing is not asked again and again", async ({ cloud, openApp }) => {
    cloud.promotionCatalog = [];
    const { promotions, page } = await openApp({ user: "admin" });

    await promotions.openWithoutCatalog("search");

    await expect.poll(() => cloud.promotionSyncCalls.length).toBe(1);
    await page.waitForTimeout(500);
    expect.soft(cloud.promotionSyncCalls).toHaveLength(1);
  });

  test("the update by itself that fails says so when there is nothing to show", async ({
    cloud,
    openApp,
  }) => {
    cloud.promotionCatalog = [];
    cloud.promotionSyncRefusal = { status: 500, message: "se cortó" };
    const { promotions, flyerEditor } = await openApp({ user: "admin" });

    await promotions.openWithoutCatalog("search");

    await expect
      .poll(() => flyerEditor.latestNotice())
      .toMatch(/No se pudo actualizar el cat.logo de promociones: se cortó/);
  });

  test("a catalog that has rows does not update by itself", async ({ cloud, openApp }) => {
    cloud.promotionCatalog = OLD;
    const { promotions } = await openApp({ user: "admin" });

    await promotions.open("search");
    await promotions.searchBrands(["Marca Vieja"]);

    expect.soft(cloud.promotionSyncCalls).toEqual([]);
  });
});

test.describe("the table", () => {
  test("only the faculty shows Promociones", async ({ cloud, openApp }) => {
    cloud.setPermissions("asesor", { promos_buscar: false });
    const without = await openApp();
    expect.soft((await without.session.headerTabs()).join(" ")).not.toMatch(/Promociones/);

    cloud.setPermissions("asesor", { promos_buscar: true });
    const allowed = await openApp();
    expect.soft((await allowed.session.headerTabs()).join(" ")).toMatch(/Promociones/);
  });

  test("the search over the results filters without losing the focus", async ({
    cloud,
    openApp,
  }) => {
    cloud.promotionCatalog = [promotion(1, "Alfa"), promotion(2, "Beta"), promotion(3, "Gama")];
    const { promotions } = await openApp({ user: "admin" });
    await promotions.open("search");
    await promotions.searchBrands(["Alfa", "Beta", "Gama"]);

    await promotions.filterResults("be");

    expect.soft((await promotions.rows()).map(({ title }) => title)).toEqual(["Beta"]);
    expect
      .soft(await promotions.resultsFilterHasFocus(), "typing does not draw the box again")
      .toBe(true);
  });

  test("each column filters, on top of the others", async ({ cloud, openApp }) => {
    cloud.promotionCatalog = [
      promotion(1, "Vigente Uno"),
      promotion(2, "Pasada Dos", { fecha_hasta: inDays(-40) }),
    ];
    const { promotions } = await openApp({ user: "admin" });
    await promotions.open("search");
    await promotions.searchBrands(["Vigente Uno", "Pasada Dos", "No Existe"]);

    await promotions.filterStatus("Vencida");
    expect
      .soft(
        (await promotions.rows()).map(({ brand }) => brand),
        "by status",
      )
      .toEqual(["Pasada Dos"]);

    await promotions.filterStatus("Todos");
    await promotions.filterColumn(BRAND_FILTER_HINT, "vigente");
    expect
      .soft(
        (await promotions.rows()).map(({ brand }) => brand),
        "by brand",
      )
      .toEqual(["Vigente Uno"]);
  });

  test("sorting by status puts first what has to be fixed, and empty cells go last", async ({
    cloud,
    openApp,
  }) => {
    cloud.promotionCatalog = [
      promotion(1, "Vigente Uno"),
      promotion(2, "Pasada Dos", { fecha_hasta: inDays(-40) }),
    ];
    const { promotions } = await openApp({ user: "admin" });
    await promotions.open("search");
    await promotions.searchBrands(["Vigente Uno", "Pasada Dos", "No Existe"]);

    await promotions.sortBy("Estado");
    expect
      .soft(
        (await promotions.rows()).map(({ brand }) => brand),
        "by urgency",
      )
      .toEqual(["No Existe", "Pasada Dos", "Vigente Uno"]);

    await promotions.sortBy("Hasta");
    expect.soft((await promotions.rows()).at(-1)?.brand, "no date goes last").toBe("No Existe");
  });

  test("each promotion links to its public page", async ({ cloud, openApp }) => {
    cloud.promotionCatalog = [promotion(77, "Café & Té")];
    const { promotions } = await openApp({ user: "admin" });
    await promotions.open("search");
    await promotions.searchBrands(["Café & Té"]);

    const [row] = await promotions.rows();
    expect
      .soft(row?.linkUrl)
      .toBe(`https://beneficios.galicia.ar/promocion/77|${encodeURIComponent("Café & Té")}|Marca`);
    expect.soft(row?.linkText).toMatch(/Ver/);
  });

  test("the Excel has the same columns, with the link and the benefit", async ({
    cloud,
    openApp,
  }) => {
    cloud.promotionCatalog = [promotion(1, "Alfa", { beneficio: "25% de ahorro" })];
    const { promotions } = await openApp({ user: "admin" });
    await promotions.open("search");
    await promotions.searchBrands(["Alfa"]);

    const { head, rows } = await promotions.downloadSheet();
    for (const column of ["Marca (flyer)", "Beneficio", "Dónde", "Hasta", "Estado", "En Galicia"]) {
      expect.soft(head, column).toContain(column);
    }
    expect.soft(rows[0]?.[head.indexOf("Beneficio")]).toBe("25% de ahorro");
  });
});

test.describe("on Activas", () => {
  test("what is new is tagged and can be filtered", async ({ cloud, openApp }) => {
    cloud.promotionCatalog = [
      promotion(1, "Reciente", { primera_vez: inDays(-2) }),
      promotion(2, "De antes", { primera_vez: inDays(-40) }),
    ];
    const { promotions } = await openApp({ user: "admin" });
    await promotions.open("active");
    await promotions.chooseProvince("promotions", PROVINCE);
    await promotions.listActive();

    const rows = await promotions.rows();
    expect.soft(rows.find(({ title }) => title === "Reciente")?.description).toMatch(/Nueva/);
    expect.soft(rows.find(({ title }) => title === "De antes")?.description).not.toMatch(/Nueva/);

    await promotions.setOnlyNew(true);
    expect.soft((await promotions.rows()).map(({ title }) => title)).toEqual(["Reciente"]);
  });

  test("what has not started says when it starts", async ({ cloud, openApp }) => {
    cloud.promotionCatalog = [
      promotion(1, "Futura", { proximamente: true, fecha_desde: "2026-12-05" }),
    ];
    const { promotions } = await openApp({ user: "admin" });
    await promotions.open("active");
    await promotions.chooseProvince("promotions", PROVINCE);
    await promotions.listActive();

    const [row] = await promotions.rows();
    expect.soft(row?.status).toMatch(/Empieza el 05\/12/);
  });

  test("one row per brand joins renamed branches, only if the short name exists alone", async ({
    cloud,
    openApp,
  }) => {
    cloud.promotionCatalog = [
      promotion(1, "Adidas"),
      promotion(2, "Adidas MDQ"),
      promotion(3, "Farmacia Sol"),
      promotion(4, "Farmacia Luna"),
    ];
    const { promotions } = await openApp({ user: "admin" });
    await promotions.open("active");
    await promotions.chooseProvince("promotions", PROVINCE);
    await promotions.listActive();
    expect.soft((await promotions.rows()).length).toBe(4);

    await promotions.setOneRowPerBrand(true);

    const titles = (await promotions.rows()).map(({ title }) => title);
    expect.soft(titles.filter((title) => /Adidas/.test(title)).length, "one Adidas").toBe(1);
    expect
      .soft(titles, "two different pharmacies stay")
      .toEqual(expect.arrayContaining(["Farmacia Sol", "Farmacia Luna"]));
    const adidas = (await promotions.rows()).find(({ title }) => /Adidas/.test(title));
    expect.soft(adidas?.description, "and says there is more").toMatch(/\+1/);

    await promotions.setOneRowPerBrand(false);
    expect.soft((await promotions.rows()).length, "all back").toBe(4);
  });

  test("of two promotions of a brand, the one running that lasts longest stands for it", async ({
    cloud,
    openApp,
  }) => {
    cloud.promotionCatalog = [
      promotion(1, "Coto", { beneficio: "10% de ahorro", fecha_hasta: inDays(10) }),
      promotion(2, "Coto", { beneficio: "20% de ahorro", fecha_hasta: inDays(60) }),
      promotion(3, "Coto", {
        beneficio: "30% de ahorro",
        fecha_hasta: inDays(200),
        fecha_desde: inDays(5),
        proximamente: true,
      }),
    ];
    const { promotions } = await openApp({ user: "admin" });
    await promotions.open("active");
    await promotions.chooseProvince("promotions", PROVINCE);
    await promotions.listActive();
    await promotions.setOneRowPerBrand(true);

    const rows = await promotions.rows();
    expect.soft(rows.length, "one row").toBe(1);
    expect.soft(rows[0]?.benefit, "not what has not started yet").toMatch(/20%/);
  });

  test("a promotion of Galicia wins a tie with one of MODO", async ({ cloud, openApp }) => {
    const until = inDays(60);
    cloud.promotionCatalog = [
      promotion(1, "Coto", { beneficio: "20% de ahorro", fecha_hasta: until }),
    ];
    cloud.modoPromotions = [
      {
        id: "a1",
        slug: "coto-cuotas",
        titulo: "Coto",
        subtitulo: "Supermercados",
        imagen: "",
        beneficio: "6 cuotas sin interés",
        tope: null,
        dias: null,
        canales: ["instore"],
        solo_galicia: false,
        provincias: [PROVINCE],
        localidades: null,
        fecha_desde: "2026-10-01",
        fecha_hasta: until,
        proximamente: false,
        primera_vez: null,
      },
    ];
    const { promotions } = await openApp({ user: "admin" });
    await promotions.open("active");
    await promotions.chooseProvince("promotions", PROVINCE);
    await promotions.listActive();
    await promotions.setOneRowPerBrand(true);

    const rows = await promotions.rows();
    expect.soft(rows.length, "one row").toBe(1);
    expect.soft(rows[0]?.hasModoTag, "the one of Galicia").toBe(false);
  });
});
