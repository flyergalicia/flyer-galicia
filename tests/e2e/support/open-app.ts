import { type Browser, type BrowserContext, type Page } from "@playwright/test";
import { AUTH_STORAGE_KEY, type Cloud, type CloudUser, storedSession } from "./cloud/index.ts";
import { moveClock } from "./clock.ts";
import { type AppDriver, createAppDriver } from "./driver/app-driver.ts";
import { installLogoRoute } from "./logos.ts";
import { type AppTarget } from "./target.ts";

const DEFAULT_VIEWPORT = { width: 1366, height: 800 };

export interface OpenAppOptions {
  /** A key of cloud.users (asesor, admin, hunter...) or a whole user. By default, asesor. */
  user?: string | CloudUser;
  viewport?: { width: number; height: number };
  /** A phone: touch screen and mobile layout. */
  touch?: boolean;
  /** Extra localStorage keys the page finds when it loads. */
  localStorage?: Record<string, string>;
  /** Runs before navigating: routes installed here win over the simulated cloud. */
  beforeNavigation?: (page: Page) => Promise<void>;
  /** False returns while the app is still entering, without waiting for a flyer. */
  waitUntilReady?: boolean;
  /** The flyer option to end up in. */
  startOption?: number;
  /** Serve this browser the tables and functions of commercial actions. */
  commercialActions?: boolean;
  /** For a test that expects an uncaught error: by default any of them fails the test. */
  allowPageErrors?: boolean;
}

/** An opened app: the driver plus what only the harness knows about this browser. */
export interface OpenedApp extends AppDriver {
  close(): Promise<void>;
  /** Uncaught errors so far. */
  pageErrors(): readonly string[];
  consoleErrors(): readonly string[];
  /** Native dialogs so far; they are dismissed as soon as they appear. */
  dialogs(): readonly string[];
}

export interface LaunchInputs {
  browser: Browser;
  cloud: Cloud;
  target: AppTarget;
  baseURL: string | undefined;
  clockOffset: number;
  options: OpenAppOptions;
}

export interface LaunchedApp {
  app: OpenedApp;
  context: BrowserContext;
  allowPageErrors: boolean;
}

function resolveUser(cloud: Cloud, user: string | CloudUser = "asesor"): CloudUser {
  if (typeof user !== "string") return user;
  const found = cloud.users[user];
  if (!found) throw new Error(`The simulated cloud has no user "${user}"`);
  return found;
}

function seedLocalStorage(session: [string, string, Record<string, string>]): void {
  const [key, value, extra] = session;
  try {
    localStorage.clear();
    localStorage.setItem(key, value);
    for (const [name, content] of Object.entries(extra)) localStorage.setItem(name, content);
  } catch {
    // Pages such as about:blank have no localStorage to seed.
  }
}

export async function launchApp(inputs: LaunchInputs): Promise<LaunchedApp> {
  const { browser, cloud, target, baseURL, clockOffset, options } = inputs;
  const user = resolveUser(cloud, options.user);
  const context = await browser.newContext({
    ...(baseURL === undefined ? {} : { baseURL }),
    viewport: options.viewport ?? DEFAULT_VIEWPORT,
    acceptDownloads: true,
    hasTouch: Boolean(options.touch),
    isMobile: Boolean(options.touch),
  });
  await context.addInitScript(moveClock, clockOffset);
  await installLogoRoute(context);
  await cloud.attach(context, user, { commercialActions: Boolean(options.commercialActions) });

  const page = await context.newPage();
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const dialogs: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("dialog", (dialog) => {
    dialogs.push(`${dialog.type()}: ${dialog.message()}`);
    dialog.dismiss().catch(() => undefined);
  });
  await page.addInitScript(seedLocalStorage, [
    AUTH_STORAGE_KEY,
    storedSession(user),
    options.localStorage ?? {},
  ] satisfies [string, string, Record<string, string>]);
  await options.beforeNavigation?.(page);

  const driver = createAppDriver(page, target);
  await driver.session.open({
    role: user.role,
    waitUntilReady: options.waitUntilReady ?? true,
    ...(options.startOption === undefined ? {} : { startOption: options.startOption }),
  });
  return {
    context,
    allowPageErrors: Boolean(options.allowPageErrors),
    app: {
      ...driver,
      close: () => context.close(),
      pageErrors: () => pageErrors,
      consoleErrors: () => consoleErrors,
      dialogs: () => dialogs,
    },
  };
}
