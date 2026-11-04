import { type Page } from "@playwright/test";
import { type OfficersDriver, type PasteOutcome } from "../officers.ts";

const PASTE_SETTLE_MS = 400;
const PASTE_TIMEOUT_MS = 2_000;

const suffix = (officer: number) => (officer === 1 ? "" : String(officer));
const field = (name: string, officer: number) => `#${name}${suffix(officer)}`;

/** Runs in the page. */
function readBlocks(): number[] {
  const shown: number[] = [];
  for (let officer = 1; officer <= 8; officer += 1) {
    const fields = document.querySelector<HTMLElement>(`#fields${String(officer)}`);
    if (fields && fields.getClientRects().length > 0) shown.push(officer);
  }
  return shown;
}

async function readPaste(page: Page, officer: number): Promise<PasteOutcome> {
  const result = page.locator(`#fg-paste-res-${String(officer)}`);
  await result.locator(".fg-paste-chips, .fg-paste-warn").waitFor({ timeout: PASTE_TIMEOUT_MS });
  const chips = await result.locator(".fg-paste-chip").allInnerTexts();
  const has = (word: string) => chips.some((chip) => chip.includes(word) && chip.includes("✓"));
  return {
    recognized: { name: has("Nombre"), phone: has("Celular"), email: has("Mail") },
    text: (await result.innerText()).replace(/\s+/g, " ").trim(),
  };
}

export function createLegacyOfficersDriver(page: Page): OfficersDriver {
  return {
    read: async (officer) => ({
      name: await page.locator(field("nombre", officer)).inputValue(),
      phone: await page.locator(field("celular", officer)).inputValue(),
      email: await page.locator(field("email", officer)).inputValue(),
    }),
    fill: async (officer, { name, phone, email }) => {
      if (name !== undefined) await page.locator(field("nombre", officer)).fill(name);
      if (phone !== undefined) await page.locator(field("celular", officer)).fill(phone);
      if (email !== undefined) await page.locator(field("email", officer)).fill(email);
    },
    shownBlocks: () => page.evaluate(readBlocks),
    addButtonLabel: async () => {
      const button = page.locator("#fg-add-asesor");
      return (await button.isVisible()) ? ((await button.textContent()) ?? "") : null;
    },
    pressAdd: () => page.locator("#fg-add-asesor").click(),
    pressRemove: (officer) => page.locator(`#fg-sec-acts-${String(officer)} .fg-del`).click(),
    controls: (officer) =>
      page.locator(`#fg-sec-acts-${String(officer)}`).evaluate((box) =>
        Array.from(box.children, (control) => ({
          label: control.textContent?.trim() ?? "",
          height: Math.round(control.getBoundingClientRect().height),
          isKeyboardButton:
            control.getAttribute("role") === "button" && control.getAttribute("tabindex") === "0",
        })),
      ),
    switchIsOn: async () =>
      (await page.locator("#fg-of-sw").getAttribute("aria-checked")) === "true",
    pressSwitch: () => page.locator("#fg-of-sw").click(),
    blocksHiddenBySwitch: () => page.locator(".fg-of-off-msg").isVisible(),

    pasteOffered: () =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>(".fg-paste-btn"))
          .filter((button) => button.getClientRects().length > 0)
          .map((button) => Number(button.id.replace(/\D/g, ""))),
      ),
    pressPaste: (officer) => page.locator(`#fg-paste-btn-${String(officer)}`).click(),
    pressPasteWithKeyboard: async (officer) => {
      const button = page.locator(`#fg-paste-btn-${String(officer)}`);
      await button.focus();
      await page.keyboard.press("Enter");
    },
    pasteBoxOpen: (officer) => page.locator(`#fg-paste-${String(officer)}`).isVisible(),
    pasteText: async (officer, text) => {
      await page.locator(`#fg-paste-ta-${String(officer)}`).fill(text);
      await page.waitForTimeout(PASTE_SETTLE_MS);
      return readPaste(page, officer);
    },
    undoPaste: (officer) => page.locator(`#fg-paste-res-${String(officer)} .fg-paste-undo`).click(),

    openSavedAdvisors: async (officer) => {
      await page
        .locator("#tab-individual .sec-clickable", { hasText: `Asesor ${String(officer)}` })
        .first()
        .click({ position: { x: 4, y: 4 } });
      await page.locator("#as-pop").waitFor();
    },
    advisorsListTitle: async () => (await page.locator("#as-pop .as-pop-head").textContent()) ?? "",
    savedAdvisors: () => page.locator("#as-pop .as-item-name").allInnerTexts(),
    saveCurrentAdvisorAs: async (name) => {
      await page.evaluate((answer) => {
        // The app asks the name with a window of the browser, which the harness dismisses.
        window.prompt = () => answer;
      }, name);
      await page.locator("#as-pop .as-act").click();
      await page.locator("#as-pop").waitFor({ state: "detached" });
    },
    pressDeleteSavedAdvisor: (name) =>
      page.locator("#as-pop .as-item", { hasText: name }).locator(".as-del").click(),
    chooseSavedAdvisor: (name) =>
      page.locator("#as-pop .as-item", { hasText: name }).first().click(),
  };
}
