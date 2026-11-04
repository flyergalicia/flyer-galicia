import { expect, test as base } from "@playwright/test";
import { restartClock } from "./clock.ts";
import { appendContractPart, isRecordingContract } from "./cloud/contract-store.ts";
import { type Cloud, createCloud } from "./cloud/index.ts";
import { type StorybookOption, type TargetOption } from "./target.ts";
import { launchApp, type LaunchedApp, type OpenAppOptions, type OpenedApp } from "./open-app.ts";

interface HarnessFixtures {
  /** Same offset for this worker and for every browser of the test. */
  clockOffset: number;
  /** The simulated Supabase of this test, shared by all the browsers it opens. */
  cloud: Cloud;
  /** Opens the app in a new browser context on that cloud. Call it again for another user. */
  openApp: (options?: OpenAppOptions) => Promise<OpenedApp>;
}

function browserLog({ app }: LaunchedApp): string {
  return [
    ...app.pageErrors().map((text) => `pageerror: ${text}`),
    ...app.consoleErrors().map((text) => `console: ${text}`),
    ...app.dialogs().map((text) => `dialog: ${text}`),
  ].join("\n");
}

export const test = base.extend<HarnessFixtures & TargetOption & StorybookOption>({
  target: ["legacy", { option: true }],
  storybookUrl: ["", { option: true }],
  clockOffset: [
    // oxlint-disable-next-line no-empty-pattern -- Playwright requires a destructuring pattern
    async ({}, use) => {
      await use(restartClock());
    },
    { auto: true },
  ],
  cloud: async ({ clockOffset: _clockOffset }, use, testInfo) => {
    const cloud = createCloud();
    await use(cloud);
    if (isRecordingContract()) {
      appendContractPart(testInfo.workerIndex, cloud.contractEntries());
    }
  },
  openApp: async ({ browser, cloud, target, baseURL, clockOffset }, use, testInfo) => {
    const launched: LaunchedApp[] = [];
    await use(async (options = {}) => {
      const opened = await launchApp({ browser, cloud, target, baseURL, clockOffset, options });
      launched.push(opened);
      return opened.app;
    });
    for (const opened of launched) {
      await opened.context.close();
      const log = browserLog(opened);
      if (log && testInfo.status !== testInfo.expectedStatus) {
        await testInfo.attach("browser-log", { body: log, contentType: "text/plain" });
      }
    }
    const uncaught = launched
      .filter((opened) => !opened.allowPageErrors)
      .flatMap((opened) => opened.app.pageErrors());
    expect(uncaught, "uncaught errors in the page").toEqual([]);
  },
});

export { expect };
