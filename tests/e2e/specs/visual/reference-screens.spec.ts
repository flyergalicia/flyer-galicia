// The look of the current app, for the React rewrite to be compared against. It runs on the
// project of each version with the same images: see snapshotPathTemplate in playwright.config.ts.
// Only what fits the window goes in each image: the desktop screens scroll inside their panels,
// so a full-page image would be the same, and on a phone it changes the layout while it is taken.
// Update them with --update-snapshots, and only on purpose.
import { type CloudUser } from "../../support/cloud/index.ts";
import { type Appearance, type ReferenceScreen } from "../../support/driver/screens.ts";
import { type OpenAppOptions, type OpenedApp } from "../../support/open-app.ts";
import { expect, test } from "../../support/test.ts";
import { REFERENCE_HUNTER, seedReferenceData } from "./reference-data.ts";

const DESKTOP = { width: 1366, height: 800 };
const PHONE = { width: 390, height: 844 };
const SETTLE_SCREENSHOT_MS = 30_000;

interface ScreenCase {
  /** The name of its images. */
  name: string;
  screen: ReferenceScreen;
  user?: string | CloudUser;
  /** Not on the flyer: the app has no flyer to wait for. */
  noFlyer?: boolean;
  /** Where it opens with filters on top: one more image, scrolled to what the screen is for. */
  contentOn?: readonly AppearanceCase["name"][];
  /** The React version already has this screen, whole: its slice marks it when it arrives. */
  inReact?: boolean;
}

interface AppearanceCase extends Appearance {
  name: string;
  viewport: { width: number; height: number };
  touch: boolean;
}

const ADMIN = "admin";
const OFFICER = "officer";
const PHONE_ONLY = ["phone-light"];
const PHONE_AND_DESKTOP = ["phone-light", "desktop-light"];

const BENCHMARK_VIEWS: readonly ScreenCase[] = (
  [
    ["benchmark-summary", PHONE_AND_DESKTOP],
    ["benchmark-brands", PHONE_AND_DESKTOP],
    ["benchmark-week", PHONE_AND_DESKTOP],
    ["benchmark-merchant", PHONE_ONLY],
    ["benchmark-versus", PHONE_AND_DESKTOP],
    ["benchmark-cards", PHONE_AND_DESKTOP],
  ] as const
).map(([screen, contentOn]) => ({ name: screen, screen, user: ADMIN, contentOn }));

const SCREENS: readonly ScreenCase[] = [
  { name: "login", screen: "login", noFlyer: true, inReact: true },
  { name: "flyer-editor-advisor", screen: "flyer-editor", inReact: true },
  { name: "flyer-editor-admin", screen: "flyer-editor", user: ADMIN, inReact: true },
  { name: "preview-window", screen: "preview-window", inReact: true },
  { name: "logo-editor", screen: "logo-editor", inReact: true },
  { name: "logo-strip-window", screen: "logo-strip-window", inReact: true },
  { name: "promotions-active", screen: "promotions-active", contentOn: PHONE_ONLY, inReact: true },
  { name: "promotions-search", screen: "promotions-search", contentOn: PHONE_ONLY, inReact: true },
  { name: "studio", screen: "studio" },
  { name: "database-companies", screen: "database-companies", inReact: true },
  { name: "database-advisors", screen: "database-advisors", inReact: true },
  { name: "hunter", screen: "hunter", user: REFERENCE_HUNTER, noFlyer: true },
  {
    name: "commercial-actions-list",
    screen: "commercial-actions-list",
    user: OFFICER,
    noFlyer: true,
  },
  {
    name: "commercial-actions-agenda",
    screen: "commercial-actions-agenda",
    user: OFFICER,
    noFlyer: true,
  },
  {
    name: "commercial-actions-dashboard",
    screen: "commercial-actions-dashboard",
    user: OFFICER,
    noFlyer: true,
    contentOn: PHONE_AND_DESKTOP,
  },
  ...BENCHMARK_VIEWS,
  { name: "admin-dashboard", screen: "admin-dashboard", user: ADMIN },
  { name: "admin-users", screen: "admin-users", user: ADMIN },
  { name: "admin-permissions", screen: "admin-permissions", user: ADMIN },
  { name: "admin-flyer-config", screen: "admin-flyer-config", user: ADMIN },
  { name: "user-menu", screen: "user-menu", inReact: true },
  { name: "screen-search", screen: "screen-search" },
];

const MATRIX: readonly AppearanceCase[] = [
  { name: "desktop-light", viewport: DESKTOP, touch: false, dark: false, palette: "marfil" },
  { name: "desktop-dark", viewport: DESKTOP, touch: false, dark: true, palette: "marfil" },
  { name: "phone-light", viewport: PHONE, touch: true, dark: false, palette: "marfil" },
];

const FLYER_EDITOR = SCREENS.find(({ name }) => name === "flyer-editor-advisor");
const OTHER_PALETTES: readonly AppearanceCase[] = (["marino", "grafito", "cielo"] as const).map(
  (palette) => ({
    name: `desktop-${palette}`,
    viewport: DESKTOP,
    touch: false,
    dark: false,
    palette,
  }),
);

function optionsFor(screen: ScreenCase, appearance: AppearanceCase): OpenAppOptions {
  return {
    viewport: appearance.viewport,
    touch: appearance.touch,
    waitUntilReady: !screen.noFlyer,
    signedOut: screen.screen === "login",
    commercialActions: screen.user === OFFICER,
    ...(screen.user === undefined ? {} : { user: screen.user }),
  };
}

async function shoot(app: OpenedApp, screen: ScreenCase, appearance: AppearanceCase) {
  await app.screens.setAppearance(appearance);
  await app.screens.open(screen.screen);
  await expect.soft(app.page).toHaveScreenshot(`${screen.name}--${appearance.name}.png`, {
    timeout: SETTLE_SCREENSHOT_MS,
  });
  if (!screen.contentOn?.includes(appearance.name)) return;
  await app.screens.showContent(screen.screen);
  await expect.soft(app.page).toHaveScreenshot(`${screen.name}--${appearance.name}--content.png`, {
    timeout: SETTLE_SCREENSHOT_MS,
  });
}

function defineCase(screen: ScreenCase, appearance: AppearanceCase): void {
  const tag = screen.inReact ? ["@visual", "@react"] : ["@visual"];
  test(`${screen.name}: ${appearance.name}`, { tag }, async ({ cloud, openApp }) => {
    seedReferenceData(cloud);
    if (screen.user === REFERENCE_HUNTER) cloud.users.hunter = REFERENCE_HUNTER;
    await shoot(await openApp(optionsFor(screen, appearance)), screen, appearance);
  });
}

for (const screen of SCREENS) {
  for (const appearance of MATRIX) defineCase(screen, appearance);
}
if (FLYER_EDITOR) {
  for (const appearance of OTHER_PALETTES) defineCase(FLYER_EDITOR, appearance);
}
