// Replaces pruebas/t90_varias_provincias.cjs.
import { type Cloud, type PromotionRow } from "../../support/cloud/index.ts";
import { expect, test } from "../../support/test.ts";

const MARKED_PLACE = { x: 140, y: 2650, width: 300, height: 110 };
const MARKED_STRIP = { x: 140, y: 2650, width: 1000, height: 230 };
const BUENOS_AIRES = "BUENOS AIRES";
const CAPITAL = "CAPITAL FEDERAL";
const NEUQUEN = "NEUQUEN";
const RIO_NEGRO = "RIO NEGRO";
const SUPER_WITH_DISCOUNT_THERE = "Super Rionegrino";
const SUPER_WITH_DISCOUNT_ELSEWHERE = "Super Mendocino";
const IN_THE_TWO = { provinces: [NEUQUEN, RIO_NEGRO] };

function supermarket(
  row: Pick<PromotionRow, "id" | "titulo" | "provincias" | "beneficio" | "dias">,
) {
  return {
    subtitulo: "Supermercados",
    imagen: `${String(row.id)}.png`,
    fecha_hasta: "2027-12-31",
    tipo_promocion: "Marca",
    primera_vez: "2026-01-01",
    proximamente: false,
    fecha_desde: null,
    ...row,
  };
}

test(
  "on Activas one click chooses a province and Shift adds another",
  { tag: "@react" },
  async ({ openApp }) => {
    const app = await openApp({ user: "admin" });
    const { promotions } = app;
    await promotions.open("active");

    await promotions.openProvinceMenu("promotions");
    expect
      .soft(await promotions.provinceMenuIsOpen(), "touching Provincia opens the app's own list")
      .toBe(true);

    await promotions.clickInProvinceMenu(BUENOS_AIRES);
    const one = await promotions.provinceField("promotions");
    expect.soft(one.selected, "one click chooses a province").toEqual([BUENOS_AIRES]);
    expect.soft(one.inUse, "and filters by it").toEqual([BUENOS_AIRES]);
    expect.soft(await promotions.provinceMenuIsOpen(), "and closes the list").toBe(false);

    await promotions.listActive();
    const justOne = (await promotions.activeResultIds()).length;

    await promotions.openProvinceMenu("promotions");
    await promotions.shiftClickInProvinceMenu(CAPITAL);
    const two = await promotions.provinceField("promotions");
    expect.soft(two.selected, "Shift + click adds the second").toEqual([BUENOS_AIRES, CAPITAL]);
    expect.soft(await promotions.provinceMenuIsOpen(), "and the list stays open").toBe(true);
    expect
      .soft(two.label, 'the control reads "Buenos Aires y Capital Federal"')
      .toBe("Buenos Aires y Capital Federal");
    expect
      .soft(await promotions.provinceMenuTicked(), "both keep their tick on the list")
      .toEqual([BUENOS_AIRES, CAPITAL]);
    const locality = await promotions.localityField("promotions");
    expect.soft(locality.disabled, "with several, Localidad is off").toBe(true);
    expect.soft(locality.placeholder, "and it says why").toMatch(/varias/);

    await app.page.keyboard.press("Escape");
    const found = await promotions.activeResultIds();
    const expected = await promotions.promotionIdsIn([BUENOS_AIRES, CAPITAL]);
    expect
      .soft(found.toSorted(), "Activas shows the promotions of either of the two")
      .toEqual(expected.toSorted());
    expect
      .soft(found.length, "with both there are at least as many as with one")
      .toBeGreaterThanOrEqual(justOne);

    await promotions.openProvinceMenu("promotions");
    await promotions.removeInProvinceMenu(CAPITAL);
    expect
      .soft((await promotions.provinceField("promotions")).inUse, 'the "−" takes that one out')
      .toEqual([BUENOS_AIRES]);

    await promotions.clickAllProvincesInProvinceMenu();
    expect
      .soft(
        (await promotions.provinceField("promotions")).inUse,
        '"Todas las provincias" means all',
      )
      .toEqual([]);
    expect.soft(await promotions.provinceMenuIsOpen(), "and the list closes").toBe(false);

    await promotions.openProvinceMenuWithKeyboard("promotions");
    expect
      .soft(await promotions.provinceMenuIsOpen(), "the keyboard (arrow down) also opens it")
      .toBe(true);
    await app.page.keyboard.press("Escape");

    // The name with three, and with one again.
    await promotions.openProvinceMenu("promotions");
    await promotions.clickInProvinceMenu(BUENOS_AIRES);
    await promotions.openProvinceMenu("promotions");
    await promotions.shiftClickInProvinceMenu(CAPITAL);
    await promotions.shiftClickInProvinceMenu("CORDOBA");
    await app.page.keyboard.press("Escape");
    expect
      .soft((await promotions.provinceField("promotions")).label, 'names: "A, B y C"')
      .toBe("Buenos Aires, Capital Federal y Cordoba");
    await promotions.openProvinceMenu("promotions");
    await promotions.clickInProvinceMenu("CORDOBA");
    expect
      .soft((await promotions.provinceField("promotions")).label, "and a single one as before")
      .toBe("Cordoba");
  },
);

function addSupermarkets(cloud: Cloud): void {
  cloud.promotionCatalog = [
    ...cloud.promotionCatalog,
    // Its discount is only in the second province chosen.
    supermarket({
      id: 990_201,
      titulo: SUPER_WITH_DISCOUNT_THERE,
      provincias: [RIO_NEGRO],
      dias: "Lunes",
      beneficio: "20% de ahorro.",
    }),
    // It is in the two provinces, but its discount is somewhere else.
    supermarket({
      id: 990_202,
      titulo: SUPER_WITH_DISCOUNT_ELSEWHERE,
      provincias: [NEUQUEN, RIO_NEGRO],
      dias: "Todos los días",
      beneficio: "Hasta 12 cuotas sin interés.",
    }),
    supermarket({
      id: 990_203,
      titulo: SUPER_WITH_DISCOUNT_ELSEWHERE,
      provincias: ["MENDOZA"],
      dias: "Martes",
      beneficio: "20% de ahorro.",
    }),
  ];
}

test(
  "the days of a supermarket look at all the provinces chosen",
  { tag: "@react" },
  async ({ cloud, openApp }) => {
    addSupermarkets(cloud);
    const app = await openApp({ user: "admin" });
    const { promotions } = app;
    await promotions.open("active");

    expect
      .soft(
        await promotions.supermarketDaysOnFlyer({ title: SUPER_WITH_DISCOUNT_THERE }, IN_THE_TWO),
        "so do the days of a supermarket",
      )
      .toBe("Lunes");
    expect
      .soft(
        await promotions.hasPercentDiscount(
          { title: SUPER_WITH_DISCOUNT_THERE },
          { provinces: [NEUQUEN] },
        ),
        "which does not happen with the first one alone",
      )
      .toBe(false);
  },
);

test(
  "Armar franja and the window of a logo work with several provinces",
  { tag: "@react" },
  async ({ cloud, openApp }) => {
    addSupermarkets(cloud);
    const app = await openApp({ user: "admin" });
    const { promotions } = app;
    await app.logoEditor.enter();
    await promotions.waitForCatalog();

    await promotions.openLogoStripOver(MARKED_STRIP);
    await promotions.openProvinceMenu("logoStrip");
    await promotions.clickInProvinceMenu(NEUQUEN);
    await promotions.openProvinceMenu("logoStrip");
    await promotions.shiftClickInProvinceMenu(RIO_NEGRO);
    await app.page.keyboard.press("Escape");
    expect
      .soft(await promotions.provinceMenuIsOpen(), "Escape closes the list of provinces")
      .toBe(false);
    await expect
      .soft(app.page.getByText("Tu selección"), "and not the Armar franja window")
      .toBeVisible();

    const strip = await promotions.provinceField("logoStrip");
    expect
      .soft(strip.inUse, "Armar franja: Neuquén and Río Negro together")
      .toEqual([NEUQUEN, RIO_NEGRO]);
    const offered = await promotions.logoStripOfferIds();
    const inEither = await promotions.promotionIdsIn([NEUQUEN, RIO_NEGRO]);
    expect.soft(offered.length, "Armar franja offers brands").toBeGreaterThan(0);
    expect
      .soft(
        offered.filter((id) => !inEither.includes(id)),
        "all of them from either province",
      )
      .toEqual([]);
    expect
      .soft((await promotions.localityField("logoStrip")).hidden, "with several, no Localidad")
      .toBe(true);

    const dotOfCard = async (title: string): Promise<boolean | undefined> => {
      await promotions.searchInLogoStrip(title);
      const cards = await promotions.logoStripCards();
      return cards.find((card) => card.title === title)?.hasPercentDot;
    };
    expect
      .soft(
        await dotOfCard(SUPER_WITH_DISCOUNT_THERE),
        "the dot of a supermarket looks at the two provinces: a discount in the second one counts",
      )
      .toBe(true);
    expect
      .soft(
        await dotOfCard(SUPER_WITH_DISCOUNT_ELSEWHERE),
        "and a discount out of the two does not",
      )
      .toBe(false);
    await promotions.closeLogoStrip();

    await promotions.openBrandPickerOver(MARKED_PLACE);
    await promotions.openProvinceMenu("brandPicker");
    await promotions.clickInProvinceMenu(NEUQUEN);
    await promotions.openProvinceMenu("brandPicker");
    await promotions.shiftClickInProvinceMenu(RIO_NEGRO);
    await app.page.keyboard.press("Escape");
    await promotions.closeBrandPicker();

    await promotions.openBrandPickerOver(MARKED_PLACE);
    const remembered = await promotions.provinceField("brandPicker");
    expect
      .soft(remembered.selected, "the window of a logo opens with both")
      .toEqual([NEUQUEN, RIO_NEGRO]);
    expect.soft(remembered.label, "and its name").toMatch(/Neuqu.n y R.o Negro/);

    await promotions.openProvinceMenu("brandPicker");
    await promotions.clickInProvinceMenu("MENDOZA");
    expect
      .soft(
        (await promotions.provinceField("brandPicker")).inUse,
        "a click without Shift replaces the two with one",
      )
      .toEqual(["MENDOZA"]);
    await promotions.closeBrandPicker();
    expect.soft(app.pageErrors(), "no JavaScript errors").toEqual([]);
  },
);
