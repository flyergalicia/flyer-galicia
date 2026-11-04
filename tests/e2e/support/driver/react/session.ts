import { type Locator, type Page } from "@playwright/test";
import {
  type AccountSwitcher,
  type AppScreen,
  type EntryView,
  type OpenSessionOptions,
  type SessionDriver,
} from "../session.ts";
import { partialDriver } from "./pending.ts";

const ENTRY_TIMEOUT_MS = 25_000;
const HOLD_TO_LIFT_MS = 4_200;
const TIME_PASSING_MS = 6 * 60_000;
const SUPABASE_REFRESH = "**/auth/v1/token*";

/** How a test recognizes a place: `data-screen` of the shell, for those that are a tab. */
const SCREENS: Readonly<Partial<Record<AppScreen, string>>> = {
  "flyer-editor": "flyer-layout",
  "flyer-layout": "flyer-layout",
  "hunter-screen": "hunter-screen",
  promotions: "promotions",
  benchmark: "benchmark",
  "commercial-actions": "commercial-actions",
  "my-database": "my-database",
};

function header(page: Page): Locator {
  return page.getByRole("banner");
}

function headerTab(page: Page, name: string): Locator {
  return header(page).getByRole("tab", { name, exact: false }).first();
}

function userMenuButton(page: Page): Locator {
  return header(page).getByRole("button", { name: /^Menú de / });
}

function userMenu(page: Page): Locator {
  return page.getByRole("menu", { name: "Tu cuenta" });
}

function card(page: Page): Locator {
  return page.getByTestId("entry-card");
}

/** The forms that are not showing stay in the page, hidden, with the same labels. */
function entryField(page: Page, label: string): Locator {
  return card(page).getByLabel(label, { exact: true }).locator("visible=true");
}

function submitButton(page: Page): Locator {
  return card(page).getByRole("button", { name: /^Ingres(ar|ando\.\.\.)$/ });
}

function passwordWindow(page: Page): Locator {
  return page.getByRole("dialog", { name: "Cambiar mi contraseña" });
}

async function textOf(locator: Locator): Promise<string> {
  return (await locator.textContent()) ?? "";
}

async function waitUntilSignedIn(page: Page): Promise<void> {
  await header(page).waitFor({ timeout: ENTRY_TIMEOUT_MS });
}

const FLYER_SETTLED_MS = 25_000;
/** The option that has a flyer in the simulated cloud. */
const DEFAULT_OPTION = 9;

/**
 * Whoever lands on the flyer editor is ready when it knows what to show: its flyer, or that it could
 * not arrive. Administrators land on an option of their own; everybody else, on the first they may
 * use. Whoever lands elsewhere has no flyer to wait for.
 */
async function waitForFlyer(page: Page, role: string, startOption: number | undefined) {
  const screen = page.locator('[data-screen="flyer-layout"]');
  if (!(await screen.isVisible())) return;
  const isSettled = () =>
    page.waitForFunction(
      () => {
        const slot = window["__flyerProbe"]?.flyerWorkspace?.().getState().slot;
        return Boolean(slot) && slot?.option !== null && !slot?.loading;
      },
      null,
      { timeout: FLYER_SETTLED_MS },
    );
  await isSettled();
  if (role !== "admin" && startOption === undefined) return;
  const option = page
    .getByTestId("flyer-options")
    .locator(`button[data-option="${String(startOption ?? DEFAULT_OPTION)}"]`);
  if ((await option.count()) === 0) return;
  await option.click();
  await isSettled();
}

async function open(
  page: Page,
  { role, startOption, waitUntilReady }: OpenSessionOptions,
): Promise<void> {
  await page.goto("./");
  if (!waitUntilReady) return;
  await waitUntilSignedIn(page);
  await waitForFlyer(page, role, startOption);
}

async function openUserMenu(page: Page): Promise<void> {
  if (await userMenu(page).isHidden()) await userMenuButton(page).click();
  await userMenu(page).waitFor();
}

async function closeUserMenu(page: Page): Promise<void> {
  if (await userMenu(page).isVisible()) await userMenuButton(page).click();
}

async function accountSwitcher(page: Page): Promise<AccountSwitcher | null> {
  await waitUntilSignedIn(page);
  const wasOpen = await userMenu(page).isVisible();
  await openUserMenu(page);
  const group = userMenu(page).getByRole("group", { name: "Cambiar de cuenta" });
  const offered = await group.isVisible();
  const accounts = offered
    ? await group.getByTestId("switchable-account").evaluateAll((rows) =>
        rows.map((row) => ({
          name: row.querySelector('[data-testid="switchable-name"]')?.textContent ?? "",
          profile: row.querySelector('[data-testid="switchable-profile"]')?.textContent ?? "",
        })),
      )
    : [];
  if (!wasOpen) await closeUserMenu(page);
  return offered ? { heading: "Cambiar de cuenta", accounts } : null;
}

async function entryView(page: Page): Promise<EntryView> {
  const entry = card(page);
  if (await entry.isHidden()) return "app";
  const shown: readonly [EntryView, Locator][] = [
    ["retry", entry.getByRole("alert")],
    ["entering", entry.getByRole("heading", { name: "Ingresando…" })],
    ["register", entry.getByRole("heading", { name: "Crear cuenta" })],
  ];
  for (const [view, mark] of shown) {
    if (await mark.isVisible()) return view;
  }
  return "login";
}

function createEntry(page: Page) {
  return {
    entryView: () => entryView(page),
    entryText: async () => (await card(page).innerText()).replace(/\s+/g, " "),
    pressRetryEntry: () => card(page).getByRole("button", { name: "Reintentar" }).click(),
    // The session is read from the browser, and it only goes to the network when it has expired:
    // this leaves it expired, and the network that would renew it does not answer.
    stallReadingTheSession: async () => {
      await page.route(SUPABASE_REFRESH, () => undefined);
      await page.evaluate(() => {
        for (const key of Object.keys(localStorage)) {
          if (!key.endsWith("-auth-token")) continue;
          const session: { expires_at?: number } = JSON.parse(localStorage.getItem(key) ?? "{}");
          session.expires_at = 1;
          localStorage.setItem(key, JSON.stringify(session));
        }
      });
    },
    signIn: async (email: string, password: string) => {
      await entryField(page, "Email").fill(email);
      await entryField(page, "Contraseña").fill(password);
      await submitButton(page).click();
    },
    signInButtonBusy: () => submitButton(page).isDisabled(),
    showRegisterForm: () => card(page).getByRole("button", { name: "Crear cuenta" }).click(),
    showForgottenPasswordForm: () =>
      card(page)
        .getByRole("button", { name: /Olvidaste tu contrase/ })
        .click(),
    submitForgottenPasswordForm: async ({
      email,
      password,
      repeat,
    }: Record<"email" | "password" | "repeat", string>) => {
      await entryField(page, "Email").fill(email);
      await entryField(page, "Nueva contraseña").fill(password);
      await entryField(page, "Repetir nueva contraseña").fill(repeat);
      await page.getByTestId("forgot-submit").click();
    },
    forgottenPasswordMessages: async () => ({
      error: await textOf(page.getByTestId("forgot-error")),
      ok: await textOf(page.getByTestId("forgot-ok")),
      locked: await page.getByTestId("forgot-submit").isDisabled(),
    }),
    submitRegisterForm: async ({
      name,
      email,
      password,
    }: Record<"name" | "email" | "password", string>) => {
      await entryField(page, "Nombre completo").fill(name);
      await entryField(page, "Email").fill(email);
      await entryField(page, "Contraseña").fill(password);
      await page.getByTestId("register-submit").click();
    },
    registerMessages: async () => ({
      error: await textOf(page.getByTestId("register-error")),
      ok: await textOf(page.getByTestId("register-ok")),
      passwordHint: (await entryField(page, "Contraseña").getAttribute("placeholder")) ?? "",
    }),
  };
}

function createHeader(page: Page) {
  return {
    headerTabs: () => header(page).getByRole("tab").allInnerTexts(),
    activeHeaderTab: async () =>
      (await header(page).getByRole("tab", { selected: true }).innerText()).trim(),
    headerTabBadge: async (name: string) => {
      const badge = headerTab(page, name).locator("i");
      return (await badge.count()) > 0 ? await textOf(badge) : "";
    },
    chooseHeaderTab: (name: string) => headerTab(page, name).click(),
    dragHeaderTab: async (name: string, ontoTab: string) => {
      const from = await headerTab(page, name).boundingBox();
      const to = await headerTab(page, ontoTab).boundingBox();
      if (!from || !to) throw new Error("The tabs are not on screen");
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(HOLD_TO_LIFT_MS);
      await page.mouse.move(to.x + 2, to.y + to.height / 2, { steps: 8 });
      await page.mouse.up();
    },
    // Time passes and the person comes back to the tab, which is when the app looks again.
    checkForNewVersion: () =>
      page.evaluate((ahead) => {
        const Earlier = Date;
        globalThis.Date = new Proxy(Earlier, {
          construct: (target, args: unknown[], newTarget: new () => object): object =>
            Reflect.construct(target, args.length > 0 ? args : [target.now() + ahead], newTarget),
          get: (target, key) =>
            key === "now" ? () => target.now() + ahead : (Reflect.get(target, key) as unknown),
        });
        document.dispatchEvent(new Event("visibilitychange"));
      }, TIME_PASSING_MS),
    newVersionNotice: async () => {
      const notice = page.getByTestId("new-version");
      return (await notice.count()) > 0 ? await textOf(notice) : "";
    },
    headerFit: () =>
      header(page).evaluate((element) => {
        const button = element.querySelector('[aria-label="Buscar una pantalla o función"]');
        return {
          contentWidth: element.scrollWidth,
          visibleWidth: element.clientWidth,
          searchButtonRight: button?.getBoundingClientRect().right ?? 0,
          windowWidth: window.innerWidth,
        };
      }),
    headerLook: () =>
      header(page).evaluate((element) => {
        const logo = element.querySelector("svg")?.getBoundingClientRect();
        const title = element.querySelector<HTMLElement>('[aria-selected="true"] span');
        return {
          logoWidth: Math.round(logo?.width ?? 0),
          logoHeight: Math.round(logo?.height ?? 0),
          title: title?.innerText ?? "",
          titleFits: Boolean(title) && (title?.scrollWidth ?? 0) <= (title?.clientWidth ?? 0) + 1,
          fitsTheWindow: element.getBoundingClientRect().right <= window.innerWidth + 1,
        };
      }),
    adminButtonOffered: () => header(page).getByRole("button", { name: /Admin/ }).isVisible(),
    documentFit: () =>
      page.evaluate(() => {
        const screen = document.querySelector('[data-screen="flyer-layout"]');
        const panel = screen?.querySelector<HTMLElement>("[data-scrolling-panel]");
        const root = document.scrollingElement ?? document.documentElement;
        return {
          windowHeight: window.innerHeight,
          documentScrolls: root.scrollHeight > window.innerHeight + 1,
          editorHeight: Math.round(screen?.getBoundingClientRect().height ?? 0),
          panelScrollsInside:
            panel !== null &&
            panel !== undefined &&
            getComputedStyle(panel).overflowY === "auto" &&
            panel.scrollHeight > panel.clientHeight,
          headerHeight: Math.round(
            document.querySelector("header")?.getBoundingClientRect().height ?? 0,
          ),
        };
      }),
  };
}

function createNotices(page: Page) {
  const notices = page.getByRole("status").and(page.locator('[data-visible="true"]'));
  return {
    noticesOnScreen: () => notices.count(),
    noticeVisible: async () => (await notices.count()) > 0,
  };
}

function createWindows(page: Page) {
  return {
    openPasswordWindow: async () => {
      await openUserMenu(page);
      await userMenu(page).getByRole("menuitem", { name: "Cambiar mi clave" }).click();
      // It takes the focus a moment after opening: what is written before lands elsewhere.
      await passwordWindow(page).locator("input:focus").waitFor();
    },
    passwordWindowOpen: () => passwordWindow(page).isVisible(),
    closePasswordWindow: () =>
      passwordWindow(page).getByRole("button", { name: "Cancelar" }).click(),
    submitPasswordWindow: async ({
      current,
      password,
      repeat,
    }: Record<"current" | "password" | "repeat", string>) => {
      await passwordWindow(page).getByLabel("Contraseña actual").fill(current);
      await passwordWindow(page).getByLabel("Nueva contraseña", { exact: true }).fill(password);
      await passwordWindow(page).getByLabel("Repetir nueva contraseña").fill(repeat);
      await page.getByTestId("password-submit").click();
    },
    passwordWindowMessages: async () => ({
      error: await textOf(page.getByTestId("password-error")),
      ok: await textOf(page.getByTestId("password-ok")),
      locked: await page.getByTestId("password-submit").isDisabled(),
    }),
    openNotes: async () => {
      await openUserMenu(page);
      await userMenu(page).getByRole("menuitem", { name: "Bloc de notas" }).click();
      await page.getByRole("dialog", { name: /Bloc de notas/ }).waitFor();
    },
    notesOpen: () => page.getByRole("dialog", { name: /Bloc de notas/ }).isVisible(),
    waitForConfirmation: async () => {
      const window = page.getByRole("alertdialog");
      await window.waitFor({ timeout: ENTRY_TIMEOUT_MS });
      return textOf(window);
    },
    answerConfirmation: async (goAhead: boolean) => {
      const window = page.getByRole("alertdialog");
      await window
        .getByRole("button")
        .nth(goAhead ? 1 : 0)
        .click();
      await window.waitFor({ state: "detached" });
    },
    confirmationOpen: () => page.getByRole("alertdialog").isVisible(),
  };
}

function createReading(page: Page) {
  return {
    smallestTexts: (limit: number) =>
      page.evaluate((count) => {
        const seen: { text: string; size: number; upperCase: boolean }[] = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const text = node.textContent?.trim() ?? "";
          const element = node.parentElement;
          if (text.length < 2 || !element || !/[A-Za-z0-9]/.test(text)) continue;
          const box = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          if (box.width === 0 || box.height === 0 || style.visibility === "hidden") continue;
          seen.push({
            text: text.slice(0, 40),
            size: Number.parseFloat(style.fontSize),
            upperCase: style.textTransform === "uppercase" || text === text.toUpperCase(),
          });
        }
        return seen.toSorted((a, b) => a.size - b.size).slice(0, count);
      }, limit),
    fontFamiliesOnScreen: () =>
      page.evaluate(() => {
        const families = new Set<string>();
        for (const element of document.querySelectorAll<HTMLElement>("body, body *")) {
          if (element.getClientRects().length === 0 || !element.childNodes.length) continue;
          const hasText = Array.from(element.childNodes).some(
            (child) => child.nodeType === Node.TEXT_NODE && child.textContent?.trim(),
          );
          if (hasText) families.add(getComputedStyle(element).fontFamily);
        }
        return [...families];
      }),
    visibleText: () => page.locator("body").innerText(),
    databaseHelp: async () => {
      await openUserMenu(page);
      await userMenu(page).getByRole("menuitem", { name: "Base de datos" }).click();
      const database = page.locator('[data-screen="my-database"]');
      await database.waitFor();
      const help = await database.evaluate((element) => {
        const sections = Array.from(element.querySelectorAll("details"));
        const upload = Array.from(element.querySelectorAll("button")).find((button) =>
          /Subir Excel/.test(button.textContent),
        );
        const title = element.closest("dialog")?.querySelector("h2");
        return {
          sections: sections.length,
          allClosed: sections.every((section) => !section.open),
          uploadButtonBelowTitle: upload
            ? Math.round(upload.getBoundingClientRect().top) -
              Math.round(title?.getBoundingClientRect().top ?? 0)
            : null,
        };
      });
      await page
        .getByRole("dialog", { name: /Base de datos/ })
        .getByLabel("Cerrar")
        .click();
      return help;
    },
    browserStorage: () =>
      page.evaluate(() =>
        Object.fromEntries(
          Object.keys(localStorage)
            .filter((key) => key.startsWith("fg_"))
            .map((key) => [key, localStorage.getItem(key) ?? ""]),
        ),
      ),
  };
}

/** What exists so far: the flyer editor and the others fill in the rest when they arrive. */
export function createReactSessionDriver(page: Page): SessionDriver {
  return partialDriver<SessionDriver>("session", {
    ...createEntry(page),
    ...createHeader(page),
    ...createNotices(page),
    ...createWindows(page),
    ...createReading(page),
    open: (options) => open(page, options),
    status: async () => {
      const isInside = await header(page).isVisible();
      const entry = await entryView(page);
      return {
        signedIn: isInside,
        loginScreenVisible: !isInside,
        stillEntering: !isInside || entry === "entering",
      };
    },
    waitUntilSignedIn: () => waitUntilSignedIn(page),
    logoEditorOpens: async () => {
      const toggle = page
        .getByTestId("logo-editor-bar")
        .getByRole("button", { name: /^(Cambiar logos|Listo)$/ });
      await toggle.click();
      const opened = await page.evaluate(
        () => window["__flyerProbe"]?.logoEditor?.().isEditing() ?? false,
      );
      if (opened) await toggle.click();
      return opened;
    },
    previewPainted: () =>
      page.evaluate(() => (window["__flyerProbe"]?.flyerWorkspace?.().getState().draws ?? 0) > 0),
    accountSwitcher: () => accountSwitcher(page),
    switchToAccount: async (name) => {
      await openUserMenu(page);
      await userMenu(page).getByTestId("switchable-account").filter({ hasText: name }).click();
    },
    browserStoresOtherAccounts: () =>
      page.evaluate(() => Boolean(localStorage.getItem("fg_cuentas_prueba"))),
    openUserMenu: () => openUserMenu(page),
    userMenuItems: async () => {
      await openUserMenu(page);
      return (await userMenu(page).getByRole("menuitem").allInnerTexts()).map((text) =>
        text.replace(/\s+/g, " ").trim(),
      );
    },
    chooseFromUserMenu: async (label) => {
      await openUserMenu(page);
      await userMenu(page).getByRole("menuitem", { name: label }).first().click();
    },
    closeUserMenu: () => closeUserMenu(page),
    isShowing: async (screen) => {
      const place = SCREENS[screen];
      if (place === undefined) {
        throw new Error(`"${screen}" is not in the React driver yet: it arrives with its slice.`);
      }
      return page.locator(`[data-screen="${place}"]`).isVisible();
    },
    isDarkMode: () => page.evaluate(() => document.documentElement.classList.contains("dark")),
    toggleDarkMode: async () => {
      await openUserMenu(page);
      await userMenu(page)
        .getByRole("menuitem", { name: /^Modo (oscuro|claro)$/ })
        .click();
      await closeUserMenu(page);
    },
  });
}
