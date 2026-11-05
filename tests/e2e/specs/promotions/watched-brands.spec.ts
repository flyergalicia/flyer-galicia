// Replaces pruebas/t49_marcas_vigiladas.cjs.
import { expect, test } from "../../support/test.ts";

const DAY_MS = 86_400_000;
const FLYER_OPTION = 9;
const NEW_OPTION = 10;

function dateFromToday(days: number): string {
  const day = new Date(Date.now() + days * DAY_MS);
  const month = String(day.getMonth() + 1).padStart(2, "0");
  return `${String(day.getFullYear())}-${month}-${String(day.getDate()).padStart(2, "0")}`;
}

interface WatchedEntry {
  m?: string;
  t?: string;
  img?: string;
  origen?: string;
}

function hasWatchLists(file: unknown): file is { opciones: Record<string, WatchedEntry[]> } {
  return typeof file === "object" && file !== null && "opciones" in file;
}

function watchListOf(file: unknown, option: number): WatchedEntry[] {
  return hasWatchLists(file) ? (file.opciones[String(option)] ?? []) : [];
}

test(
  "the administrator saves what Buscar found, and the others do not see how",
  { tag: "@react" },
  async ({ cloud, openApp }) => {
    const [first, second] = cloud.promotionCatalog.filter(
      ({ imagen, fecha_hasta, proximamente }) => imagen && fecha_hasta && !proximamente,
    );
    const fromStudio = {
      m: "Del diseño",
      t: "Del diseño",
      img: "de-estudio.png",
      origen: "estudio",
    };
    cloud.bucketJson["_vigilar.json"] = {
      opciones: {
        [String(FLYER_OPTION)]: [
          { m: "A mano", t: "A mano", img: "a-mano.png", origen: "manual" },
          fromStudio,
        ],
      },
    };
    const brands = [first?.titulo ?? "", second?.titulo ?? "", "Marca Que No Existe"];

    const advisor = await openApp();
    await advisor.promotions.open("search");
    await advisor.promotions.searchBrands(brands);
    await expect
      .soft(advisor.page.getByText("Vigilar estas marcas en"), "an advisor does not see it")
      .toBeHidden();

    const app = await openApp({ user: "admin" });
    await app.promotions.open("search");
    await app.promotions.searchBrands(brands);
    expect
      .soft(await app.promotions.watchBarOption(), "it starts on the flyer open in the editor")
      .toBe(FLYER_OPTION);
    await app.promotions.watchFoundBrandsOn(FLYER_OPTION);

    const saved = watchListOf(cloud.bucketJson["_vigilar.json"], FLYER_OPTION);
    expect
      .soft(
        saved.map(({ origen }) => origen),
        "what was by hand is replaced, Estudio stays",
      )
      .toEqual(expect.arrayContaining(["manual", "estudio"]));
    expect
      .soft(
        saved.some(({ m }) => m === "A mano"),
        "the old manual one left",
      )
      .toBe(false);
    expect
      .soft(
        saved.some(({ m }) => m === "Marca Que No Existe"),
        "what was not found",
      )
      .toBe(false);
    expect
      .soft(
        saved.some(({ img }) => img === first?.imagen),
        "what was found",
      )
      .toBe(true);
    expect
      .soft(
        saved.some(({ img }) => img === fromStudio.img),
        "the one of Estudio",
      )
      .toBe(true);
    expect.soft(app.pageErrors(), "no JavaScript errors").toEqual([]);
  },
);

test("watched brands are loaded from Buscar, show their status and grow from Estudio", async ({
  cloud,
  openApp,
}) => {
  // Three current promotions with a logo: one ends later, one this week, one already ended.
  const live = cloud.promotionCatalog
    .filter(({ imagen, fecha_hasta, proximamente }) => imagen && fecha_hasta && !proximamente)
    .slice(0, 3);
  const endsOn = new Map(
    live.map(({ id }, index) => [id, dateFromToday([40, 3, -5][index] ?? 0)] as const),
  );
  cloud.promotionCatalog = cloud.promotionCatalog.map((row) => {
    const fecha_hasta = endsOn.get(row.id);
    return fecha_hasta === undefined ? row : { ...row, fecha_hasta };
  });

  const app = await openApp({ user: "admin" });
  await app.promotions.open("search");
  await app.promotions.searchBrands(live.map(({ titulo }) => titulo));

  await expect
    .soft(
      app.page.getByText("Vigilar estas marcas en"),
      'on Buscar the administrator sees "Vigilar estas marcas en"',
    )
    .toBeVisible();

  await app.promotions.watchFoundBrandsOn(FLYER_OPTION);
  const saved = watchListOf(cloud.bucketJson["_vigilar.json"], FLYER_OPTION);
  expect
    .soft(saved.length, "the brands found are saved on the chosen flyer")
    .toBeGreaterThanOrEqual(2);

  // The next day: the first one ends in 3 days, the second has ended and a third one is added.
  const [first, second] = saved;
  cloud.promotionCatalog = cloud.promotionCatalog.map((row) => {
    if (row.imagen === first?.img) return { ...row, fecha_hasta: dateFromToday(3) };
    if (row.imagen === second?.img) return { ...row, fecha_hasta: dateFromToday(-5) };
    return row;
  });
  const lasting = cloud.promotionCatalog.find(
    ({ imagen, proximamente, fecha_hasta }) =>
      imagen && !proximamente && (fecha_hasta ?? "") > dateFromToday(30),
  );
  saved.push({
    m: lasting?.titulo ?? "",
    t: lasting?.titulo ?? "",
    img: lasting?.imagen ?? "",
    origen: "manual",
  });

  const nextDay = await openApp({ user: "admin" });
  const statuses = (await nextDay.promotions.openWatchedBrands()).map(({ status }) => status);
  expect
    .soft(statuses, "it shows Vigente, Vence en 3 días and Sin promo vigente")
    .toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Vigente/),
        expect.stringMatching(/Vence en 3 d/),
        expect.stringMatching(/Sin promo vigente/),
      ]),
    );

  const watchedBefore = saved.length;
  await nextDay.promotions.stopWatchingFirstBrand();
  expect
    .soft(
      watchListOf(cloud.bucketJson["_vigilar.json"], FLYER_OPTION).length,
      "the × stops watching that brand",
    )
    .toBe(watchedBefore - 1);

  await nextDay.promotions.addDesignLogosToWatchedBrands(FLYER_OPTION, NEW_OPTION, [
    {
      kind: "catalogBrand",
      title: lasting?.titulo ?? "",
      logoFile: "marca-del-diseno.png",
    },
    { kind: "text", text: "x" },
    { kind: "uploaded", title: "subido" },
    { kind: "ownFlyerLogo", title: "Logo del flyer" },
  ]);
  const onNewOption = watchListOf(cloud.bucketJson["_vigilar.json"], NEW_OPTION);
  const origins = onNewOption.map(({ origen }) => origen);
  expect.soft(origins, "publishing adds the catalog logos of the design").toContain("estudio");
  expect
    .soft(
      onNewOption.filter(({ img }) => /^pc:|^orig:/.test(img ?? "")),
      "not the uploaded logos nor those of the flyer itself",
    )
    .toEqual([]);
  expect.soft(origins, "and it inherits the manual ones").toContain("manual");
  expect.soft(app.pageErrors(), "no JavaScript errors").toEqual([]);
  expect.soft(nextDay.pageErrors(), "nor on the next day").toEqual([]);
});
