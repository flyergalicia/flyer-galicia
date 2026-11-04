// Replaces pruebas/t79_pulido_visual.cjs.
import { type AppColors } from "../../support/driver/session.ts";
import { expect, test } from "../../support/test.ts";

const NOT_PAINTED = /rgba\(0, 0, 0, 0\)|transparent/;
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1366, height: 800 };
const WHITE = "rgb(255, 255, 255)";
const READABLE_CONTRAST = 4.5;
const MAX_DISABLED_OPACITY = 0.6;
const MAX_UPLOAD_BUTTON_DEPTH_PX = 260;
// The theme changes with a CSS transition.
const THEME_TRANSITION_MS = 400;
// The table rearranges itself after the window changes size.
const LAYOUT_SETTLE_MS = 300;

function luminance(color: string): number {
  const channels = (color.match(/[\d.]+/g) ?? []).map(Number).slice(0, 3);
  const [red = 0, green = 0, blue = 0] = channels.map((value) => {
    const unit = value / 255;
    return unit <= 0.039_28 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** WCAG contrast between two colors written as "rgb(...)". */
function contrast({ text, background }: AppColors): number {
  const one = luminance(text);
  const other = luminance(background);
  return (Math.max(one, other) + 0.05) / (Math.min(one, other) + 0.05);
}

test("the name menu, the disabled button and the file names read well", async ({ openApp }) => {
  const app = await openApp({ user: "admin" });
  const { page, session } = app;

  await session.openUserMenu();
  const darkMode = page.getByRole("button", { name: "Modo oscuro" }).getByText("Modo oscuro");
  await expect
    .soft(darkMode, 'name menu: "Modo oscuro" is not an orange pill')
    .toHaveCSS("background-color", NOT_PAINTED);
  await expect.soft(darkMode, "name menu: no capitals").toHaveCSS("text-transform", "none");
  await session.closeUserMenu();

  expect
    .soft(await session.disabledDownloadButtonOpacity(), "a disabled button looks disabled")
    .toBeLessThanOrEqual(MAX_DISABLED_OPACITY);

  expect
    .soft(await session.downloadFileName("Flyer {empresa}", { empresa: "" }), "no company: Flyer")
    .toBe("Flyer");
  expect
    .soft(await session.downloadFileName("Flyer {empresa}", { empresa: "ACME SA" }), "with one")
    .toBe("Flyer ACME SA");
  expect
    .soft(
      await session.downloadFileName("{empresa} - {asesor}", { empresa: "", nombre: "" }),
      "if nothing is left: Flyer",
    )
    .toBe("Flyer");
  expect.soft(app.pageErrors(), "no JavaScript errors").toEqual([]);
});

test("dark mode: the chosen flyer reads and Promociones logos stay on white", async ({
  openApp,
}) => {
  const app = await openApp({ user: "admin" });
  const { page, session } = app;

  await session.toggleDarkMode();
  await page.waitForTimeout(THEME_TRANSITION_MS);

  expect
    .soft(contrast(await session.selectedFlyerColors()), "dark mode: the chosen option reads")
    .toBeGreaterThanOrEqual(READABLE_CONTRAST);
  expect
    .soft(await session.promotionLogoBackground(), "dark mode: Promociones logos go on white")
    .toBe(WHITE);
  expect.soft(app.pageErrors(), "no JavaScript errors").toEqual([]);
});

test(
  "Cambiar logos does not open on a flyer that did not load",
  { tag: "@react" },
  async ({ openApp }) => {
    const app = await openApp({ user: "admin" });
    const { flyerEditor, session } = app;

    // Option 1 has no flyer.
    await flyerEditor.selectOption(1);
    await flyerEditor.waitForLoadProblem();
    expect.soft(await session.logoEditorOpens(), "it does not open with the notice on").toBe(false);

    await flyerEditor.selectOption(9);
    await flyerEditor.waitForOptionShown(9);
    expect
      .soft(await session.logoEditorOpens(), "with the flyer loaded it opens as always")
      .toBe(true);
  },
);

test("Promociones → Activas shows what each gives, and cards on a phone", async ({ openApp }) => {
  const app = await openApp({ user: "admin" });
  const { page, promotions, session } = app;

  await promotions.open("active");
  await promotions.chooseProvince("promotions", "BUENOS AIRES");
  await promotions.listActive();
  await expect.poll(async () => (await promotions.rows()).length).toBeGreaterThan(5);

  const { counters, firstSortOption } = await session.activePromotionsHeader();
  for (const counter of counters) {
    expect
      .soft(counter, "Activas: no counters that are always 0")
      .not.toMatch(/No encontrada|Revisar|Fuera de la provincia/);
  }
  expect.soft(firstSortOption, 'Activas: the usual order says "Como vienen"').toBe("Como vienen");
  const benefits = (await promotions.rows()).map(({ benefit }) => benefit).filter(Boolean);
  expect.soft(benefits.length, "Activas: each promotion shows what it gives").toBeGreaterThan(0);
  expect.soft(benefits[0], "without the period of the catalog").not.toMatch(/\.$/);

  await page.setViewportSize(PHONE);
  await page.waitForTimeout(LAYOUT_SETTLE_MS);
  const fit = await session.promotionsTableFit();
  expect.soft(fit.rowDisplay, "phone: Promociones goes in cards").toBe("grid");
  expect.soft(fit.tableWidth, "phone: they fit on the screen").toBeLessThanOrEqual(fit.screenWidth);
  expect.soft(fit.statusInsideTheScreen, "phone: with the status in sight").toBe(true);

  await promotions.backToFlyer();
  await page.waitForTimeout(LAYOUT_SETTLE_MS);
  const pill = await session.pressPhoneDownloadPill();
  expect.soft(pill.visible, 'phone: the pill has "Descargar"').toBe(true);
  expect.soft(pill.pressesOfTheDownloadButton, 'and it touches "Descargar PDF"').toBe(1);
  expect.soft(pill.staysMarked, "without staying marked").toBe(false);
  await page.setViewportSize(DESKTOP);

  const help = await session.databaseHelp();
  expect.soft(help.sections, 'Base de datos: the explanation goes in "¿Cómo funciona?"').toBe(2);
  expect.soft(help.allClosed, "closed").toBe(true);
  expect.soft(help.uploadButtonBelowTitle, '"Subir Excel" is there').not.toBeNull();
  expect
    .soft(help.uploadButtonBelowTitle, "on top, without paragraphs before")
    .toBeLessThan(MAX_UPLOAD_BUTTON_DEPTH_PX);
  expect.soft(app.pageErrors(), "no JavaScript errors").toEqual([]);
});
