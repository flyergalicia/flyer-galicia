import { type Page } from "@playwright/test";
import {
  type AccountSwitcher,
  type AppScreen,
  type EntryView,
  type OpenSessionOptions,
  type PromotionsTableFit,
  type SessionDriver,
} from "../session.ts";

const ENTRY_TIMEOUT_MS = 25_000;
const LEGACY_DEFAULT_OPTION = 9;
const COMPANY_FIELD = "#empresa";
const DOWNLOAD_BUTTON = "#btn-dl-pdf";
const HOLD_TO_LIFT_MS = 4_200;

const SCREENS: Readonly<Record<AppScreen, string>> = {
  "flyer-editor": "body.en-armador",
  "hunter-screen": "#view-hunter",
  "flyer-layout": "#layout",
  "flyer-individual": "#tab-individual",
  "flyer-bulk": "#tab-masivo",
  "flyer-history": "#tab-historial",
  promotions: "#view-promos",
  "promotions-active": "#ptab-activas",
  benchmark: "#view-benchmark",
  "commercial-actions": "#view-gestiones",
  "admin-audit": "#at-auditoria",
  "admin-legal": "#at-legales",
  "my-database": "#pad-mine-ov",
};

async function waitForEntry(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      window._fgPrevGate === false &&
      Boolean(window.baseImg) &&
      Boolean(window.cv) &&
      window._facLoaded &&
      window._opcLoaded,
    null,
    { timeout: ENTRY_TIMEOUT_MS },
  );
}

async function waitForOption(page: Page, option: number): Promise<void> {
  await page.waitForFunction(
    (n) => {
      const image = window.baseImg;
      return (
        window._fgOpt === n &&
        Boolean(image) &&
        (image?.naturalWidth ?? 0) > 0 &&
        cv.height > 1000 &&
        _fgOptCache[n]?.img === image
      );
    },
    option,
    { timeout: ENTRY_TIMEOUT_MS },
  );
}

async function open(
  page: Page,
  { role, startOption, waitUntilReady }: OpenSessionOptions,
): Promise<void> {
  await page.goto("index.html");
  if (!waitUntilReady) return;
  await waitForEntry(page);
  const option = startOption ?? LEGACY_DEFAULT_OPTION;
  // Administrators land on an option of their own; everybody else, on the first they may use.
  if (role === "admin" || startOption !== undefined) {
    await page.evaluate((n) => {
      if (_optN(_fgOpt) !== n) switchFlyerOption(n);
    }, option);
  }
  await waitForOption(page, option);
}

/** Runs inside the page. */
function promotionsTableFit(): PromotionsTableFit {
  const table = document.querySelector(".promos-table");
  const row = table?.querySelector("tbody tr");
  const status = row?.querySelector(".pc-est")?.getBoundingClientRect();
  const screenWidth = document.documentElement.clientWidth;
  return {
    tableWidth: Math.round(table?.getBoundingClientRect().width ?? 0),
    screenWidth,
    rowDisplay: row ? getComputedStyle(row).display : "",
    statusInsideTheScreen:
      Boolean(status) && (status?.right ?? 0) <= screenWidth && (status?.width ?? 0) > 0,
  };
}

async function accountSwitcher(page: Page): Promise<AccountSwitcher | null> {
  return page.evaluate(() => {
    const host = document.getElementById("hdr-dd-cuentas");
    if (!host || host.style.display === "none") return null;
    return {
      heading: host.querySelector(".hdr-dd-lbl")?.textContent ?? "",
      accounts: Array.from(host.querySelectorAll("button")).map((button) => ({
        name: button.querySelector(".nom")?.textContent ?? "",
        profile: button.querySelector(".rol")?.textContent ?? "",
      })),
    };
  });
}

async function openUserMenu(page: Page): Promise<void> {
  const menu = page.locator("#hdr-dropdown");
  const isOpen = await menu.evaluate((element) => element.classList.contains("open"));
  if (!isOpen) await page.locator(".hdr-user-btn").click();
  await page.locator("#hdr-dropdown.open").waitFor();
}

/** Runs in the page: the first entry screen that can be seen. */
function currentEntryView(): EntryView {
  const views: readonly [string, EntryView][] = [
    ["#lv-red", "retry"],
    ["#lv-boot", "entering"],
    ["#lv-register", "register"],
    ["#lv-login", "login"],
  ];
  const shown = views.find(
    ([selector]) => (document.querySelector(selector)?.getClientRects().length ?? 0) > 0,
  );
  return shown?.[1] ?? "app";
}

function createEntry(page: Page) {
  return {
    entryView: () => page.evaluate(currentEntryView),
    entryText: async () =>
      (await page.locator("#login-ov .login-card").innerText()).replace(/\s+/g, " "),
    pressRetryEntry: () => page.locator("#lv-red-btn").click(),
    stallReadingTheSession: () =>
      page.evaluate(() => {
        window._sb.auth.getSession = () => new Promise(() => undefined);
      }),
    signIn: async (email: string, password: string) => {
      await page.locator("#login-email").fill(email);
      await page.locator("#login-pass").fill(password);
      await page.locator("#login-btn").click();
    },
    signInButtonBusy: async () => page.locator("#login-btn").isDisabled(),
    showRegisterForm: () =>
      page.evaluate(() => {
        showLoginView("register");
      }),
    submitRegisterForm: async ({
      name,
      email,
      password,
    }: Record<"name" | "email" | "password", string>) => {
      await page.locator("#reg-name").fill(name);
      await page.locator("#reg-email").fill(email);
      await page.locator("#reg-pass").fill(password);
      await page.locator("#reg-btn").click();
    },
    showForgottenPasswordForm: () =>
      page.getByRole("button", { name: /Olvidaste tu contrase/ }).click(),
    submitForgottenPasswordForm: async ({
      email,
      password,
      repeat,
    }: Record<"email" | "password" | "repeat", string>) => {
      await page.locator("#forgot-email").fill(email);
      await page.locator("#forgot-pass").fill(password);
      await page.locator("#forgot-pass2").fill(repeat);
      await page.locator("#forgot-btn").click();
    },
    forgottenPasswordMessages: async () => ({
      error: (await page.locator("#forgot-err").textContent()) ?? "",
      ok: (await page.locator("#forgot-ok").textContent()) ?? "",
      locked: await page.locator("#forgot-btn").isDisabled(),
    }),
    registerMessages: async () => ({
      error: (await page.locator("#reg-err").textContent()) ?? "",
      ok: (await page.locator("#reg-ok").textContent()) ?? "",
      passwordHint: (await page.locator("#reg-pass").getAttribute("placeholder")) ?? "",
    }),
  };
}

function createHeader(page: Page) {
  const tab = (name: string) => page.locator(".app-tab:visible", { hasText: name }).first();
  return {
    headerTabs: () => page.locator(".app-tab:visible").allInnerTexts(),
    activeHeaderTab: async () => (await page.locator(".app-tab.active").first().innerText()).trim(),
    headerTabBadge: async (name: string) => {
      const badge = tab(name).locator(".tab-badge");
      return (await badge.count()) > 0 && (await badge.isVisible())
        ? ((await badge.textContent()) ?? "")
        : "";
    },
    chooseHeaderTab: (name: string) => tab(name).click(),
    dragHeaderTab: async (name: string, ontoTab: string) => {
      const from = await tab(name).boundingBox();
      const to = await tab(ontoTab).boundingBox();
      if (!from || !to) throw new Error("The tabs are not on screen");
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(HOLD_TO_LIFT_MS);
      await page.mouse.move(to.x + 2, to.y + to.height / 2, { steps: 8 });
      await page.mouse.up();
    },
    previewPainted: () => page.evaluate(() => window._fgPrevGate === false),
    checkForNewVersion: () =>
      page.evaluate(() => {
        _updUltimo = 0;
        _updChk();
      }),
    newVersionNotice: async () => {
      const notice = page.locator("#upd-banner");
      return (await notice.count()) > 0 ? ((await notice.textContent()) ?? "") : "";
    },
    documentFit: () =>
      page.evaluate(() => {
        const panel = document.querySelector<HTMLElement>("#layout .panel");
        const layout = document.querySelector<HTMLElement>("#layout");
        const root = document.scrollingElement ?? document.documentElement;
        return {
          windowHeight: window.innerHeight,
          documentScrolls: root.scrollHeight > window.innerHeight + 1,
          editorHeight: Math.round(layout?.getBoundingClientRect().height ?? 0),
          panelScrollsInside:
            panel !== null &&
            getComputedStyle(panel).overflowY === "auto" &&
            panel.scrollHeight > panel.clientHeight,
          headerHeight: Math.round(
            document.querySelector("header")?.getBoundingClientRect().height ?? 0,
          ),
        };
      }),
    headerLook: () =>
      page.evaluate(() => {
        const logo = document.querySelector(".header-logo")?.getBoundingClientRect();
        const title = document.querySelector<HTMLElement>(".app-tab.active h1, .app-tab h1");
        const header = document.querySelector("header");
        return {
          logoWidth: Math.round(logo?.width ?? 0),
          logoHeight: Math.round(logo?.height ?? 0),
          title: title?.innerText ?? "",
          titleFits: Boolean(title) && (title?.scrollWidth ?? 0) <= (title?.clientWidth ?? 0) + 1,
          fitsTheWindow: (header?.getBoundingClientRect().right ?? 0) <= window.innerWidth + 1,
        };
      }),
    downloadDock: () =>
      page.evaluate(() => {
        const dock = document.querySelector("#fg-dock");
        if (!dock || dock.getClientRects().length === 0) {
          return { buttons: [], stuckToBottom: false };
        }
        const panel = document.querySelector("#layout .panel");
        if (panel) panel.scrollTop = 0;
        const bottom = panel?.getBoundingClientRect().bottom ?? 0;
        const stuck = Math.abs(dock.getBoundingClientRect().bottom - bottom) < 24;
        return {
          buttons: Array.from(dock.querySelectorAll<HTMLElement>("button")).flatMap((button) =>
            button.offsetParent ? [button.innerText.trim().replace(/\s+/g, " ")] : [],
          ),
          stuckToBottom: stuck,
        };
      }),
    noticesOnScreen: () =>
      page.evaluate(
        () =>
          Array.from(document.querySelectorAll<HTMLElement>("#toast-el, #toast")).filter((notice) =>
            notice.classList.contains("show"),
          ).length,
      ),
    showNotice: (text: string) =>
      page.evaluate((message) => {
        window.showToast(message);
      }, text),
    noticeVisible: () =>
      page.evaluate(() => {
        const notice = document.querySelector("#toast-el, #toast");
        return Boolean(notice?.classList.contains("show"));
      }),
    downloadButtonHint: async () => {
      await page.locator("#btn-dl-pdf").hover();
      const hint = page.locator("#fg-tip");
      await hint.waitFor({ timeout: 3_000 });
      return (await hint.textContent()) ?? "";
    },
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
    adminButtonOffered: () => page.locator("#hdr-admin-btn").isVisible(),
    openPasswordWindow: async () => {
      await openUserMenu(page);
      await page.locator("#hdr-dd-pass").click();
      // It takes the focus a moment after opening: what is written before lands elsewhere.
      await page.locator("#mp-cur:focus").waitFor();
    },
    passwordWindowOpen: () => page.locator("#pass-modal").isVisible(),
    closePasswordWindow: () =>
      page
        .locator("#pass-modal button", { hasText: /Cancelar/ })
        .first()
        .click(),
    submitPasswordWindow: async ({
      current,
      password,
      repeat,
    }: Record<"current" | "password" | "repeat", string>) => {
      await page.locator("#mp-cur").fill(current);
      await page.locator("#mp-new").fill(password);
      await page.locator("#mp-new2").fill(repeat);
      await page.locator("#mp-submit").click();
    },
    passwordWindowMessages: async () => ({
      error: (await page.locator("#mp-err").textContent()) ?? "",
      ok: (await page.locator("#mp-ok").textContent()) ?? "",
      locked: await page.locator("#mp-submit").isDisabled(),
    }),
    openNotes: async () => {
      await openUserMenu(page);
      await page.locator("#hdr-dd-notes").click();
    },
    notesOpen: () => page.locator("#notes-modal").isVisible(),
    browserStorage: () =>
      page.evaluate(() =>
        Object.fromEntries(
          Object.keys(localStorage)
            .filter((key) => key.startsWith("fg_"))
            .map((key) => [key, localStorage.getItem(key) ?? ""]),
        ),
      ),
    tutorialOpen: () => page.locator("#fg-tour-tip").isVisible(),
    closeTutorial: () => page.keyboard.press("Escape"),
    moveAlongEditorTabs: async (key: "ArrowRight" | "ArrowLeft") => {
      await page.locator("#layout .tabs .tab.active").first().focus();
      await page.keyboard.press(key);
      return (await page.locator("#layout .tabs .tab.active").first().innerText()).trim();
    },
    selectedEditorTab: async () =>
      (await page.locator('#layout .tabs .tab[aria-selected="true"]').first().innerText()).trim(),
    visibleText: () => page.locator("body").innerText(),
    chosenCashbackButtonColors: () =>
      page
        .locator(".cfg-btn.active")
        .first()
        .evaluate((button) => {
          const style = getComputedStyle(button);
          return { text: style.color, background: style.backgroundColor };
        }),
    cashbackCardTitle: async () =>
      (await page
        .locator("#tab-individual")
        .getByText(/Configuraci.n de Montos/)
        .first()
        .textContent()) ?? "",
  };
}

export function createLegacySessionDriver(page: Page): SessionDriver {
  return {
    ...createEntry(page),
    ...createHeader(page),
    open: (options) => open(page, options),
    status: () =>
      page.evaluate(() => ({
        signedIn: Boolean(_me),
        loginScreenVisible: document.getElementById("login-ov")?.style.display !== "none",
        stillEntering: _fgPrevGate !== false,
      })),
    waitUntilSignedIn: async () => {
      await page.waitForFunction(() => Boolean(window._me) && window._facLoaded, null, {
        timeout: ENTRY_TIMEOUT_MS,
      });
    },
    accountSwitcher: () => accountSwitcher(page),
    switchToAccount: async (name) => {
      await openUserMenu(page);
      await page.locator("#hdr-dd-cuentas button", { hasText: name }).click();
    },
    browserStoresOtherAccounts: () =>
      page.evaluate(() => Boolean(localStorage.getItem("fg_cuentas_prueba"))),
    openUserMenu: () => openUserMenu(page),
    userMenuItems: async () => {
      await openUserMenu(page);
      return page
        .locator("#hdr-dropdown .hdr-dd-item")
        .evaluateAll((items) =>
          items.flatMap((item) =>
            item.getClientRects().length > 0 ? [item.textContent.replace(/\s+/g, " ").trim()] : [],
          ),
        );
    },
    chooseFromUserMenu: async (label) => {
      await openUserMenu(page);
      await page.locator("#hdr-dropdown .hdr-dd-item", { hasText: label }).first().click();
    },
    closeUserMenu: () =>
      page.evaluate(() => {
        closeUserMenu();
      }),
    isShowing: (screen) =>
      page.evaluate((selector) => {
        const element = document.querySelector(selector);
        return Boolean(element) && (element?.getClientRects().length ?? 0) > 0;
      }, SCREENS[screen]),
    isDarkMode: () => page.evaluate(() => document.documentElement.classList.contains("dark")),
    toggleDarkMode: () =>
      page.evaluate(() => {
        toggleTheme();
      }),
    headerFit: () =>
      page.evaluate(() => {
        const header = document.querySelector("header");
        const button = document.getElementById("hdr-cmdk")?.getBoundingClientRect();
        return {
          contentWidth: header?.scrollWidth ?? 0,
          visibleWidth: header?.clientWidth ?? 0,
          searchButtonRight: button?.right ?? 0,
          windowWidth: window.innerWidth,
        };
      }),
    showConfirmation: (message) =>
      page.evaluate((text) => {
        fgConfirm(text, () => undefined);
      }, message),
    removeConfirmations: () =>
      page.evaluate(() => {
        for (const overlay of document.querySelectorAll(".fg-cf-ov")) overlay.remove();
      }),
    pretendBatchRunning: (running) =>
      page.evaluate((value) => {
        _masBusy = value;
      }, running),
    waitForConfirmation: async () => {
      const window = page.locator("#fg-cf-ov");
      await window.waitFor({ timeout: ENTRY_TIMEOUT_MS });
      return (await window.textContent()) ?? "";
    },
    answerConfirmation: async (goAhead) => {
      await page.locator(goAhead ? "#fg-cf-ok" : "#fg-cf-no").click();
      await page.locator("#fg-cf-ov").waitFor({ state: "detached" });
    },
    confirmationOpen: async () => (await page.locator("#fg-cf-ov").count()) > 0,
    reload: async (option = LEGACY_DEFAULT_OPTION) => {
      await page.reload();
      await waitForEntry(page);
      await waitForOption(page, option);
    },
    modes: () =>
      page.evaluate(() => {
        const tools = {
          preview: window._fgLg.limpio,
          strip: window._fgFr.modo,
          crop: _fgRecM.modo,
          insert: _fgIns.modo,
        };
        const commercial = document.querySelector("#ges-root .ges-tabs") ? window.GES : undefined;
        return {
          logoEditing: window._fgLg.on,
          logoTools: Object.entries(tools)
            .filter(([, isOn]) => Boolean(isOn))
            .map(([name]) => name),
          promotionsTab: _promosModo,
          commercialActionsTab: commercial?.tab ?? null,
        };
      }),
    waitForCommercialActions: async () => {
      await page.waitForFunction(() => Boolean(window._me) && window._facLoaded && _gesOn(), null, {
        timeout: ENTRY_TIMEOUT_MS,
      });
    },
    focusCompanyField: () => page.locator(COMPANY_FIELD).focus(),
    companyFieldHasFocus: () =>
      page.locator(COMPANY_FIELD).evaluate((field) => document.activeElement === field),
    anotherAvailableFlyer: () =>
      page.evaluate(() => {
        const option = _facOpts().find((n) => n !== _optN(_fgOpt));
        return option === undefined ? null : { option, name: _optLabel(option) };
      }),
    currentFlyerOption: () => page.evaluate(() => _optN(_fgOpt)),
    disabledDownloadButtonOpacity: () =>
      page.locator(DOWNLOAD_BUTTON).evaluate((button) => {
        if (!(button instanceof HTMLButtonElement)) throw new Error("It is not a button");
        button.disabled = true;
        const { opacity } = getComputedStyle(button);
        button.disabled = false;
        return Number(opacity);
      }),
    downloadFileName: (pattern, values) =>
      page.evaluate(([text, fields]) => buildFn(text, fields), [pattern, values] as const),
    selectedFlyerColors: () =>
      page.locator("#fg-optbar .fgo.on").evaluate((option) => {
        const style = getComputedStyle(option);
        return { text: style.color, background: style.backgroundColor };
      }),
    promotionLogoBackground: () =>
      page.evaluate(() => {
        const logo = document.createElement("img");
        logo.className = "promos-logo";
        document.body.append(logo);
        const { backgroundColor } = getComputedStyle(logo);
        logo.remove();
        return backgroundColor;
      }),
    logoEditorOpens: () =>
      page.evaluate(() => {
        fgLogosModo(true);
        const opened = window._fgLg.on;
        if (opened) fgLogosModo(false);
        return opened;
      }),
    activePromotionsHeader: () =>
      page.evaluate(() => ({
        counters: Array.from(document.querySelectorAll(".promos-chip")).map(
          (chip) => chip.textContent ?? "",
        ),
        firstSortOption:
          document.querySelector<HTMLSelectElement>("#promos-orden-sel")?.options[0]?.text ?? "",
      })),
    promotionsTableFit: () => page.evaluate(promotionsTableFit),
    pressPhoneDownloadPill: () =>
      page.evaluate(
        ({ download }) => {
          const button = document.querySelector(download);
          if (!button) throw new Error("There is no download button");
          let presses = 0;
          const count = () => {
            presses += 1;
          };
          button.addEventListener("click", count, true);
          const realDownload = window.dlPDF;
          window.dlPDF = () => undefined;
          const pill = document.querySelector<HTMLElement>('#mv-toggle [data-mv="dl"]');
          const visible = Boolean(pill) && (pill?.getBoundingClientRect().width ?? 0) > 0;
          pill?.click();
          button.removeEventListener("click", count, true);
          window.dlPDF = realDownload;
          return {
            visible,
            pressesOfTheDownloadButton: presses,
            staysMarked: pill?.classList.contains("on") ?? false,
          };
        },
        { download: DOWNLOAD_BUTTON },
      ),
    databaseHelp: () =>
      page.evaluate(() => {
        openMiPadron();
        const sections = Array.from(
          document.querySelectorAll<HTMLDetailsElement>("details.bd-ayuda"),
        );
        const upload = Array.from(document.querySelectorAll("button")).find(
          (button) => /Subir Excel/.test(button.textContent ?? "") && button.offsetParent,
        );
        const title = document.getElementById("bd-tit")?.getBoundingClientRect().top ?? 0;
        const help = {
          sections: sections.length,
          allClosed: sections.every((section) => !section.open),
          uploadButtonBelowTitle: upload
            ? Math.round(upload.getBoundingClientRect().top) - Math.round(title)
            : null,
        };
        closeMiPadron();
        return help;
      }),
  };
}
