import { type Page } from "@playwright/test";
import { type BenchmarkDriver, type BenchmarkView } from "../benchmark.ts";
import { type CommercialActionsDriver, type CommercialTab } from "../commercial-actions.ts";
import { type LogoEditorDriver } from "../logo-editor.ts";
import { type LogoStripDriver } from "../logo-strip.ts";
import { type PromotionsDriver } from "../promotions.ts";
import { type ReferenceScreen, type ScreensDriver } from "../screens.ts";
import { type AdminDriver } from "../admin.ts";
import { type SearchDriver } from "../search.ts";
import { type SessionDriver } from "../session.ts";
import { type StudioDriver } from "../studio.ts";
import { VIEW_TABS } from "./benchmark.ts";

const WAIT_MS = 25_000;
const STABLE_MS = 400;
const STABLE_LIMIT_MS = 10_000;
// A strip of the flyer with logos, in flyer pixels.
const STRIP_REGION = { x: 140, y: 2650, width: 1000, height: 230 };
const VISIBLE_NOTICES = "#toast-el.show";
/** Windows over the flyer: what they show is the point, and its photo alone weighs half an image. */
const WINDOWS_OVER_THE_FLYER: ReadonlySet<ReferenceScreen> = new Set([
  "database-companies",
  "database-advisors",
  "admin-dashboard",
  "admin-users",
  "admin-permissions",
  "admin-flyer-config",
  "user-menu",
  "screen-search",
]);

/** Where the content of a place starts, for the screens that open with filters on top. */
const CONTENT_OF: Partial<Record<ReferenceScreen, string>> = {
  "promotions-active": ".promos-results",
  "promotions-search": ".promos-results",
  "commercial-actions-dashboard": ".ges-g2",
  "benchmark-summary": ".ben-tabs",
  "benchmark-brands": ".ben-tabs",
  "benchmark-week": ".ben-tabs",
  "benchmark-merchant": ".ben-tabs",
  "benchmark-versus": ".ben-tabs",
  "benchmark-cards": ".ben-tabs",
};
// What stays above the scrolled content: the header of the app is sticky on a phone.
const STICKY_HEADER_PX = 90;

interface ScreenDrivers {
  session: SessionDriver;
  logoEditor: LogoEditorDriver;
  logoStrip: LogoStripDriver;
  promotions: PromotionsDriver;
  studio: StudioDriver;
  commercialActions: CommercialActionsDriver;
  benchmark: BenchmarkDriver;
  admin: AdminDriver;
  search: SearchDriver;
}

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
  await page.locator(VISIBLE_NOTICES).waitFor({ state: "detached", timeout: WAIT_MS });
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

async function hideFlyer(page: Page): Promise<void> {
  await page.evaluate(() => {
    cv.style.visibility = "hidden";
  });
}

async function openDatabase(page: Page, pane: "empresas" | "asesores"): Promise<void> {
  await page.evaluate((name) => {
    openMiPadron(name);
  }, pane);
  await page.locator("#pad-mine-ov").waitFor({ timeout: WAIT_MS });
}

async function openAdminSheet(
  page: Page,
  admin: AdminDriver,
  sheet: "dashboard" | "usuarios" | "facultades" | "subir",
): Promise<void> {
  await admin.openPanel();
  await page.evaluate((name) => {
    switchAdminTab(document.querySelector(`.stab[data-tab="${name}"]`), name);
  }, sheet);
}

async function openPreviewWindow(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Vista previa", exact: true }).first().click();
  await page.locator("#modal.show img[src^='data:']").waitFor({ timeout: WAIT_MS });
}

function benchmarkView(page: Page, benchmark: BenchmarkDriver, view: BenchmarkView) {
  return async () => {
    await benchmark.open();
    // On a phone the summary makes the page wider than the screen and leaves these tabs out of it.
    await page.getByRole("tab", { name: VIEW_TABS[view] }).dispatchEvent("click");
  };
}

function commercialTab(actions: CommercialActionsDriver, tab: CommercialTab) {
  return async () => {
    await actions.open();
    await actions.goToTab(tab);
  };
}

function openers(page: Page, drivers: ScreenDrivers): Record<ReferenceScreen, () => Promise<void>> {
  const { session, logoEditor, logoStrip, promotions, studio, benchmark, admin, search } = drivers;
  const actions = drivers.commercialActions;
  return {
    login: () => page.locator("#login-ov").waitFor({ timeout: WAIT_MS }),
    "flyer-editor": async () => undefined,
    "preview-window": () => openPreviewWindow(page),
    "logo-editor": async () => {
      await logoEditor.enter();
      await logoEditor.waitForBrandCatalog();
    },
    "logo-strip-window": async () => {
      await logoEditor.enter();
      await logoEditor.waitForBrandCatalog();
      await logoStrip.open(STRIP_REGION);
    },
    "promotions-active": async () => {
      await promotions.open("active");
      await promotions.chooseProvince("promotions", "CAPITAL FEDERAL");
      await promotions.listActive();
    },
    "promotions-search": async () => {
      await promotions.open("search");
      await promotions.searchBrands(["Coto", "Farmacity", "Axion", "Marca inexistente"]);
    },
    studio: () => studio.open(),
    "database-companies": () => openDatabase(page, "empresas"),
    "database-advisors": () => openDatabase(page, "asesores"),
    hunter: async () => {
      await session.waitUntilSignedIn();
      await page.locator("#apptab-hunter").click();
      await page.locator("#hun-list .hun-row").first().waitFor({ timeout: WAIT_MS });
    },
    "commercial-actions-list": commercialTab(actions, "actions"),
    "commercial-actions-agenda": commercialTab(actions, "agenda"),
    "commercial-actions-dashboard": commercialTab(actions, "dashboard"),
    "benchmark-summary": benchmarkView(page, benchmark, "rubro"),
    "benchmark-brands": benchmarkView(page, benchmark, "brand"),
    "benchmark-week": benchmarkView(page, benchmark, "week"),
    "benchmark-merchant": async () => {
      await benchmarkView(page, benchmark, "merchant")();
      await benchmark.searchMerchant("Coto");
    },
    "benchmark-versus": benchmarkView(page, benchmark, "versus"),
    "benchmark-cards": benchmarkView(page, benchmark, "cards"),
    "admin-dashboard": () => openAdminSheet(page, admin, "dashboard"),
    "admin-users": () => openAdminSheet(page, admin, "usuarios"),
    "admin-permissions": () => openAdminSheet(page, admin, "facultades"),
    "admin-flyer-config": () => openAdminSheet(page, admin, "subir"),
    "user-menu": () => session.openUserMenu(),
    "screen-search": () => search.search(""),
  };
}

export function createLegacyScreensDriver(page: Page, drivers: ScreenDrivers): ScreensDriver {
  const open = openers(page, drivers);
  return {
    open: async (screen) => {
      await open[screen]();
      if (WINDOWS_OVER_THE_FLYER.has(screen)) await hideFlyer(page);
      await waitToSettle(page);
    },
    showContent: async (screen) => {
      const content = CONTENT_OF[screen];
      if (content === undefined) throw new Error(`${screen} has no content to scroll to`);
      await page
        .locator(content)
        .first()
        .evaluate((element, margin) => {
          element.style.scrollMarginTop = `${margin}px`;
          element.scrollIntoView({ behavior: "instant", block: "start" });
        }, STICKY_HEADER_PX);
      await waitToSettle(page);
    },
    setAppearance: async ({ dark, palette }) => {
      await page.evaluate(
        ({ isDark, name }) => {
          setPalette(name);
          if (document.documentElement.classList.contains("dark") !== isDark) toggleTheme();
        },
        { isDark: dark, name: `t-${palette}` },
      );
    },
  };
}
