import { argv, env } from "node:process";
import { defineConfig, devices } from "@playwright/test";
import { overlayScrollbarsLaunch } from "./tests/e2e/support/browser/overlay-scrollbars.ts";
import { type StorybookOption } from "./tests/e2e/support/storybook.ts";

const APP_PORT = 8766;
const STORYBOOK_PORT = 8768;
// Same path GitHub Pages publishes the site under.
const PUBLISHED_PATH = "/flyer-galicia/";
const isCi = Boolean(env.CI);

// `npm run release` first: the app is tested as the root holds it, which is what Pages publishes,
// and under the same path. FLYER_STATIC_ROOT serves another folder instead, such as a copy of the
// root with a rule broken on purpose.
const APP_SERVER = {
  command: `node scripts/serve-static.ts --port ${APP_PORT}`,
  env: { FLYER_STATIC_ROOT: env.FLYER_STATIC_ROOT ?? ".", FLYER_BASE_PATH: PUBLISHED_PATH },
  url: `http://127.0.0.1:${APP_PORT}${PUBLISHED_PATH}`,
  reuseExistingServer: false,
};

// `npm run storybook:build` first: this serves what it left there.
const STORYBOOK_SERVER = {
  command: `node scripts/serve-static.ts --port ${STORYBOOK_PORT}`,
  env: { FLYER_STATIC_ROOT: "storybook-static" },
  url: `http://127.0.0.1:${STORYBOOK_PORT}/index.json`,
  reuseExistingServer: false,
};

/** Asked with --project, only that project's server starts. */
function asksOnlyFor(project: string): boolean {
  const asked = argv.flatMap((argument, index) => {
    if (argument === "--project") return [argv[index + 1]];
    return argument.startsWith("--project=") ? [argument.slice("--project=".length)] : [];
  });
  return asked.length > 0 && asked.every((name) => name === project);
}

function webServers() {
  if (asksOnlyFor("app")) return [APP_SERVER];
  if (asksOnlyFor("design-system")) return [STORYBOOK_SERVER];
  if (asksOnlyFor("flyer-engine")) return [STORYBOOK_SERVER];
  return [APP_SERVER, STORYBOOK_SERVER];
}

export default defineConfig<StorybookOption>({
  testDir: "tests/e2e/specs",
  fullyParallel: true,
  forbidOnly: isCi,
  retries: 0,
  workers: 4,
  timeout: 120_000,
  reporter: "list",
  globalSetup: "./tests/e2e/support/cloud/contract-setup.ts",
  globalTeardown: "./tests/e2e/support/cloud/contract-teardown.ts",
  // Screenshot and flyer baselines depend on the platform, so CI does not compare them.
  ...(isCi ? { grepInvert: /@visual|@golden/ } : {}),
  // No project in the path: the app is compared against the images taken of the old one.
  snapshotPathTemplate: "tests/fixtures/visual/{platform}/{arg}{ext}",
  expect: {
    toHaveScreenshot: {
      // The threshold of each pixel stays at its default: below it, on macOS, a screen differs from
      // itself by up to 0.3% of its pixels on the edges of letters from one run to another.
      maxDiffPixelRatio: 0.001,
      animations: "disabled",
      caret: "hide",
    },
  },
  use: {
    trace: "retain-on-failure",
    launchOptions: overlayScrollbarsLaunch(),
  },
  projects: [
    {
      name: "app",
      testIgnore: ["**/specs/design-system/**", "**/specs/flyer-engine/**"],
      use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://127.0.0.1:${APP_PORT}${PUBLISHED_PATH}`,
      },
    },
    {
      // The engine against the printed flyer stored from the old app.
      name: "flyer-engine",
      testMatch: "**/specs/flyer-engine/**",
      use: {
        ...devices["Desktop Chrome"],
        storybookUrl: `http://127.0.0.1:${STORYBOOK_PORT}/`,
      },
    },
    {
      // shared against what was frozen from the old app in tests/fixtures/design-system/: the
      // tokens and the look of each component; and against the recorded network contract.
      name: "design-system",
      testMatch: "**/specs/design-system/**",
      use: {
        ...devices["Desktop Chrome"],
        storybookUrl: `http://127.0.0.1:${STORYBOOK_PORT}/`,
      },
    },
  ],
  webServer: webServers(),
});
