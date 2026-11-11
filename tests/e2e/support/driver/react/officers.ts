import { type Locator, type Page } from "@playwright/test";
import { type OfficersDriver, type PasteOutcome } from "../officers.ts";

const PASTE_SETTLE_MS = 400;
const PASTE_TIMEOUT_MS = 2_000;

function field(page: Page, name: string, officer: number): Locator {
  return page.locator(`[data-officer-field="${name}${String(officer)}"]`);
}

function pasteBox(page: Page, officer: number): Locator {
  return page.getByTestId(`paste-box-${String(officer)}`);
}

function advisors(page: Page): Locator {
  return page.getByTestId("saved-advisors");
}

async function readPaste(page: Page, officer: number): Promise<PasteOutcome> {
  const result = pasteBox(page, officer).getByTestId("paste-result");
  await result.locator("[data-paste-chip], [data-paste-problem]").first().waitFor({
    timeout: PASTE_TIMEOUT_MS,
  });
  const chips = await result.locator("[data-paste-chip]").allInnerTexts();
  const has = (word: string) => chips.some((chip) => chip.includes(word) && chip.includes("✓"));
  return {
    recognized: { name: has("Nombre"), phone: has("Celular"), email: has("Mail") },
    text: (await result.innerText()).replace(/\s+/g, " ").trim(),
  };
}

/** A block out of sight has no fields, and nothing written in them. */
async function valueOf(input: Locator): Promise<string> {
  return (await input.count()) > 0 ? input.inputValue() : "";
}

export function createReactOfficersDriver(page: Page): OfficersDriver {
  return {
    read: async (officer) => ({
      name: await valueOf(field(page, "nombre", officer)),
      phone: await valueOf(field(page, "celular", officer)),
      email: await valueOf(field(page, "email", officer)),
    }),
    fill: async (officer, { name, phone, email }) => {
      if (name !== undefined) await field(page, "nombre", officer).fill(name);
      if (phone !== undefined) await field(page, "celular", officer).fill(phone);
      if (email !== undefined) await field(page, "email", officer).fill(email);
    },
    shownBlocks: () =>
      page
        .locator('[data-testid^="officer-block-"]')
        .evaluateAll((blocks) =>
          blocks
            .filter((block) => block.getClientRects().length > 0)
            .map((block) => Number(block.getAttribute("data-testid")?.replace(/\D/g, ""))),
        ),
    addButtonLabel: async () => {
      const button = page.getByTestId("add-officer");
      return (await button.isVisible()) ? await button.innerText() : null;
    },
    pressAdd: () => page.getByTestId("add-officer").click(),
    pressRemove: (officer) => page.getByTestId(`remove-officer-${String(officer)}`).click(),
    controls: (officer) =>
      page.getByTestId(`officer-actions-${String(officer)}`).evaluate((box) =>
        Array.from(box.children, (control) => ({
          label: control.textContent.trim(),
          height: Math.round(control.getBoundingClientRect().height),
          isKeyboardButton: control.tagName === "BUTTON",
        })),
      ),
    switchIsOn: async () =>
      (await page
        .getByRole("switch", { name: "Mostrar en el flyer" })
        .getAttribute("aria-checked")) === "true",
    pressSwitch: () => page.getByRole("switch", { name: "Mostrar en el flyer" }).click(),
    blocksHiddenBySwitch: () => page.getByTestId("officers-off").isVisible(),

    pasteOffered: () =>
      page
        .locator('[data-testid^="paste-button-"]')
        .evaluateAll((buttons) =>
          buttons
            .filter((button) => button.getClientRects().length > 0)
            .map((button) => Number(button.getAttribute("data-testid")?.replace(/\D/g, ""))),
        ),
    pressPaste: (officer) => page.getByTestId(`paste-button-${String(officer)}`).click(),
    pressPasteWithKeyboard: async (officer) => {
      await page.getByTestId(`paste-button-${String(officer)}`).focus();
      await page.keyboard.press("Enter");
    },
    pasteBoxOpen: (officer) => pasteBox(page, officer).isVisible(),
    pasteText: async (officer, text) => {
      await pasteBox(page, officer).getByRole("textbox").fill(text);
      await page.waitForTimeout(PASTE_SETTLE_MS);
      return readPaste(page, officer);
    },
    undoPaste: (officer) =>
      pasteBox(page, officer).getByRole("button", { name: "Deshacer" }).click(),

    openSavedAdvisors: async (officer) => {
      await page.getByTestId(`saved-advisors-${String(officer)}`).click();
      await advisors(page).waitFor();
      await advisors(page)
        .getByText(/Cargando/)
        .waitFor({ state: "detached" });
    },
    advisorsListTitle: async () =>
      (await advisors(page)
        .getByText(/guardados$/)
        .textContent()) ?? "",
    savedAdvisors: async () =>
      (await advisors(page).getByTestId("saved-advisor").allInnerTexts()).map((row) =>
        row.replace(/\s*✕\s*$/, "").trim(),
      ),
    // A person answers in the window that took the place of the question of the browser.
    saveCurrentAdvisorAs: async (name) => {
      await advisors(page).getByRole("button", { name: "+ Guardar el actual" }).click();
      const window = page.getByRole("dialog");
      await window.getByRole("textbox").fill(name);
      await window.getByRole("button", { name: "Guardar" }).click();
      await advisors(page).waitFor({ state: "detached" });
    },
    pressDeleteSavedAdvisor: (name) =>
      advisors(page)
        .getByRole("button", { name: `Eliminar ${name}` })
        .click(),
    chooseSavedAdvisor: (name) =>
      advisors(page)
        .getByTestId("saved-advisor")
        .filter({ hasText: name })
        .first()
        .getByRole("button")
        .first()
        .click(),
  };
}
