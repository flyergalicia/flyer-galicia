import { env } from "node:process";
import { defineConfig, devices } from "@playwright/test";

const PREVIEW_PORT = 8766;
// Same path GitHub Pages publishes the site under.
const PUBLISHED_PATH = "/flyer-galicia/";
const isCi = Boolean(env.CI);

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: isCi,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${PREVIEW_PORT}${PUBLISHED_PATH}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run preview -- --base ${PUBLISHED_PATH}`,
    url: `http://127.0.0.1:${PREVIEW_PORT}${PUBLISHED_PATH}`,
    reuseExistingServer: false,
  },
});
