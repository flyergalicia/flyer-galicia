import { readFile } from "node:fs/promises";
import { type Locator, type Page } from "@playwright/test";
import { type AdminDriver, type UsageBoard } from "../admin.ts";

const PANEL = "#admin-panel";
const USAGE_BODY = "#uso-body";
const USAGE_CARD = `${USAGE_BODY} .uso-card`;
const USER_FORM = "#user-modal";
const SEND_ACCESS_OPTION = "#um-env-wrap";
const SEND_ACCESS_CHECK = "#um-env";
const SEND_ACCESS_FIELDS = "#um-env-campos";
const SEND_ACCESS_TO = "#um-env-a";
const SEND_ACCESS_GREETING = "#um-env-n";
const PASSWORD = "#um-pass";
const LOAD_TIMEOUT_MS = 10_000;
const OPTIONS_SETTLE_MS = 300;

function sheetTab(page: Page, sheet: string): Locator {
  return page.locator(`.stab[data-tab="${sheet}"]`);
}

async function isShown(page: Page, selector: string): Promise<boolean> {
  return page
    .locator(selector)
    .evaluate((element) => element instanceof HTMLElement && element.offsetParent !== null);
}

async function usageBoard(page: Page): Promise<UsageBoard> {
  return page.locator(USAGE_BODY).evaluate((body) => ({
    totals: Array.from(body.querySelectorAll(".uso-cards:first-child .uso-card-n")).map(
      (card) => card.textContent,
    ),
    sections: Array.from(body.querySelectorAll(".uso-sec")).map((section) => ({
      title: section.querySelector("h4")?.textContent ?? "",
      rows: Array.from(section.querySelectorAll(".uso-fila")).map((row) => ({
        label: row.querySelector(".uso-et")?.textContent ?? "",
        count: row.querySelector(".uso-n")?.textContent ?? "",
      })),
    })),
  }));
}

const COLUMNS = ["Vos", "Asesor", "VIP", "Pro", "Hunter", "Líder"];

/** Runs in the page. */
function readFacultyRows(columns: string[]) {
  return Array.from(
    document.querySelectorAll<HTMLElement>("#fac-grid .fac-row:not(.fac-head):not(.fac-grp)"),
  ).map((row) => {
    const cells = Array.from(row.children).slice(1);
    return {
      name: row.querySelector(".fac-name")?.textContent ?? "",
      visible: row.getClientRects().length > 0,
      ticks: Object.fromEntries(
        cells.map((cell, position) => {
          const box = cell.querySelector<HTMLInputElement>("input[type=checkbox]");
          return [columns[position] ?? "", box ? box.checked : null];
        }),
      ),
    };
  });
}

function createFaculties(page: Page) {
  return {
    facultyRows: async () => {
      await page.locator("#fac-grid .fac-row").first().waitFor({ timeout: LOAD_TIMEOUT_MS });
      return page.evaluate(readFacultyRows, COLUMNS);
    },
    setFaculty: async (row: string, column: string, on: boolean) => {
      const box = page
        .locator("#fac-grid .fac-row", { hasText: row })
        .first()
        .locator(":scope > div")
        .nth(COLUMNS.indexOf(column) + 1)
        .locator("input");
      await box.setChecked(on);
    },
    toggleFacultyGroup: (tab: string) =>
      page.locator("#fac-grid .fac-grp", { hasText: tab }).click(),
    facultyGroup: async (tab: string) => {
      await page.locator("#fac-grid .fac-row").first().waitFor({ timeout: LOAD_TIMEOUT_MS });
      const group = page.locator("#fac-grid .fac-grp", { hasText: tab });
      if ((await group.count()) === 0) return null;
      const counts = await group.locator(".fac-cnt").allInnerTexts();
      return {
        name: (await group.locator(".fac-name").textContent()) ?? "",
        counts: Object.fromEntries(counts.map((count, at) => [COLUMNS[at] ?? "", count])),
      };
    },
    untickAllOwnFlyers: () =>
      page.evaluate(() => {
        const lines = document.querySelectorAll("#fac-grid .fac-row[data-grp]");
        for (const line of lines) {
          const own = line.querySelectorAll<HTMLInputElement>("input[type=checkbox]")[0];
          if (own?.checked) own.click();
        }
      }),
    saveFaculties: async () => {
      await page.locator("#fac-save").click();
      await page.locator("#fac-save:not([disabled])").waitFor();
    },
    previewProfile: (profile: string) =>
      page.locator("#fac-grid .fac-sim", { hasText: profile }).click(),
    leaveProfilePreview: () => page.locator("#fac-simbar button").click(),
    previewBarText: async () => (await page.locator("#fac-simbar").textContent()) ?? "",
  };
}

function createOptions(page: Page) {
  const rows = "#opciones-list .opc-row";
  return {
    optionRows: () =>
      page.locator(rows).evaluateAll((lines) =>
        lines.map((line) => {
          const selects = Array.from(line.querySelectorAll("select"));
          const chosen = selects.map(
            (select) => select.options[select.selectedIndex]?.text ?? null,
          );
          const replaces = selects.findIndex((select) => /eemplaza/.test(select.textContent));
          return {
            number: Number(line.getAttribute("data-n")),
            name: line.querySelector<HTMLInputElement>("input[type=text]")?.value ?? "",
            tab: chosen[0] ?? "",
            replaces: chosen[replaces] ?? null,
            isCurrent: Boolean(line.querySelector(".opc-vig")),
            status: line.querySelector(".opc-est")?.textContent ?? "",
          };
        }),
      ),
    pressAddOption: () => page.locator("#at-opciones button", { hasText: /Agregar/ }).click(),
    renameOptionRow: (index: number, name: string) =>
      page.locator(rows).nth(index).locator("input[type=text]").fill(name),
    chooseOptionTab: async (index: number, tab: string) => {
      await page.locator(rows).nth(index).locator("select").first().selectOption({ label: tab });
    },
    chooseOptionReplaces: async (index: number, label: string) => {
      await page
        .locator(rows)
        .nth(index)
        .locator("select", { hasText: "Reemplaza" })
        .selectOption({ label });
    },
    saveOptions: async () => {
      await page.locator("#at-opciones .btn-submit").click();
      await page.waitForTimeout(OPTIONS_SETTLE_MS);
    },
  };
}

function createCashback(page: Page) {
  return {
    cashbackConfigs: () =>
      page
        .locator("#cashback-list .pad-erow")
        .evaluateAll((rows) =>
          rows.map((row) =>
            Array.from(row.querySelectorAll<HTMLInputElement>("input"), (field) => field.value),
          ),
        ),
    setCashbackAmount: (config: number, amount: number, value: string) =>
      page
        .locator(`#cashback-list .pad-erow[data-i="${String(config)}"] input`)
        .nth(amount + 1)
        .fill(value),
    saveCashback: async () => {
      await page.locator("#cashback-save").click();
      await page.locator("#cashback-save:not([disabled])").waitFor();
      await page.waitForTimeout(OPTIONS_SETTLE_MS);
    },
  };
}

function createLegalSheet(page: Page) {
  const pane = "#legales-panes > div:visible";
  return {
    legalTabs: () => page.locator("#legales-tabs .ltab").allInnerTexts(),
    chooseLegalTab: (name: string) =>
      page.locator("#legales-tabs .ltab", { hasText: name }).click(),
    legalMarkers: () => page.locator(`${pane} .glegal-vars .ftag`).allInnerTexts(),
    pressLegalMarker: async (name: string) => {
      const text = page.locator(`${pane} textarea`);
      await text.click();
      await page.keyboard.press("ControlOrMeta+End");
      await page.keyboard.up("ControlOrMeta");
      await page.locator(`${pane} .glegal-vars .ftag`, { hasText: name }).click();
    },
    legalText: () => page.locator(`${pane} textarea`).inputValue(),
    fillLegal: (text: string) => page.locator(`${pane} textarea`).fill(text),
    saveLegal: async () => {
      await page.locator(`${pane} .btn-submit`).click();
      await page.locator(`${pane} .login-ok`).filter({ hasNotText: /^$/ }).waitFor();
    },
  };
}

export function createLegacyAdminDriver(page: Page): AdminDriver {
  // The form takes the focus a moment after opening: what is written before lands elsewhere.
  const userFormTakesFocus = () => page.locator("#um-name:focus").waitFor();
  return {
    ...createFaculties(page),
    ...createOptions(page),
    ...createCashback(page),
    ...createLegalSheet(page),
    panelStructure: () =>
      page.evaluate(() => {
        const structure: Record<string, string[]> = {};
        for (const pillar of document.querySelectorAll<HTMLElement>(".atab[data-group]")) {
          const sheets = document.querySelectorAll<HTMLElement>(
            `#sg-${pillar.dataset.group ?? ""} .stab`,
          );
          structure[pillar.textContent] = Array.from(sheets, (sheet) => sheet.textContent);
        }
        return structure;
      }),
    openSheet: async (pillar, sheet) => {
      await page.locator(".atab", { hasText: pillar }).click();
      await page.locator(".stab:visible", { hasText: sheet }).first().click();
    },
    exportSheet: async (button) => {
      await page.evaluate(() => _lib("xlsx"));
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: LOAD_TIMEOUT_MS * 3 }),
        page.locator(`#${button}`).click(),
      ]);
      const bytes = await readFile(await download.path());
      const cells = await page.evaluate((encoded) => {
        const book = XLSX.read(encoded, { type: "base64" });
        const sheet = book.Sheets[book.SheetNames[0] ?? ""];
        return sheet ? XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false }) : [];
      }, bytes.toString("base64"));
      const [head = [], ...rows] = cells;
      return { head, rows };
    },
    sheetText: async () =>
      page.evaluate(() => {
        const panel = document.querySelector<HTMLElement>("#admin-panel");
        return panel?.innerText ?? "";
      }),
    openPanel: async () => {
      await page.locator("#hdr-admin-btn").click();
      await page.locator(`${PANEL}.open`).waitFor();
    },
    closePanel: async () => {
      await page.evaluate(() => {
        closeAdminPanel();
      });
      await page.locator(`${PANEL}.open`).waitFor({ state: "detached" });
    },
    isPanelOpen: () => page.locator(PANEL).evaluate((panel) => panel.classList.contains("open")),

    openUsage: async () => {
      await sheetTab(page, "uso").click();
      await page.locator(USAGE_CARD).first().waitFor({ timeout: LOAD_TIMEOUT_MS });
    },
    usageBoard: () => usageBoard(page),
    selectUsagePeriod: async (days) => {
      await page.locator(`#uso-per button[data-d="${String(days)}"]`).click();
      await page.locator(USAGE_CARD).first().waitFor({ timeout: LOAD_TIMEOUT_MS });
    },
    usageOverflowsSideways: () =>
      page.locator(USAGE_BODY).evaluate((body) => body.scrollWidth > body.clientWidth + 1),

    openUsers: async () => {
      await sheetTab(page, "usuarios").click();
      await page.locator("#users-list .skel-row").first().waitFor({ state: "detached" });
    },
    openNewUserForm: async () => {
      await page.locator(".btn-new-usr").click();
      await userFormTakesFocus();
    },
    openEditUserForm: async (name) => {
      await page
        .locator("#users-list > *", { hasText: name })
        .getByRole("button", { name: "Editar" })
        .click();
      await userFormTakesFocus();
    },
    setUserFormPassword: (password) => page.locator(PASSWORD).fill(password),
    sendAccessOptionVisible: () => isShown(page, SEND_ACCESS_OPTION),
    sendAccessOptionChecked: () => page.locator(SEND_ACCESS_CHECK).isChecked(),
    checkSendAccess: () => page.locator(SEND_ACCESS_CHECK).check(),
    sendAccessFieldsVisible: () => isShown(page, SEND_ACCESS_FIELDS),
    sendAccessFields: async () => ({
      to: await page.locator(SEND_ACCESS_TO).inputValue(),
      greeting: await page.locator(SEND_ACCESS_GREETING).inputValue(),
    }),
    fillSendAccess: async ({ to, greeting }) => {
      if (to !== undefined) await page.locator(SEND_ACCESS_TO).fill(to);
      if (greeting !== undefined) await page.locator(SEND_ACCESS_GREETING).fill(greeting);
    },
    userRows: () =>
      page.locator("#users-list .usr-row").evaluateAll((rows) =>
        rows.map((row) => ({
          name: row.querySelector(".usr-info strong")?.textContent ?? "",
          details: row.querySelector(".usr-info small")?.textContent ?? "",
          badges: Array.from(
            row.querySelectorAll(".usr-badges .badge"),
            (badge) => badge.textContent,
          ),
          actions: Array.from(
            row.querySelectorAll(".usr-btns button:not(.danger)"),
            (button) => button.textContent,
          ),
          canBeDeleted: row.querySelector(".usr-btns button.danger") !== null,
        })),
      ),
    pressUserAction: (name, action) =>
      page
        .locator("#users-list .usr-row", { hasText: name })
        .getByRole("button", { name: action, exact: true })
        .click(),
    pressDeleteUser: (name) =>
      page.locator("#users-list .usr-row", { hasText: name }).locator("button.danger").click(),
    pendingUsersBadge: async () => {
      const badge = page.locator("#hdr-admin-btn span");
      return (await badge.count()) > 0 ? ((await badge.textContent()) ?? "") : "";
    },
    fillUserForm: async ({ name, email, password, profile, status, leader }) => {
      if (name !== undefined) await page.locator("#um-name").fill(name);
      if (email !== undefined) await page.locator("#um-email").fill(email);
      if (password !== undefined) await page.locator(PASSWORD).fill(password);
      if (profile !== undefined) await page.locator("#um-role").selectOption({ label: profile });
      if (status !== undefined) await page.locator("#um-status").selectOption({ label: status });
      if (leader !== undefined) await page.locator("#um-lider").selectOption({ label: leader });
    },
    userFormButton: async () => ({
      text: (await page.locator("#um-submit").textContent()) ?? "",
      locked: await page.locator("#um-submit").isDisabled(),
    }),
    userFormProfiles: () =>
      page
        .locator("#user-modal select option")
        .evaluateAll((options) => options.map((option) => option.textContent)),
    submitUserForm: () => page.locator("#um-submit").click(),
    waitForUserFormClosed: () => page.locator(USER_FORM).waitFor({ state: "hidden" }),
    userFormError: async () => (await page.locator("#um-err").textContent()) ?? "",
  };
}
