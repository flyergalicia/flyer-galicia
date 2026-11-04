import { argv, env } from "node:process";
import { defineConfig, devices } from "@playwright/test";
import { type TargetOption } from "./tests/e2e/support/target.ts";

const LEGACY_PORT = Number(env.FLYER_LEGACY_PORT ?? 8767);
const PREVIEW_PORT = 8766;
// Same path GitHub Pages publishes the site under.
const PUBLISHED_PATH = "/flyer-galicia/";
const isCi = Boolean(env.CI);

const LEGACY_SERVER = {
  command: `node scripts/serve-static.ts --port ${LEGACY_PORT}`,
  url: `http://127.0.0.1:${LEGACY_PORT}/index.html`,
  reuseExistingServer: false,
};
const PREVIEW_SERVER = {
  command: `npm run preview -- --base ${PUBLISHED_PATH}`,
  url: `http://127.0.0.1:${PREVIEW_PORT}${PUBLISHED_PATH}`,
  reuseExistingServer: false,
};

/** Asked with --project, only that project's server starts: `legacy` runs without a build. */
function asksOnlyFor(project: string): boolean {
  const asked = argv.flatMap((argument, index) => {
    if (argument === "--project") return [argv[index + 1]];
    return argument.startsWith("--project=") ? [argument.slice("--project=".length)] : [];
  });
  return asked.length > 0 && asked.every((name) => name === project);
}

function webServers() {
  if (asksOnlyFor("legacy")) return [LEGACY_SERVER];
  if (asksOnlyFor("react")) return [PREVIEW_SERVER];
  return [LEGACY_SERVER, PREVIEW_SERVER];
}

export default defineConfig<TargetOption>({
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
  // No project in the path: the React app is compared against the images of the current app.
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
  },
  projects: [
    {
      name: "legacy",
      testIgnore: "**/specs/build/**",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://127.0.0.1:${LEGACY_PORT}/`,
        target: "legacy",
      },
    },
    {
      name: "react",
      grep: /@react/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://127.0.0.1:${PREVIEW_PORT}${PUBLISHED_PATH}`,
        target: "react",
      },
    },
  ],
  webServer: webServers(),
});
