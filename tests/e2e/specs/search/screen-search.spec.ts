// Replaces pruebas/t97_buscador_pantallas.cjs.
import { type OpenedApp } from "../../support/open-app.ts";
import { expect, test } from "../../support/test.ts";

const softly = expect.configure({ soft: true });
const SEARCH_PROMPT = "Buscar una pantalla o función";
const MARKUP = "<img src=x onerror=window.__xss=1>";
// A name with < or > never arrives (they are taken out on reading the list): as entities it does.
const ESCAPED_MARKUP = "&lt;img src=x onerror=window.__xss=1&gt;";
const HEADER_WIDTHS = [1920, 1366, 1180, 1024];
const DESKTOP = { width: 1366, height: 800 };
const PHONE = { width: 390, height: 800 };
const OUTSIDE_THE_PANEL = { x: 5, y: 700 };
const SLOW_SCREEN_MS = 15_000;
// Time for the error handler of a broken image to run, if the markup became HTML.
const IMAGE_ERROR_MS = 100;
// Time for a key press to have opened something, if it was going to.
const KEY_REACTION_MS = 150;

function panel({ page }: OpenedApp) {
  return page.getByRole("dialog", { name: "Buscador de pantallas" });
}

function field({ page }: OpenedApp) {
  return page.getByRole("combobox", { name: SEARCH_PROMPT });
}

function headerButton({ page }: OpenedApp) {
  return page.getByRole("button", { name: SEARCH_PROMPT });
}

test.describe("as an advisor", { tag: "@react" }, () => {
  test("it opens with both shortcuts and the button, and closes the same ways", async ({
    openApp,
  }) => {
    const app = await openApp();
    const { page } = app;
    await app.session.focusCompanyField();

    await page.keyboard.press("Control+k");
    await expect.soft(panel(app), "Ctrl+K opens it (Windows)").toBeVisible();
    await expect.soft(field(app), "the cursor stays on the search field").toBeFocused();
    await expect
      .soft(field(app), "the field has no focus ring of the forms")
      .toHaveCSS("box-shadow", "none");
    await expect
      .soft(field(app), "the field has no border of the forms")
      .toHaveCSS("border-top-width", "0px");

    await page.keyboard.press("Escape");
    await expect.soft(panel(app), "Escape closes it").toBeHidden();
    expect
      .soft(await app.session.companyFieldHasFocus(), "cancelling gives the focus back")
      .toBe(true);

    await page.keyboard.press("Meta+k");
    await expect.soft(panel(app), "Cmd+K opens it (Mac)").toBeVisible();
    await page.keyboard.press("Meta+k");
    await expect.soft(panel(app), "the same key closes it").toBeHidden();

    await headerButton(app).click();
    await expect.soft(panel(app), "the header button opens it").toBeVisible();
    await page.mouse.click(OUTSIDE_THE_PANEL.x, OUTSIDE_THE_PANEL.y);
    await expect.soft(panel(app), "touching outside closes it").toBeHidden();

    expect.soft(await app.search.shortcutLabelOn("windows"), "Windows label").toBe("Ctrl K");
    expect.soft(await app.search.shortcutLabelOn("mac"), "Mac label").toBe("⌘K");
  });

  test("it lists what an advisor has and takes there", async ({ openApp }) => {
    const app = await openApp();
    const { page, search, session } = app;
    const isShowing = session.isShowing.bind(session);

    await search.search("");
    const titles = await search.results();
    expect
      .soft(titles, "the advisor sees the flyer editor")
      .toEqual(expect.arrayContaining(["Masivo", "Historial"]));
    for (const panelSheet of ["Usuarios", "Auditoría", "Facultades"]) {
      expect.soft(titles, `the advisor does not see ${panelSheet}`).not.toContain(panelSheet);
    }
    await page.keyboard.press("Escape");

    await search.goTo("masivo");
    await softly.poll(() => isShowing("flyer-bulk"), "«masivo» + Enter opens Masivo").toBe(true);

    await search.search("promo");
    expect.soft((await search.results())[0], "what starts the same goes first").toBe("Promociones");
    await page.keyboard.press("Enter");
    await softly.poll(() => isShowing("promotions"), "Enter takes to Promociones").toBe(true);
    await expect.soft(panel(app), "and closes the search").toBeHidden();

    await search.goTo("activas");
    await softly
      .poll(
        () => session.modes().then(({ promotionsTab }) => promotionsTab),
        "«activas» selects it",
      )
      .toBe("activas");
    await softly.poll(() => isShowing("promotions-active"), "and it is on screen").toBe(true);

    await search.goTo("individual");
    await softly.poll(() => isShowing("flyer-layout"), "«individual» goes back").toBe(true);
    await softly.poll(() => isShowing("flyer-individual"), "to the Individual tab").toBe(true);

    // What was just used goes first, and only there.
    await search.search("");
    expect.soft((await search.groups())[0], "there is a group of recent ones").toBe("Recientes");
    const withRecent = await search.results();
    expect.soft(withRecent[0], "the last one used comes first").toBe("Individual");
    expect
      .soft(
        withRecent.filter((title) => title === "Individual"),
        "a recent one does not repeat further down",
      )
      .toHaveLength(1);
    await page.keyboard.press("Escape");

    await search.search("historial");
    await panel(app).getByRole("option").first().click();
    await softly.poll(() => isShowing("flyer-history"), "a click also chooses").toBe(true);

    await search.goTo("cambiar logos");
    await softly
      .poll(() => session.modes().then(({ logoEditing }) => logoEditing), "«cambiar logos» enters")
      .toBe(true);
    await softly.poll(() => isShowing("flyer-individual"), "and shows Individual").toBe(true);
  });

  test("it searches without minding capitals, with a missing letter or nothing found", async ({
    openApp,
  }) => {
    const app = await openApp();
    const { page, search } = app;

    await search.search("CAMBIAR CLAVE");
    expect
      .soft((await search.results())[0], "capitals do not matter and loose words are enough")
      .toBe("Cambiar mi clave");

    await search.search("prmociones");
    expect.soft(await search.results(), "it tolerates a missing letter").toContain("Promociones");

    await search.search("zzzzq");
    await expect.soft(panel(app), "without results it says so").toContainText("No encontré nada");
    expect.soft(await search.results(), "and it lists nothing").toEqual([]);
    await page.keyboard.press("Enter");
    await expect.soft(panel(app), "Enter without results does nothing").toBeVisible();

    await search.search(MARKUP);
    await page.waitForTimeout(IMAGE_ERROR_MS);
    expect
      .soft(await search.injectedMarkup(), "what is typed is not read as HTML")
      .toEqual({ ranScript: false, imageInList: false });
  });

  test("the keyboard moves around the list and the focus stays on the field", async ({
    openApp,
  }) => {
    const app = await openApp();
    const { page, search } = app;

    await search.search("");
    const total = (await search.results()).length;
    expect.soft(await search.markedResult(), "the first one starts marked").toBe(0);
    await page.keyboard.press("ArrowUp");
    expect.soft(await search.markedResult(), "up from the first goes to the last").toBe(total - 1);
    await page.keyboard.press("ArrowDown");
    expect.soft(await search.markedResult(), "down from the last goes to the first").toBe(0);
    await page.keyboard.press("Tab");
    await expect.soft(field(app), "Tab does not take the focus out").toBeFocused();
  });

  test("it does not fire the one-letter shortcuts of Cambiar logos", async ({ openApp }) => {
    const app = await openApp();
    const { page, search, logoEditor, session } = app;
    await logoEditor.enter();

    await search.search("");
    await page.keyboard.type("vrfni");

    expect.soft((await session.modes()).logoTools, "typing fires no V, R, F, N, I").toEqual([]);
    await expect.soft(field(app), "the letters stay on the field").toHaveValue("vrfni");
    await page.keyboard.press("Escape");
    expect.soft((await session.modes()).logoEditing, "Escape stays in Cambiar logos").toBe(true);
  });

  test("it waits for an open window, a running batch and a session", async ({ openApp }) => {
    const app = await openApp();
    const { page, search, session } = app;

    await session.showConfirmation("¿Seguro?");
    await page.keyboard.press("Control+k");
    await page.waitForTimeout(KEY_REACTION_MS);
    await expect.soft(panel(app), "with a window open it does not open on top").toBeHidden();
    await expect.soft(page.getByText("Cerrá la ventana abierta"), "and it says why").toBeVisible();
    await page.keyboard.press("Escape");
    await session.removeConfirmations();

    await session.pretendBatchRunning(true);
    await page.keyboard.press("Control+k");
    await page.waitForTimeout(KEY_REACTION_MS);
    await expect.soft(panel(app), "generating a ZIP does not let you leave").toBeHidden();
    await session.pretendBatchRunning(false);

    expect
      .soft(await search.shortcutWithoutSession(), "without a session the key stays the browser's")
      .toEqual({ opened: false, appKeptTheKey: false });
  });
});

test.describe("as an administrator", () => {
  test(
    "it reaches the panel, other screens and inner views",
    { tag: "@react" },
    async ({ openApp }) => {
      const app = await openApp({ user: "admin" });
      const { page, search, session, admin } = app;
      const isShowing = session.isShowing.bind(session);

      await search.search("auditoria");
      expect.soft((await search.results())[0], "it searches without accents").toBe("Auditoría");
      await page.keyboard.press("Enter");
      await softly.poll(() => admin.isPanelOpen(), "it opens the panel").toBe(true);
      await softly.poll(() => isShowing("admin-audit"), "on Auditoría").toBe(true);

      await search.goTo("legales");
      await softly
        .poll(() => isShowing("admin-legal"), "with it open, it changes sheet")
        .toBe(true);

      await search.goTo("benchmark");
      await softly.poll(() => admin.isPanelOpen(), "going to another screen closes it").toBe(false);
      await softly.poll(() => isShowing("benchmark"), "and shows that screen").toBe(true);

      await search.goTo("tarjetas");
      await softly
        .poll(() => app.benchmark.currentView(), {
          message: "it takes to an inner view of Benchmark",
          timeout: SLOW_SCREEN_MS,
        })
        .toBe("cards");
    },
  );

  test(
    "the name of a flyer takes to that flyer, from another screen",
    { tag: "@react" },
    async ({ openApp }) => {
      const app = await openApp({ user: "admin" });
      await app.search.goTo("promociones");
      await softly.poll(() => app.session.isShowing("promotions")).toBe(true);

      const other = await app.session.anotherAvailableFlyer();
      expect.soft(other, "there is another flyer to go to").not.toBeNull();
      await app.search.goTo(other?.name ?? "");

      await softly
        .poll(() => app.session.currentFlyerOption(), {
          message: `it goes to ${String(other?.name)}`,
          timeout: SLOW_SCREEN_MS,
        })
        .toBe(other?.option);
      await softly.poll(() => app.session.isShowing("flyer-editor"), "on the editor").toBe(true);
    },
  );

  test(
    "Base de datos opens from the search and closes by going elsewhere",
    { tag: "@react" },
    async ({ openApp }) => {
      const app = await openApp({ user: "admin" });
      const { page, search, session } = app;

      await search.goTo("mis asesores");
      await softly.poll(() => session.isShowing("my-database"), "Base de datos opens").toBe(true);

      await search.search("mis asesores");
      expect
        .soft(await search.resultLines(), "each result says where it is from")
        .toEqual(expect.arrayContaining([expect.stringMatching(/Mis asesores.*Base de datos/)]));
      await page.keyboard.press("Escape");

      await search.goTo("promociones");
      await softly
        .poll(() => session.isShowing("my-database"), "going elsewhere closes it")
        .toBe(false);
      await softly.poll(() => session.isShowing("promotions"), "and shows that screen").toBe(true);
    },
  );

  test(
    "the name of a flyer that arrives with markup is listed as written",
    { tag: "@react" },
    async ({ cloud, openApp }) => {
      cloud.addFlyerOption({ option: 12, name: ESCAPED_MARKUP, image: null, legal: "" });
      const app = await openApp({ user: "admin" });

      await app.search.search("");
      await app.page.waitForTimeout(IMAGE_ERROR_MS);

      expect
        .soft(await app.search.results(), "it is listed, as it was written")
        .toContain(ESCAPED_MARKUP);
      expect
        .soft(await app.search.injectedMarkup(), "the name of a flyer is not read as HTML")
        .toEqual({ ranScript: false, imageInList: false });
    },
  );

  test(
    "dark mode applies without moving and the panel stays readable",
    { tag: "@react" },
    async ({ openApp }) => {
      const app = await openApp({ user: "admin" });
      const { search, session } = app;
      await search.goTo("promociones");
      await softly.poll(() => session.isShowing("promotions")).toBe(true);

      await search.goTo("modo oscuro");
      await softly.poll(() => session.isDarkMode(), "the theme changes").toBe(true);
      expect.soft(await session.isShowing("promotions"), "without moving of screen").toBe(true);

      await search.search("");
      const { background, text } = await search.panelColors();
      expect.soft(background, "in dark mode the background is dark").not.toBe("rgb(255, 255, 255)");
      expect.soft(text, "and the letters stand out from it").not.toBe(background);
    },
  );

  test(
    "the header holds every tab of the administrator",
    { tag: "@react" },
    async ({ openApp }) => {
      const app = await openApp({ user: "admin" });
      for (const width of HEADER_WIDTHS) {
        await app.page.setViewportSize({ width, height: DESKTOP.height });
        await expect
          .poll(() => app.session.headerFit().then(({ windowWidth }) => windowWidth))
          .toBe(width);
        const fit = await app.session.headerFit();
        expect
          .soft(fit.contentWidth, `${String(width)}px: the header does not overflow`)
          .toBeLessThanOrEqual(fit.visibleWidth + 1);
        expect
          .soft(fit.searchButtonRight, `${String(width)}px: the button is inside the window`)
          .toBeLessThanOrEqual(fit.windowWidth);
      }
    },
  );
});

test.describe("as Gestiones people", { tag: "@react" }, () => {
  test.beforeEach(({ cloud }) => {
    cloud.seedCommercialActions();
  });

  test("a hunter sees only what is theirs and reaches their agenda", async ({ openApp }) => {
    const app = await openApp({ user: "hunter", commercialActions: true, waitUntilReady: false });
    await app.session.waitForCommercialActions();

    await app.search.search("");
    const titles = await app.search.results();
    expect
      .soft(titles, "a hunter sees Buscar flyer and their agenda")
      .toEqual(expect.arrayContaining(["Buscar flyer", "Mi agenda"]));
    for (const hidden of ["Masivo", "Individual", "Usuarios"]) {
      expect.soft(titles, `a hunter does not see ${hidden}`).not.toContain(hidden);
    }

    await app.search.search("mi agenda");
    await app.page.keyboard.press("Enter");
    await softly
      .poll(() => app.session.modes().then(({ commercialActionsTab }) => commercialActionsTab), {
        message: "«mi agenda» opens the agenda",
        timeout: SLOW_SCREEN_MS,
      })
      .toBe("agenda");
    expect
      .soft(await app.session.isShowing("commercial-actions"), "and Gestiones is on screen")
      .toBe(true);
  });

  test("a leader sees what is of their team and not the editor", async ({ openApp }) => {
    const app = await openApp({ user: "leader", commercialActions: true, waitUntilReady: false });
    await app.session.waitForCommercialActions();

    await app.search.search("");
    const titles = await app.search.results();
    expect.soft(titles, "a leader sees the agenda of the team").toContain("Agenda del equipo");
    expect.soft(titles, "a leader does not see Mis empresas").not.toContain("Mis empresas");
    expect.soft(titles, "a leader does not see Masivo").not.toContain("Masivo");
  });
});

test(
  "on a phone it fits, with a field that does not zoom, and works with the finger",
  { tag: "@react" },
  async ({ openApp }) => {
    const app = await openApp({ user: "admin", viewport: PHONE, touch: true });

    await headerButton(app).tap();
    const layout = await app.search.panelLayout();
    expect.soft(layout.left, "it fits on the left").toBeGreaterThanOrEqual(0);
    expect.soft(layout.right, "it fits on the right").toBeLessThanOrEqual(layout.windowWidth);
    expect.soft(layout.pageWidth, "with no sideways bar").toBeLessThanOrEqual(layout.windowWidth);
    expect
      .soft(layout.fieldFontSizePx, "16 px at least: the iPhone does not zoom when touching it")
      .toBeGreaterThanOrEqual(16);

    await field(app).fill("promo");
    await app.page.getByRole("option").first().tap();
    await softly
      .poll(() => app.session.isShowing("promotions"), "the finger also takes to the screen")
      .toBe(true);
  },
);
