// Protects what only a text check guarded: the page fits the window, letters stay readable.
import { type AppColors } from "../../support/driver/session.ts";
import { expect, test } from "../../support/test.ts";

const PHONE = { width: 390, height: 844 };
const SMALLEST_TEXT_PX = 12;
const SMALLEST_LABEL_PX = 11;
const CONTRAST_TOLERANCE = 3;

function luminance(color: string): number {
  const channels = (color.match(/[\d.]+/g) ?? []).map(Number).slice(0, 3);
  const [red = 0, green = 0, blue = 0] = channels.map((value) => {
    const unit = value / 255;
    return unit <= 0.039_28 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast({ text, background }: AppColors): number {
  const one = luminance(text);
  const other = luminance(background);
  return (Math.max(one, other) + 0.05) / (Math.min(one, other) + 0.05);
}

test.describe("on a computer", () => {
  test("the editor fills the window and the form scrolls inside its panel", async ({ openApp }) => {
    const { session, officers } = await openApp();
    await officers.pressAdd();
    await officers.pressAdd();

    const fit = await session.documentFit();
    expect.soft(fit.documentScrolls, "the page itself does not scroll").toBe(false);
    expect
      .soft(fit.editorHeight, "the editor takes what the header leaves")
      .toBe(fit.windowHeight - fit.headerHeight);
    expect.soft(fit.panelScrollsInside, "the panel scrolls by itself").toBe(true);
  });

  test("the bar with the download stays in sight while the form scrolls", async ({ openApp }) => {
    const { session, officers } = await openApp();
    await officers.pressAdd();
    await officers.pressAdd();

    const dock = await session.downloadDock();
    expect.soft(dock.stuckToBottom).toBe(true);
    expect.soft(dock.buttons.join(" | ")).toMatch(/Vista previa.*Descargar PDF.*Otros/);
  });

  test("Descargar PDF tells its shortcut when the mouse rests on it", async ({ openApp }) => {
    const { session } = await openApp();

    expect.soft(await session.downloadButtonHint()).toMatch(/(Ctrl|⌘|Cmd) \+ Enter/);
  });

  test("the title of the amounts card has its accent", async ({ openApp }) => {
    const { session } = await openApp();

    expect.soft(await session.cashbackCardTitle()).toContain("Configuración de Montos");
  });

  test("one floating notice at a time, and the last one wins", async ({ openApp }) => {
    const { session, flyerEditor } = await openApp();

    await session.showNotice("Uno");
    await session.showNotice("Dos");

    expect.soft(await session.noticesOnScreen()).toBe(1);
    expect.soft(await flyerEditor.latestNotice()).toBe("Dos");
  });

  test(
    "two notices of real actions: one on screen, the last one",
    { tag: "@react" },
    async ({ cloud, openApp }) => {
      cloud.setPermissions("asesor", { notas: true });
      const { session, flyerEditor, page } = await openApp();
      await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
      await session.openNotes();

      await page.getByRole("button", { name: /Copiar/ }).click();
      await expect.poll(() => flyerEditor.latestNotice()).toBe("Nota copiada");
      await page.getByRole("button", { name: /Eliminar/ }).click();
      await session.waitForConfirmation();
      await session.answerConfirmation(true);

      await expect.poll(() => flyerEditor.latestNotice()).toBe("Nota eliminada");
      expect.soft(await session.noticesOnScreen()).toBe(1);
    },
  );

  test(
    "the screen takes what the header leaves, and the page itself does not scroll",
    { tag: "@react" },
    async ({ openApp }) => {
      const { session } = await openApp();

      const fit = await session.documentFit();

      expect.soft(fit.documentScrolls).toBe(false);
      expect.soft(fit.editorHeight).toBe(fit.windowHeight - fit.headerHeight);
    },
  );

  test("Cargando goes away as soon as the option arrives", async ({ cloud, openApp }) => {
    cloud.addFlyerOption({ option: 6, name: "Otra", image: "flyer_t6.jpg?v=1", legal: "Legal 6" });
    cloud.setPermissions("asesor", { opcion_6: true });
    const { session, flyerEditor } = await openApp({ startOption: 9 });

    await flyerEditor.selectOption(6);
    await flyerEditor.waitForOptionShown(6);

    expect.soft(await session.noticeVisible(), "no notice left over the new flyer").toBe(false);
  });

  test("in dark mode the chosen amounts button can be read", async ({ openApp }) => {
    const { session, page } = await openApp();
    await session.toggleDarkMode();
    await page.waitForTimeout(400);

    const colors = await session.chosenCashbackButtonColors();
    expect
      .soft(contrast(colors), `${colors.text} over ${colors.background}`)
      .toBeGreaterThan(CONTRAST_TOLERANCE);
  });

  test(
    "a single font family, with no trace of the first version",
    { tag: "@react" },
    async ({ openApp }) => {
      const { session } = await openApp();

      const families = await session.fontFamiliesOnScreen();
      expect.soft(families.join(" | "), "no Syne").not.toMatch(/Syne/);
      expect.soft(families.join(" | "), "no DM Sans").not.toMatch(/DM Sans/);
      expect.soft(families.join(" | "), "the one of the app").toMatch(/Figtree/);
    },
  );
});

test("what was chosen is on the page when it opens", { tag: "@react" }, async ({ openApp }) => {
  const { session, page } = await openApp({
    signedOut: true,
    waitUntilReady: false,
    localStorage: { fg_theme: "dark", fg_palette: "t-cielo" },
  });

  await expect.poll(() => session.isDarkMode()).toBe(true);
  await expect(page.locator("html")).toHaveClass(/t-cielo/);
});

test.describe("reading", () => {
  const screens = [
    { name: "the flyer editor", user: "asesor", open: null },
    { name: "the panel of the administrator", user: "admin", open: "panel" },
  ] as const;
  for (const { name, user, open } of screens) {
    test(`nothing in ${name} goes below the minimum letter`, async ({ openApp }) => {
      const app = await openApp({ user });
      if (open === "panel") await app.admin.openPanel();

      const smallest = await app.session.smallestTexts(25);
      for (const { text, size, upperCase } of smallest) {
        const minimum = upperCase ? SMALLEST_LABEL_PX : SMALLEST_TEXT_PX;
        expect.soft(size, `"${text}"`).toBeGreaterThanOrEqual(minimum);
      }
    });
  }

  test('no screen says "padrón": for the user it is "empresas"', async ({ cloud, openApp }) => {
    cloud.setPermissions("asesor", { padron_buscar: true, asesores_guardados: true });
    const app = await openApp();
    expect.soft(await app.session.visibleText()).not.toMatch(/padr[oó]n/i);

    await app.companyRegistry.openRegistry();
    expect.soft(await app.session.visibleText(), "Base de datos").not.toMatch(/padr[oó]n/i);
    await app.companyRegistry.closeRegistry();

    await app.companyRegistry.openSearch();
    expect.soft(await app.session.visibleText(), "the search").not.toMatch(/padr[oó]n/i);
    await app.companyRegistry.closeSearch();

    const sheet = await app.companyRegistry.templateName();
    expect.soft(sheet, "and neither the name of what it downloads").not.toMatch(/padr[oó]n/i);
  });
});

test.describe("on a phone", () => {
  test("the header keeps the logo and the whole name", { tag: "@react" }, async ({ openApp }) => {
    const { session } = await openApp({ touch: true, viewport: PHONE });

    const look = await session.headerLook();
    expect.soft(look.logoWidth, "the logo stays").toBeGreaterThanOrEqual(24);
    expect.soft(look.title).toMatch(/Flyer/);
    expect.soft(look.fitsTheWindow).toBe(true);
  });

  test(
    "the header fits between a phone and a computer too",
    { tag: "@react" },
    async ({ openApp }) => {
      const { session } = await openApp({ viewport: { width: 700, height: 800 } });

      const look = await session.headerLook();
      expect.soft(look.logoWidth, "the small logo, for the person to fit beside it").toBe(30);
      expect.soft(look.title).toMatch(/Flyer/);
      expect.soft(look.titleFits, "the tabs are not squeezed").toBe(true);
      expect.soft(look.fitsTheWindow).toBe(true);
    },
  );

  test("the fixed bar goes away and its buttons return to the form", async ({ openApp }) => {
    const { session } = await openApp({ touch: true, viewport: PHONE });

    expect.soft((await session.downloadDock()).buttons).toEqual([]);
  });
});
