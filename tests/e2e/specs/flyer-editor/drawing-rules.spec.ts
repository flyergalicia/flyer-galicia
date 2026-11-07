// Protects what the flyer draws in each tab: amounts, officers, covers and calibrated zones.
import { type DrawnFlyer } from "../../support/driver/flyer-drawing.ts";
import { type Cloud } from "../../support/cloud/index.ts";
import { type OpenedApp } from "../../support/open-app.ts";
import { expect, test } from "../../support/test.ts";

const AMOUNTS = ["$250.000", "$180.000", "$80.000", "$30.000"];
const FLYER_IMAGE = "flyer_t7.jpg?v=1";
const BOX_WIDTH = 240;
const MAX_TONE_DISTANCE = 24;
const hex = (digits: string) => ["#", digits].join("");
const ORANGE = hex("fa6400");
const textsOf = ({ texts }: DrawnFlyer) => texts.map(({ text }) => text);
const sentence = (flyer: DrawnFlyer) => textsOf(flyer).join(" ").replace(/\s+/g, " ");

const COMPANY_WITHOUT_CASHBACK = {
  empresa: "SIN CASHBACK SA",
  cuits: [],
  config: "",
  asesores: [],
  rubro: {},
};

/** The way of getting there: there is no switch, it is the list that says it. */
async function bringCompanyWithoutCashback({ companyRegistry }: OpenedApp): Promise<void> {
  await companyRegistry.openSearch();
  await companyRegistry.waitForSearchResults(1);
  await companyRegistry.chooseFromSearch(COMPANY_WITHOUT_CASHBACK.empresa);
  await companyRegistry.waitForUpdateDialog();
  await companyRegistry.acceptUpdateDialog();
}

function withCompanyWithoutCashback(cloud: Cloud): void {
  cloud.companies = [COMPANY_WITHOUT_CASHBACK];
  cloud.setPermissions("asesor", { padron_buscar: true });
}

function withSalaryFlyer(cloud: Cloud): void {
  cloud.addFlyerOption({
    option: 7,
    name: "Sueldo",
    image: FLYER_IMAGE,
    legal: "El cashback es {cashback}.",
    tab: "sueldo",
  });
  cloud.setPermissions("asesor", { opcion_7: true, opcion_9: false });
}

function withCategoryFlyer(cloud: Cloud, calibration: Record<string, unknown> = {}): void {
  cloud.addFlyerOption({
    option: 8,
    name: "Combustible",
    image: FLYER_IMAGE,
    legal: "Legal del rubro.",
    tab: "rubros",
    calibration,
  });
  cloud.setPermissions("asesor", { opcion_8: true, opcion_9: false });
}

test.describe("Flyer Galicia", () => {
  test(
    "draws the four amounts and the amounts change with the configuration",
    { tag: "@react" },
    async ({ cloud, openApp }) => {
      cloud.bucketJson["_cashback.json"] = {
        configs: [
          { nombre: "BAU", m1: "$250.000", m2: "$180.000", m3: "$80.000", m4: "$30.000" },
          { nombre: "Config 1", m1: "$111.000", m2: "$11.000", m3: "$1.100", m4: "$110" },
        ],
      };
      const { flyerDrawing, flyerEditor } = await openApp();

      const base = textsOf(await flyerDrawing.draw());
      for (const amount of AMOUNTS) expect.soft(base, amount).toContain(amount);

      await flyerEditor.chooseCashback("Config 1");
      const other = textsOf(await flyerDrawing.draw());
      expect.soft(other).toContain("$111.000");
      expect.soft(other).not.toContain("$250.000");
    },
  );

  test(
    "a company with no cashback still covers the zone, with no number",
    { tag: "@react" },
    async ({ cloud, openApp }) => {
      withCompanyWithoutCashback(cloud);
      const app = await openApp();
      const covered = (await app.flyerDrawing.draw()).rectangles.length;

      await bringCompanyWithoutCashback(app);

      const drawn = await app.flyerDrawing.draw();
      for (const amount of AMOUNTS) expect.soft(textsOf(drawn), amount).not.toContain(amount);
      expect.soft(drawn.rectangles.length, "the same zones are covered").toBe(covered);
    },
  );

  test(
    "the color that covers the amounts comes from the artwork and not from the zoom",
    { tag: "@react" },
    async ({ openApp }) => {
      const { flyerDrawing, flyerEditor } = await openApp();
      const region = { x: 506, y: 790, width: BOX_WIDTH, height: 4 };

      await flyerEditor.setZoom(1);
      const near = await flyerDrawing.previewCoverColors();
      await flyerEditor.setZoom(0.4);
      const far = await flyerDrawing.previewCoverColors();

      expect.soft(near.length, "something is covered").toBeGreaterThan(0);
      expect.soft(far, "seen closer or farther it is the same color").toEqual(near);

      const artwork = await flyerDrawing.artworkRegionColor(region);
      const [red = 0, green = 0, blue = 0] = artwork;
      const covers = (await flyerDrawing.draw()).rectangles
        .filter(({ width }) => width === BOX_WIDTH)
        .map(({ color }) => color);
      const parsed = covers.flatMap((color) => {
        const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
        return match ? [match.slice(1).map((part) => Number.parseInt(part, 16))] : [];
      });
      expect.soft(parsed.length, "colors are read").toBeGreaterThan(0);
      for (const [r = 0, g = 0, b = 0] of parsed) {
        const distance = Math.max(Math.abs(r - red), Math.abs(g - green), Math.abs(b - blue));
        expect.soft(distance, "it is the tone printed right above").toBeLessThan(MAX_TONE_DISTANCE);
      }
    },
  );

  test(
    "two by two amounts go where each box says",
    { tag: "@react" },
    async ({ cloud, openApp }) => {
      const montos = {
        y: 824,
        fs: 46,
        mh: 46,
        bg: hex("f4e0d3"),
        boxes: [
          { xc: 626, ew: 240, col: "#1d4070" },
          { xc: 890, ew: 240, col: "#1d4070" },
          { xc: 626, ew: 240, y: 905, col: ORANGE },
          { xc: 890, ew: 240, y: 905, col: ORANGE },
        ],
      };
      cloud.addFlyerOption({
        option: 6,
        name: "Mixto",
        image: "flyer_t6.jpg?v=1",
        legal: "L",
        calibration: { montos },
      });
      cloud.setPermissions("asesor", { opcion_6: true, opcion_9: false });
      const { flyerDrawing } = await openApp({ startOption: 6 });

      const { texts } = await flyerDrawing.draw();
      const [first, second, third, fourth] = AMOUNTS.map(
        (amount) =>
          texts.find(({ text }) => text === amount) ?? {
            x: -1,
            y: -1,
            color: "",
            text: "",
            font: "",
          },
      );
      expect.soft(first?.y, "first row").toBe(second?.y);
      expect.soft(third?.y, "second row").toBe(fourth?.y);
      expect.soft(third?.y, "below").toBeGreaterThan(first?.y ?? 0);
      expect.soft(third?.x, "one column").toBe(first?.x);
      expect.soft(first?.color, "each with its color").toBe("#1d4070");
      expect.soft(third?.color).toBe(ORANGE);
    },
  );
});

test.describe("Flyer Sueldo", () => {
  test(
    "is its own tab, with a single amount: the biggest, in the orange of the flyer",
    { tag: "@react" },
    async ({ cloud, openApp }) => {
      withSalaryFlyer(cloud);
      const { session, flyerDrawing } = await openApp({ startOption: 7 });

      expect.soft(await session.activeHeaderTab()).toMatch(/Sueldo/);
      const { texts } = await flyerDrawing.draw();
      const amount = texts.filter(({ text }) => AMOUNTS.includes(text));
      expect
        .soft(
          amount.map(({ text }) => text),
          "one amount and the biggest",
        )
        .toEqual(["$250.000"]);
      expect.soft(amount[0]?.color, "the orange of the PDF").toBe(ORANGE);
    },
  );

  test(
    "a company with no cashback covers its zone with the real background",
    { tag: "@react" },
    async ({ cloud, openApp }) => {
      withSalaryFlyer(cloud);
      withCompanyWithoutCashback(cloud);
      const app = await openApp({ startOption: 7 });
      const before = await app.flyerDrawing.draw();

      await bringCompanyWithoutCashback(app);

      const after = await app.flyerDrawing.draw();
      expect.soft(textsOf(after)).not.toContain("$250.000");
      expect.soft(after.rectangles.length, "it still covers").toBe(before.rectangles.length);
      expect
        .soft(sentence(after), "and {cashback} in the legal goes blank too")
        .not.toMatch(/\$250\.000/);
    },
  );

  test(
    "the legal says the same amount as the orange number",
    { tag: "@react" },
    async ({ cloud, openApp }) => {
      withSalaryFlyer(cloud);
      const { flyerDrawing } = await openApp({ startOption: 7 });

      expect.soft(sentence(await flyerDrawing.draw())).toContain("El cashback es $250.000");
    },
  );
});

test.describe("Flyer Rubros", { tag: "@react" }, () => {
  test("is its own tab and adds the benefit lines, with the company and its cap", async ({
    cloud,
    openApp,
  }) => {
    withCategoryFlyer(cloud);
    const { session, flyerDrawing, flyerEditor } = await openApp({ startOption: 8 });
    expect.soft(await session.activeHeaderTab()).toMatch(/Rubros/);
    expect
      .soft(await flyerEditor.benefitFieldLabels(), "its fields show")
      .toContain("Nombre en el beneficio");

    await flyerEditor.fillCompanyName("ACME SA");
    await flyerEditor.fillBenefitCap("50000");

    const words = sentence(await flyerDrawing.draw());
    expect.soft(words, "the company is copied by itself").toMatch(/Además, ACME SA tiene/);
    expect.soft(words, "the cap with its format").toMatch(/\$50\.000/);
  });

  test("the name of the benefit is one's own once written", async ({ cloud, openApp }) => {
    withCategoryFlyer(cloud);
    const { flyerEditor, flyerDrawing } = await openApp({ startOption: 8 });

    await flyerEditor.fillBenefitName("OTRO NOMBRE");
    await flyerEditor.fillCompanyName("ACME SA");

    expect.soft(sentence(await flyerDrawing.draw())).toMatch(/OTRO NOMBRE/);
  });

  test("an additional promotion is written in two columns with its name in the text", async ({
    cloud,
    openApp,
  }) => {
    withCategoryFlyer(cloud);
    const { flyerEditor, flyerDrawing } = await openApp({ startOption: 8 });

    await flyerEditor.fillCompanyName("ACME SA");
    await flyerEditor.fillBenefitCap("24000");

    const drawn = await flyerDrawing.draw();
    const { texts } = drawn;
    const words = sentence(drawn);
    expect.soft(words).toMatch(/promo adicional/);
    expect.soft(words).toMatch(/Tope de reintegro mensual \$24\.000/);
    const left = texts.find(({ text }) => /Adem/.test(text))?.x ?? 0;
    const right = texts.find(({ text }) => /Tope/.test(text))?.x ?? 0;
    expect.soft(right, "the columns do not pile up").toBeGreaterThan(left);
  });

  test("without any flyer of that tab, the tab is not offered", async ({ openApp }) => {
    const { session } = await openApp();

    const tabs = await session.headerTabs();
    expect.soft(tabs.join(" ")).not.toMatch(/Rubros/);
    expect.soft(tabs.join(" ")).not.toMatch(/Sueldo/);
  });
});
