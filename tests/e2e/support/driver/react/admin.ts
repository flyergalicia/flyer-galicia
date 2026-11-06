import ExcelJS from "exceljs";
import { type Locator, type Page } from "@playwright/test";
import { type AdminDriver, type FacultyRow, type UsageBoard, type UserRow } from "../admin.ts";
import { partialDriver } from "./pending.ts";

const LOAD_TIMEOUT_MS = 10_000;
const EXPORT_TIMEOUT_MS = 30_000;
/** The columns of the matrix of faculties, by the name the specs give them. */
const COLUMNS: Readonly<Record<string, string>> = {
  Vos: "me",
  Asesor: "asesor",
  VIP: "vip",
  Pro: "pro",
  Hunter: "hunter",
  Líder: "lider",
};
const PILLAR_NAMES = { Admin: "Admin", Data: "Data", Config: "Config" } as const;
/** The buttons that export, by the id they have in the current app. */
const EXPORTS: Readonly<Record<string, string>> = {
  "btn-export-excel": "export-dashboard",
  "btn-export-reg": "export-registros",
  "btn-export-plog": "export-company-log",
};
const PERIODS = { 30: "30 días", 90: "90 días", 365: "Este año" } as const;

function panel(page: Page): Locator {
  return page.getByTestId("admin-panel");
}

function userForm(page: Page): Locator {
  return page.getByRole("dialog", { name: /Nuevo usuario|Editar usuario/ });
}

function field(page: Page, label: string): Locator {
  return userForm(page).getByLabel(label, { exact: true });
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

async function decodeSheet(path: string): Promise<{ head: string[]; rows: string[][] }> {
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(path);
  const [sheet] = book.worksheets;
  const lines: string[][] = [];
  sheet?.eachRow((row) => {
    const values = row.values;
    if (Array.isArray(values)) lines.push(Array.from(values, cellText).slice(1));
  });
  const [head = [], ...rows] = lines;
  return { head, rows };
}

/** Runs in the page: the matrix as it reads, column by column. */
function readFacultyRows(columns: Record<string, string>) {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-faculty]")).map((row) => ({
    name: row.querySelector('[data-testid="faculty-name"]')?.textContent ?? "",
    visible: row.getClientRects().length > 0,
    ticks: Object.fromEntries(
      Object.entries(columns).map(([name, id]) => {
        const cell = row.querySelector(`[data-column="${id}"]`);
        const box = cell?.querySelector("input");
        return [name, box instanceof HTMLInputElement ? box.checked : null];
      }),
    ),
  }));
}

function createFaculties(page: Page) {
  const grid = () => panel(page).getByTestId("faculty-grid");
  const group = (tab: string) =>
    grid()
      .locator("[data-group]")
      .filter({ has: page.getByTestId("faculty-group-name").getByText(tab, { exact: true }) });
  return {
    facultyRows: async (): Promise<FacultyRow[]> => {
      await grid().waitFor({ timeout: LOAD_TIMEOUT_MS });
      return page.evaluate(readFacultyRows, { ...COLUMNS });
    },
    setFaculty: async (row: string, column: string, on: boolean) => {
      const line = grid().locator("[data-faculty]").filter({ hasText: row }).first();
      const box = line.locator(`[data-column="${COLUMNS[column] ?? column}"] input`);
      await box.setChecked(on);
    },
    toggleFacultyGroup: (tab: string) => group(tab).click(),
    facultyGroup: async (tab: string) => {
      await grid().waitFor({ timeout: LOAD_TIMEOUT_MS });
      const head = group(tab);
      if ((await head.count()) === 0) return null;
      const counts = Object.fromEntries(
        await Promise.all(
          Object.entries(COLUMNS).map(
            async ([name, id]) =>
              [name, (await head.locator(`[data-column="${id}"]`).textContent()) ?? ""] as const,
          ),
        ),
      );
      const name = ((await head.textContent()) ?? "").replace(/\d+\/\d+/g, "").trim();
      return { name, counts };
    },
    untickAllOwnFlyers: async () => {
      const boxes = grid().locator('[data-faculty^="opcion_"] [data-column="me"] input');
      for (let at = 0; at < (await boxes.count()); at += 1) {
        const box = boxes.nth(at);
        if (await box.isChecked()) await box.click({ force: true });
      }
    },
    saveFaculties: async () => {
      const save = panel(page).getByRole("button", { name: /^(Guardar cambios|Guardando\.\.\.)$/ });
      await save.click();
      await panel(page)
        .getByRole("button", { name: "Guardar cambios", exact: true })
        .and(page.locator(":enabled"))
        .waitFor();
    },
    previewProfile: (profile: string) =>
      panel(page)
        .getByRole("button", { name: new RegExp(`^${profile}`) })
        .and(page.locator("[data-preview]"))
        .click(),
    leaveProfilePreview: () =>
      page
        .getByTestId("role-preview-bar")
        .getByRole("button", { name: "Salir de la vista previa" })
        .click(),
    previewBarText: async () => (await page.getByTestId("role-preview-bar").textContent()) ?? "",
  };
}

async function usageBoard(page: Page): Promise<UsageBoard> {
  return page.getByTestId("usage-body").evaluate((body) => ({
    totals: Array.from(
      body.querySelectorAll('[data-testid="usage-totals"] [data-testid="usage-number"]'),
      (card) => card.textContent,
    ),
    sections: Array.from(body.querySelectorAll('[data-testid="usage-section"]'), (section) => ({
      title: section.querySelector("h4")?.textContent ?? "",
      rows: Array.from(section.querySelectorAll('[data-testid="usage-bar"]'), (row) => ({
        label: row.querySelector('[data-testid="usage-label"]')?.textContent ?? "",
        count: row.querySelector('[data-testid="usage-count"]')?.textContent ?? "",
      })),
    })),
  }));
}

function createUsage(page: Page) {
  const ready = () =>
    page
      .locator('[data-testid="usage-body"][aria-busy="false"] [data-testid="usage-totals"]')
      .waitFor({ timeout: LOAD_TIMEOUT_MS });
  return {
    openUsage: async () => {
      await panel(page).getByRole("tab", { name: "Uso", exact: true }).click();
      await ready();
    },
    usageBoard: () => usageBoard(page),
    selectUsagePeriod: async (days: 30 | 90 | 365) => {
      await panel(page).getByRole("button", { name: PERIODS[days], exact: true }).click();
      await page
        .locator(`[data-testid="usage-body"][aria-busy="false"]`)
        .waitFor({ timeout: LOAD_TIMEOUT_MS });
      await ready();
    },
    usageOverflowsSideways: () =>
      page.getByTestId("usage-body").evaluate((body) => body.scrollWidth > body.clientWidth + 1),
  };
}

function readUserRows(rows: Element[]): UserRow[] {
  return rows.map((row) => ({
    name: row.querySelector("strong")?.textContent ?? "",
    details: row.querySelector("small")?.textContent ?? "",
    badges: Array.from(
      row.querySelectorAll('[data-testid="account-badge"]'),
      (badge) => badge.textContent,
    ),
    actions: Array.from(
      row.querySelectorAll("button:not([aria-label])"),
      (button) => button.textContent,
    ),
    canBeDeleted: row.querySelector('button[aria-label="Eliminar usuario"]') !== null,
  }));
}

function createUsers(page: Page) {
  const rowOf = (name: string) =>
    panel(page)
      .getByTestId("account-row")
      .filter({ has: page.getByText(name, { exact: true }) });
  const formTakesFocus = () => field(page, "Nombre completo").and(page.locator(":focus")).waitFor();
  const sendAccess = () => userForm(page).getByLabel("Enviar usuario y contraseña por mail");
  const passwordField = () => userForm(page).locator('input[type="password"]');
  return {
    openUsers: async () => {
      await panel(page).getByRole("tab", { name: "Usuarios", exact: true }).click();
      await page
        .locator('[data-testid="users-list"][aria-busy="false"]')
        .waitFor({ timeout: LOAD_TIMEOUT_MS });
    },
    userRows: () => panel(page).getByTestId("account-row").evaluateAll(readUserRows),
    pressUserAction: (name: string, action: string) =>
      rowOf(name).getByRole("button", { name: action, exact: true }).click(),
    pressDeleteUser: (name: string) =>
      rowOf(name).getByRole("button", { name: "Eliminar usuario", exact: true }).click(),
    pendingUsersBadge: async () => {
      const count = page
        .getByRole("banner")
        .getByRole("button", { name: /^⚙ Admin/ })
        .locator("span");
      return (await count.count()) > 0 ? ((await count.textContent()) ?? "") : "";
    },
    openNewUserForm: async () => {
      await panel(page).getByRole("button", { name: "+ Nuevo usuario", exact: true }).click();
      await formTakesFocus();
    },
    openEditUserForm: async (name: string) => {
      await rowOf(name).getByRole("button", { name: "Editar", exact: true }).click();
      await formTakesFocus();
    },
    setUserFormPassword: (password: string) => passwordField().fill(password),
    sendAccessOptionVisible: () => sendAccess().isVisible(),
    sendAccessOptionChecked: async () =>
      (await sendAccess().count()) > 0 && (await sendAccess().isChecked()),
    checkSendAccess: () => sendAccess().check(),
    sendAccessFieldsVisible: () => userForm(page).getByTestId("send-access-fields").isVisible(),
    sendAccessFields: async () => ({
      to: await field(page, "Enviar a").inputValue(),
      greeting: await field(page, "Nombre de quien lo recibe (opcional)").inputValue(),
    }),
    fillSendAccess: async ({ to, greeting }: { to?: string; greeting?: string }) => {
      if (to !== undefined) await field(page, "Enviar a").fill(to);
      if (greeting !== undefined) {
        await field(page, "Nombre de quien lo recibe (opcional)").fill(greeting);
      }
    },
    fillUserForm: async ({
      name,
      email,
      password,
      profile,
      status,
      leader,
    }: {
      name?: string;
      email?: string;
      password?: string;
      profile?: string;
      status?: string;
      leader?: string;
    }) => {
      if (name !== undefined) await field(page, "Nombre completo").fill(name);
      if (email !== undefined) await field(page, "Email").fill(email);
      if (password !== undefined) await passwordField().fill(password);
      if (profile !== undefined) await field(page, "Rol").selectOption({ label: profile });
      if (status !== undefined) await field(page, "Estado").selectOption({ label: status });
      if (leader !== undefined) await field(page, "Líder a cargo").selectOption({ label: leader });
    },
    userFormButton: async () => {
      const submit = userForm(page).getByTestId("account-form-submit");
      return { text: (await submit.textContent()) ?? "", locked: await submit.isDisabled() };
    },
    userFormProfiles: () =>
      field(page, "Rol")
        .locator("option")
        .evaluateAll((options) => options.map((option) => option.textContent)),
    submitUserForm: () => userForm(page).getByTestId("account-form-submit").click(),
    waitForUserFormClosed: () => userForm(page).waitFor({ state: "detached" }),
    userFormError: async () =>
      (await userForm(page).getByTestId("account-form-error").textContent()) ?? "",
  };
}

function createPanel(page: Page) {
  return {
    openPanel: async () => {
      await page
        .getByRole("banner")
        .getByRole("button", { name: /^⚙ Admin/ })
        .click();
      await panel(page).waitFor({ timeout: LOAD_TIMEOUT_MS });
    },
    closePanel: async () => {
      await panel(page).getByRole("button", { name: "Cerrar", exact: true }).click();
      await panel(page).waitFor({ state: "detached" });
    },
    isPanelOpen: () => panel(page).isVisible(),
    panelStructure: () =>
      panel(page).evaluate((root) => {
        const structure: Record<string, string[]> = {};
        for (const group of root.querySelectorAll<HTMLElement>("[data-sheets-of]")) {
          structure[group.dataset.sheetsOf ?? ""] = Array.from(
            group.querySelectorAll('[role="tab"]'),
            (sheet) => sheet.textContent,
          );
        }
        return structure;
      }),
    openSheet: async (pillar: keyof typeof PILLAR_NAMES, sheet: string) => {
      await panel(page)
        .getByRole("tablist", { name: "Pilares del panel" })
        .getByRole("tab", { name: PILLAR_NAMES[pillar], exact: true })
        .click();
      await panel(page)
        .getByRole("tablist", { name: `Hojas de ${PILLAR_NAMES[pillar]}` })
        .getByRole("tab", { name: sheet, exact: true })
        .click();
    },
    exportSheet: async (button: string) => {
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: EXPORT_TIMEOUT_MS }),
        panel(page)
          .getByTestId(EXPORTS[button] ?? button)
          .click(),
      ]);
      return decodeSheet(await download.path());
    },
    sheetText: async () =>
      (await panel(page)
        .innerText()
        .catch(() => "")) ?? "",
  };
}

export function createReactAdminDriver(page: Page): AdminDriver {
  return partialDriver<AdminDriver>("admin", {
    ...createPanel(page),
    ...createUsage(page),
    ...createUsers(page),
    ...createFaculties(page),
  });
}
