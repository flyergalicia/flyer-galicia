import { type Locator, type Page } from "@playwright/test";
import {
  type AccountSwitcher,
  type AppScreen,
  type EntryView,
  type OpenSessionOptions,
  type SessionDriver,
} from "../session.ts";
import { companyField } from "./flyer-output.ts";
import { goToOption } from "./flyer-editor.ts";
import { holdBatch } from "./flyer-batches.ts";
import { partialDriver } from "./pending.ts";
import { createReactPromotionsDriver } from "./promotions.ts";

const ENTRY_TIMEOUT_MS = 25_000;
const WINDOWS_TO_CLOSE = 4;
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

/** The places inside a screen or a window: a panel of the editor, a solapa, a sheet of the panel. */
function innerPlace(page: Page, screen: AppScreen): Locator | null {
  const editor = page.locator('[data-screen="flyer-layout"]');
  const sheet = (id: string) => page.getByTestId("admin-panel").locator(`[data-sheet="${id}"]`);
  const places: Partial<Record<AppScreen, Locator>> = {
    "flyer-individual": editor.getByRole("tabpanel", { name: "Individual" }),
    "flyer-bulk": editor.getByRole("tabpanel", { name: "Masivo" }),
    "flyer-history": editor.getByRole("tabpanel", { name: "Historial" }),
    "promotions-active": page
      .locator('[data-screen="promotions"]')
      .getByRole("tab", { name: "Activas", selected: true }),
    "admin-audit": sheet("auditoria"),
    "admin-legal": sheet("legales"),
  };
  return places[screen] ?? null;
}

/** The tools of Cambiar logos on, by the names the specs give them. */
const LOGO_TOOLS: readonly (readonly [string, string])[] = [
  ["strip", "strip"],
  ["trim", "crop"],
  ["insert", "insert"],
];

/** The internal names the specs give the two solapas of Promociones. */
const PROMOTIONS_TABS: Readonly<Record<string, string>> = { Buscar: "buscar", Activas: "activas" };

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
  // On a phone it has no height until its code arrives: it is there, and not hidden.
  const screen = page.locator('[data-screen="flyer-layout"]:not([hidden])');
  if ((await screen.count()) === 0) return;
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
  await goToOption(page, startOption ?? DEFAULT_OPTION);
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
    adminButtonOffered: () =>
      header(page)
        .getByRole("button", { name: /^⚙ Admin/ })
        .isVisible(),
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

const PILL_DOWNLOAD_TIMEOUT_MS = 30_000;
const HINT_TIMEOUT_MS = 3_000;

function createFlyerLook(page: Page) {
  const downloadButton = () => page.getByTestId("download-pdf");
  return {
    disabledDownloadButtonOpacity: () =>
      downloadButton().evaluate((element) => {
        if (!(element instanceof HTMLButtonElement)) throw new Error("It is not a button");
        element.disabled = true;
        const { opacity } = getComputedStyle(element);
        element.disabled = false;
        return Number(opacity);
      }),
    // What it would be called is on the screen, under the field of the name.
    downloadFileName: async (pattern: string, values: Record<string, string>) => {
      await companyField(page).fill(values.empresa ?? "");
      await page.locator('[data-officer-field="nombre1"]').fill(values.nombre ?? "");
      await page.getByTestId("file-name").fill(pattern);
      const preview = await page.getByTestId("file-name-preview").innerText();
      return preview.replace(/^→\s*/, "").replace(/\.pdf$/, "");
    },
    downloadDock: () =>
      page.evaluate(() => {
        const dock = document.querySelector('[data-testid="flyer-dock"]');
        if (!dock || dock.getClientRects().length === 0) {
          return { buttons: [], stuckToBottom: false };
        }
        const panel = document.querySelector("[data-scrolling-panel]");
        if (panel) panel.scrollTop = 0;
        const bottom = panel?.getBoundingClientRect().bottom ?? 0;
        return {
          buttons: Array.from(dock.querySelectorAll<HTMLElement>("button")).flatMap((button) =>
            button.offsetParent ? [button.innerText.trim().replace(/\s+/g, " ")] : [],
          ),
          stuckToBottom: Math.abs(dock.getBoundingClientRect().bottom - bottom) < 24,
        };
      }),
    moveAlongEditorTabs: async (key: "ArrowRight" | "ArrowLeft") => {
      const tabs = page.getByRole("tablist", { name: "Modo de armado" });
      await tabs.getByRole("tab", { selected: true }).focus();
      await page.keyboard.press(key);
      return (await tabs.getByRole("tab", { selected: true }).innerText()).trim();
    },
    selectedEditorTab: async () =>
      (
        await page
          .getByRole("tablist", { name: "Modo de armado" })
          .getByRole("tab", { selected: true })
          .innerText()
      ).trim(),
    chosenCashbackButtonColors: () =>
      page
        .locator('[data-cashback][aria-pressed="true"]')
        .first()
        .evaluate((button) => {
          const style = getComputedStyle(button);
          return { text: style.color, background: style.backgroundColor };
        }),
    downloadButtonHint: async () => {
      await downloadButton().hover();
      const hint = page.getByRole("tooltip");
      await hint.waitFor({ timeout: HINT_TIMEOUT_MS });
      return (await hint.textContent()) ?? "";
    },
    cashbackCardTitle: async () =>
      (await page
        .locator("[data-scrolling-panel]")
        .getByText(/Configuraci.n de Montos/)
        .first()
        .textContent()) ?? "",
    selectedFlyerColors: () =>
      page
        .getByTestId("flyer-options")
        .locator('button[aria-pressed="true"]')
        .evaluate((option) => {
          const style = getComputedStyle(option);
          return { text: style.color, background: style.backgroundColor };
        }),
    promotionLogoBackground: async () => {
      const promotions = createReactPromotionsDriver(page);
      await promotions.open("active");
      await promotions.chooseProvince("promotions", "BUENOS AIRES");
      await promotions.listActive();
      return page
        .getByTestId("promotions-results")
        .locator("tbody img")
        .first()
        .evaluate((logo) => getComputedStyle(logo).backgroundColor);
    },
    activePromotionsHeader: async () => ({
      counters: await page.getByTestId("status-counter").allInnerTexts(),
      firstSortOption: await page
        .getByRole("combobox", { name: "Ordenar por" })
        .locator("option")
        .first()
        .innerText(),
    }),
    promotionsTableFit: () =>
      page.getByTestId("promotions-results").evaluate((results) => {
        const table = results.querySelector("table");
        const row = table?.querySelector("tbody tr");
        const status = row?.querySelector("[data-part='status']")?.getBoundingClientRect();
        const screenWidth = document.documentElement.clientWidth;
        return {
          tableWidth: Math.round(table?.getBoundingClientRect().width ?? 0),
          screenWidth,
          rowDisplay: row ? getComputedStyle(row).display : "",
          statusInsideTheScreen:
            Boolean(status) && (status?.right ?? 0) <= screenWidth && (status?.width ?? 0) > 0,
        };
      }),
    // A person sees it and touches it, and the file comes out with the locks of the button.
    pressPhoneDownloadPill: async () => {
      const pill = page.getByTestId("phone-pill").getByRole("button", { name: "Descargar PDF" });
      const visible = await pill.isVisible();
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: PILL_DOWNLOAD_TIMEOUT_MS }).catch(() => null),
        pill.click(),
      ]);
      return {
        visible,
        pressesOfTheDownloadButton: download ? 1 : 0,
        staysMarked: (await pill.getAttribute("aria-pressed")) === "true",
      };
    },
  };
}

/** Any window open, closed as a person does: with Escape, the top one first. */
async function closeWindows(page: Page): Promise<void> {
  const windows = page.locator(
    '[role="alertdialog"], dialog[open][aria-modal="true"]:not([data-screen-window])',
  );
  for (let left = WINDOWS_TO_CLOSE; left > 0 && (await windows.count()) > 0; left -= 1) {
    await page.keyboard.press("Escape");
  }
}

function createPlaces(page: Page) {
  return {
    modes: () =>
      page.evaluate(
        ({ logoTools, promotionsTabs }) => {
          const editor = window["__flyerProbe"]?.logoEditor?.();
          const mode = editor?.mode() ?? "none";
          const tools = [
            ...(editor?.clean() ? ["preview"] : []),
            ...logoTools.filter(([name]) => name === mode).map(([, tool]) => tool),
          ];
          const promotions = document.querySelector(
            '[data-screen="promotions"] [role="tab"][aria-selected="true"]',
          );
          const commercial = document.querySelector(
            '[data-testid="commercial-tabs"] [aria-selected="true"]',
          );
          return {
            logoEditing: Boolean(editor?.isEditing()),
            logoTools: tools,
            promotionsTab: promotionsTabs[promotions?.textContent?.trim() ?? ""] ?? "buscar",
            commercialActionsTab: commercial?.getAttribute("data-tab") ?? null,
          };
        },
        { logoTools: LOGO_TOOLS, promotionsTabs: PROMOTIONS_TABS },
      ),
    focusCompanyField: () => companyField(page).focus(),
    companyFieldHasFocus: () =>
      companyField(page).evaluate((field) => field === document.activeElement),
    // An advisor has no confirmation at hand: the shortest window a person opens is Vista previa.
    showConfirmation: async () => {
      // The one of the form: on a phone the pill has another, that only shows the flyer.
      const preview = page
        .locator("[data-scrolling-panel]")
        .getByRole("button", { name: "Vista previa", exact: true })
        .locator("visible=true")
        .first();
      if (!(await preview.isVisible())) {
        await page
          .getByRole("tablist", { name: "Modo de armado" })
          .getByRole("tab", { name: "Individual" })
          .click();
      }
      await preview.click();
      await page.getByRole("dialog", { name: "Vista previa" }).waitFor();
    },
    removeConfirmations: () => closeWindows(page),
    /** The first flyer of the bar that is not on screen, as the bar shows it. */
    anotherAvailableFlyer: () =>
      page
        .getByTestId("flyer-options")
        .locator("button[data-option]")
        .evaluateAll((buttons) => {
          const other = buttons.find((button) => button.getAttribute("aria-pressed") !== "true");
          if (!other) return null;
          return {
            option: Number(other.getAttribute("data-option")),
            name: other.textContent?.trim() ?? "",
          };
        }),
    currentFlyerOption: () =>
      page.evaluate(() => window["__flyerProbe"]?.flyerWorkspace?.().getState().slot.option ?? 0),
  };
}

/** What exists so far: the flyer editor and the others fill in the rest when they arrive. */
export function createReactSessionDriver(page: Page): SessionDriver {
  /** A person cannot pretend: a real batch stays waiting, and letting it go lets it end. */
  let release: (() => Promise<void>) | null = null;
  return partialDriver<SessionDriver>("session", {
    pretendBatchRunning: async (running) => {
      if (running) release = await holdBatch(page);
      else await release?.();
    },
    ...createEntry(page),
    ...createHeader(page),
    ...createNotices(page),
    ...createWindows(page),
    ...createReading(page),
    ...createFlyerLook(page),
    open: (options) => open(page, options),
    reload: async (option = DEFAULT_OPTION) => {
      await page.reload();
      await waitUntilSignedIn(page);
      await waitForFlyer(page, "admin", option);
    },
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
      const inner = innerPlace(page, screen);
      if (inner) return inner.isVisible();
      const place = SCREENS[screen];
      if (place === undefined) {
        throw new Error(`"${screen}" is not in the React driver yet: it arrives with its slice.`);
      }
      return page.locator(`[data-screen="${place}"]`).isVisible();
    },
    ...createPlaces(page),
    waitForCommercialActions: async () => {
      await headerTab(page, "Gestiones").waitFor({ timeout: ENTRY_TIMEOUT_MS });
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
