import { type Page } from "@playwright/test";
import { type AdminDriver } from "../admin.ts";
import { type BenchmarkDriver, type BenchmarkView } from "../benchmark.ts";
import { type CommercialActionsDriver } from "../commercial-actions.ts";
import { type CompanyRegistryDriver } from "../company-registry.ts";
import { hunterRows } from "./hunter.ts";
import { type LogoEditorDriver } from "../logo-editor.ts";
import { type LogoStripDriver } from "../logo-strip.ts";
import { type PromotionsDriver } from "../promotions.ts";
import { type Appearance, type ReferenceScreen, type ScreensDriver } from "../screens.ts";
import { type SearchDriver } from "../search.ts";
import { type SessionDriver } from "../session.ts";
import { type StudioDriver } from "../studio.ts";

const WAIT_MS = 25_000;
const STABLE_MS = 400;
const STABLE_LIMIT_MS = 10_000;
const THEME_KEY = "fg_theme";
const PALETTE_KEY = "fg_palette";
const STRIP_REGION = { x: 140, y: 2650, width: 1000, height: 230 };

/** Waits for what the screen paints by itself: fonts, images, notices and late answers. */
async function waitToSettle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    // A lazy image out of sight never finishes loading: it is not on the screenshot either.
    const onScreen = Array.from(document.images).filter(
      (image) => image.loading !== "lazy" && image.src !== "",
    );
    await Promise.all(onScreen.map((image) => image.decode().catch(() => undefined)));
  });
  await page
    .getByRole("status")
    .and(page.locator('[data-visible="true"]'))
    .waitFor({ state: "detached", timeout: WAIT_MS });
  const read = () => page.evaluate(() => document.body.innerHTML);
  const deadline = performance.now() + STABLE_LIMIT_MS;
  let before = await read();
  while (performance.now() < deadline) {
    await page.waitForTimeout(STABLE_MS);
    const now = await read();
    if (now === before) return;
    before = now;
  }
}

/** Inside, as a person does. In the entry there is no menu: what it would find saved. */
async function applyAppearance(
  page: Page,
  session: SessionDriver,
  { dark, palette }: Appearance,
): Promise<void> {
  if (await page.getByRole("banner").isVisible()) {
    await session.openUserMenu();
    const menu = page.getByRole("menu", { name: "Tu cuenta" });
    if ((await session.isDarkMode()) !== dark) {
      await menu.getByRole("menuitem", { name: /^Modo (oscuro|claro)$/ }).click();
    }
    await menu.getByRole("button", { name: new RegExp(`^${palette}$`, "i") }).click();
    await session.closeUserMenu();
    // The mouse does not stay over the menu, and whoever changes the theme did not move the page.
    await page.mouse.move(0, 0);
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    return;
  }
  await page.evaluate(
    ({ isDark, name, themeKey, paletteKey }) => {
      const root = document.documentElement;
      root.classList.toggle("dark", isDark);
      for (const other of root.className.match(/\bt-\w+/g) ?? []) root.classList.remove(other);
      root.classList.add(name);
      localStorage.setItem(themeKey, isDark ? "dark" : "light");
      localStorage.setItem(paletteKey, name);
    },
    { isDark: dark, name: `t-${palette}`, themeKey: THEME_KEY, paletteKey: PALETTE_KEY },
  );
}

interface ScreenDrivers {
  readonly session: SessionDriver;
  readonly promotions: PromotionsDriver;
  readonly companyRegistry: CompanyRegistryDriver;
  readonly logoEditor: LogoEditorDriver;
  readonly logoStrip: LogoStripDriver;
  readonly studio: StudioDriver;
  readonly commercialActions: CommercialActionsDriver;
  readonly benchmark: BenchmarkDriver;
  readonly admin: AdminDriver;
  readonly search: SearchDriver;
}

/** Windows over the flyer: what they show is the point, and its photo alone weighs half an image. */
const WINDOWS_OVER_THE_FLYER: ReadonlySet<ReferenceScreen> = new Set([
  "database-companies",
  "database-advisors",
  "user-menu",
  "admin-dashboard",
  "admin-users",
  "admin-permissions",
  "admin-flyer-config",
  "screen-search",
]);

/**
 * With the window busy, a click that has to try again moves the page to reach its button, which a
 * person does not do: the window opens over the page as it was.
 */
async function hideFlyer(page: Page): Promise<void> {
  await page.getByTestId("flyer-canvas").evaluate((canvas) => {
    if (canvas instanceof HTMLElement) canvas.style.visibility = "hidden";
    window.scrollTo(0, 0);
  });
}

function openers(
  page: Page,
  {
    session,
    promotions,
    companyRegistry,
    logoEditor,
    logoStrip,
    studio,
    commercialActions,
    benchmark,
    admin,
    search,
  }: ScreenDrivers,
) {
  const benchmarkView = (view: BenchmarkView) => async () => {
    await benchmark.open();
    await benchmark.showView(view);
  };
  const ready: Partial<Record<ReferenceScreen, () => Promise<void>>> = {
    login: () =>
      page.getByRole("heading", { name: "Flyer Galicia", level: 1 }).waitFor({ timeout: WAIT_MS }),
    "user-menu": () => session.openUserMenu(),
    "flyer-editor": async () => undefined,
    "preview-window": async () => {
      await page.getByRole("button", { name: "Vista previa", exact: true }).first().click();
      await page
        .locator('[data-testid="preview-window-picture"][src^="data:"]')
        .waitFor({ timeout: WAIT_MS });
      await page.mouse.move(0, 0);
    },
    studio: () => studio.open(),
    "commercial-actions-list": async () => {
      await commercialActions.open();
      await commercialActions.goToTab("actions");
    },
    "commercial-actions-agenda": async () => {
      await commercialActions.open();
      await commercialActions.goToTab("agenda");
    },
    "commercial-actions-dashboard": async () => {
      await commercialActions.open();
      await commercialActions.goToTab("dashboard");
    },
    "logo-editor": async () => {
      await logoEditor.enter();
      await logoEditor.waitForBrandCatalog();
    },
    "promotions-active": async () => {
      await promotions.open("active");
      await promotions.chooseProvince("promotions", "CAPITAL FEDERAL");
      await promotions.listActive();
    },
    "database-companies": async () => {
      await companyRegistry.openRegistry();
      await companyRegistry.chooseDatabaseTab("Mis empresas");
    },
    "database-advisors": async () => {
      await companyRegistry.openRegistry();
      await companyRegistry.chooseDatabaseTab("Mis asesores");
    },
    "promotions-search": async () => {
      await promotions.open("search");
      await promotions.searchBrands(["Coto", "Farmacity", "Axion", "Marca inexistente"]);
    },
    hunter: async () => {
      await session.waitUntilSignedIn();
      await page.getByRole("banner").getByRole("tab", { name: "Buscar flyer" }).click();
      await hunterRows(page).first().waitFor({ timeout: WAIT_MS });
    },
    "benchmark-summary": benchmarkView("rubro"),
    "benchmark-brands": benchmarkView("brand"),
    "benchmark-week": benchmarkView("week"),
    "benchmark-merchant": async () => {
      await benchmarkView("merchant")();
      await benchmark.searchMerchant("Coto");
    },
    "benchmark-versus": benchmarkView("versus"),
    "benchmark-cards": benchmarkView("cards"),
    "admin-dashboard": async () => {
      await admin.openPanel();
      await page.getByTestId("admin-dashboard").getByTestId("person-row").first().waitFor();
    },
    "admin-users": async () => {
      await admin.openPanel();
      await admin.openUsers();
    },
    "admin-permissions": async () => {
      await admin.openPanel();
      await admin.openSheet("Admin", "Facultades");
      await admin.facultyRows();
      // A person taps the sheet where it shows: the row of sheets does not move under the finger.
      await page
        .getByRole("tablist", { name: "Hojas de Admin" })
        .evaluate((list) => list.scrollTo({ left: 0 }));
    },
    "admin-flyer-config": async () => {
      await admin.openPanel();
      await admin.openSheet("Config", "Flyer");
      await page.getByTestId("flyer-list").waitFor({ timeout: WAIT_MS });
      // A person taps the sheet where it shows: the row of sheets does not move under the finger.
      await page
        .getByRole("tablist", { name: "Hojas de Config" })
        .evaluate((list) => list.scrollTo({ left: 0 }));
    },
    "screen-search": () => search.search(""),
    "logo-strip-window": async () => {
      await logoEditor.enter();
      await logoEditor.waitForBrandCatalog();
      await logoStrip.open(STRIP_REGION);
      // The mouse that marked the strip does not stay over a button of the window.
      await page.mouse.move(0, 0);
    },
  };
  return ready;
}

/** Where the content of a place starts, for the screens that open with filters on top. */
const CONTENT_OF: Partial<Record<ReferenceScreen, string>> = {
  "promotions-active": "promotions-results",
  "promotions-search": "promotions-results",
  "commercial-actions-dashboard": "dashboard-content",
  "benchmark-summary": "benchmark-tabs",
  "benchmark-brands": "benchmark-tabs",
  "benchmark-week": "benchmark-tabs",
  "benchmark-merchant": "benchmark-tabs",
  "benchmark-versus": "benchmark-tabs",
  "benchmark-cards": "benchmark-tabs",
};
// What stays above the scrolled content: the header of the app is sticky on a phone.
const STICKY_HEADER_PX = 90;

export function createReactScreensDriver(page: Page, drivers: ScreenDrivers): ScreensDriver {
  const { session } = drivers;
  const open = openers(page, drivers);
  return {
    open: async (screen) => {
      const opener = open[screen];
      if (!opener) {
        throw new Error(
          `The screen "${screen}" has no React driver yet: it arrives with its slice.`,
        );
      }
      await opener();
      await waitToSettle(page);
      if (WINDOWS_OVER_THE_FLYER.has(screen)) await hideFlyer(page);
    },
    showContent: async (screen) => {
      const content = CONTENT_OF[screen];
      if (!content) {
        throw new Error(`The screen "${screen}" has no content to scroll to in React yet.`);
      }
      await page.getByTestId(content).evaluate((element, margin) => {
        if (!(element instanceof HTMLElement)) return;
        element.style.scrollMarginTop = `${String(margin)}px`;
        element.scrollIntoView({ behavior: "instant", block: "start" });
      }, STICKY_HEADER_PX);
      await waitToSettle(page);
    },
    setAppearance: (appearance) => applyAppearance(page, session, appearance),
  };
}
