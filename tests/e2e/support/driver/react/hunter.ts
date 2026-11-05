import { type Locator, type Page } from "@playwright/test";
import { type HunterDriver } from "../hunter.ts";

const LIST_TIMEOUT_MS = 10_000;
const PREVIEW_TIMEOUT_MS = 15_000;
const GENERATE = "Generar";

export function hunterRows(page: Page): Locator {
  return page.getByTestId("hunter-row");
}

function row(page: Page, company: string): Locator {
  return hunterRows(page).filter({ hasText: company }).first();
}

function searchField(page: Page): Locator {
  return page.getByRole("textbox", { name: "Empresa", exact: true });
}

function dialog(page: Page): Locator {
  return page.getByTestId("decision-dialog");
}

function slot(page: Page, number: number): Locator {
  return dialog(page)
    .getByTestId("proposal-slot")
    .nth(number - 1);
}

async function waitForTheList(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const text = document.querySelector('[data-testid="hunter-status"]')?.textContent ?? "";
      return document.querySelector('[data-testid="hunter-list"]') && !text.startsWith("Buscando");
    },
    null,
    { timeout: LIST_TIMEOUT_MS },
  );
}

async function zoomPercent(page: Page): Promise<number> {
  const text = await page.getByTestId("hunter-preview").getByTestId("zoom-percent").textContent();
  return Number((text ?? "").replace(/\D/g, ""));
}

export function createReactHunterDriver(page: Page): HunterDriver {
  const preview = page.getByTestId("hunter-preview");
  const picture = preview.getByRole("img", { name: "Flyer de la empresa elegida" });
  const message = page.getByTestId("hunter-preview-message");
  const download = page.getByTestId("hunter-download");
  const ticked = page.getByTestId("hunter-ticked-row");
  return {
    waitForList: () => waitForTheList(page),
    status: async () => (await page.getByTestId("hunter-status").textContent()) ?? "",
    rows: () =>
      hunterRows(page).evaluateAll((lines) =>
        lines.map((line) => {
          const text = (part: string) =>
            line.querySelector(`[data-part="${part}"]`)?.textContent ?? "";
          return {
            company: text("company"),
            flyer: text("flyer"),
            warnings: text("warnings"),
            canDraw: line.getAttribute("data-can-draw") === "true",
            canPropose: line.querySelector('[data-part="propose"]') !== null,
            proposalTag: text("proposal"),
          };
        }),
      ),
    search: (text) => searchField(page).fill(text),
    pressInSearch: (key) => searchField(page).press(key),
    choose: (company) => row(page, company).locator('[data-part="company"]').click(),
    waitForPreview: async () => {
      await page.waitForFunction(
        () => {
          const image = document.querySelector('[data-testid="hunter-preview"] img');
          const text = document.querySelector('[data-testid="hunter-preview-message"]');
          const painted = image instanceof HTMLImageElement && !image.hidden && image.complete;
          return (
            painted || (Boolean(text?.textContent) && !/Armando/.test(text?.textContent ?? ""))
          );
        },
        null,
        { timeout: PREVIEW_TIMEOUT_MS },
      );
      return {
        shown: await picture.isVisible(),
        message: (await message.count()) > 0 ? await message.innerText() : "",
        canDownload: await download.isEnabled(),
      };
    },
    download: async () => {
      const [file] = await Promise.all([page.waitForEvent("download"), download.click()]);
      return file.suggestedFilename();
    },
    drawnTexts: () =>
      page.evaluate(() => {
        const texts: string[] = [];
        const context = CanvasRenderingContext2D.prototype;
        const fillText: CanvasRenderingContext2D["fillText"] = Reflect.get(context, "fillText");
        context.fillText = function spy(text, x, y, maxWidth) {
          texts.push(text);
          fillText.call(this, text, x, y, maxWidth);
        };
        try {
          const values = window["__flyerProbe"]?.hunterPreview?.().values;
          if (values) window["__flyerProbe"]?.flyerReadings?.().renderWith(values);
        } finally {
          context.fillText = fillText;
        }
        return texts;
      }),
    wheel: async (ctrl) => {
      const box = await preview.boundingBox();
      if (!box) throw new Error("The preview is not on screen");
      await page.mouse.move(box.x + box.width / 2, box.y + 200);
      if (ctrl) await page.keyboard.down("Control");
      await page.mouse.wheel(0, -120);
      await page.waitForTimeout(120);
      if (ctrl) await page.keyboard.up("Control");
      return zoomPercent(page);
    },
    zoomPercent: () => zoomPercent(page),

    startMultiple: async () => {
      await page
        .getByTestId("hunter-others")
        .getByRole("button", { name: /^Otros/ })
        .click();
      await page.getByRole("button", { name: "Descarga múltiple" }).click();
    },
    tick: (company) => row(page, company).getByRole("checkbox").check(),
    ticked: () => ticked.locator('[data-part="company"]').allInnerTexts(),
    untick: (company) =>
      ticked.filter({ hasText: company }).getByRole("button", { name: "Quitar" }).click(),
    downloadTickedWithShortcut: async () => {
      await searchField(page).focus();
      const downloading = page.waitForEvent("download");
      await page.keyboard.press("Control+Enter");
      await page.getByRole("alertdialog").getByRole("button", { name: GENERATE }).click();
      return (await downloading).suggestedFilename();
    },

    openProposal: (company) => row(page, company).locator('[data-part="propose"]').click(),
    proposalTitle: async () =>
      (await dialog(page).getByRole("heading").first().textContent()) ?? "",
    fillProposalOfficer: async (number, name, phone) => {
      await slot(page, number)
        .getByRole("textbox", { name: /^Nombre del oficial/ })
        .fill(name);
      await slot(page, number)
        .getByRole("textbox", { name: /^Celular del oficial/ })
        .fill(phone);
    },
    fillProposalNote: (text) => page.getByTestId("proposal-note").fill(text),
    sendProposal: () =>
      dialog(page)
        .getByRole("button", { name: /^(Enviar propuesta|Responder y reenviar|Enviando)/ })
        .click(),
    canSendProposal: () =>
      dialog(page)
        .getByRole("button", { name: /^(Enviar propuesta|Responder y reenviar)/ })
        .isEnabled(),
    proposalWindowText: async () => (await dialog(page).textContent()) ?? "",
    proposalOfficerName: (number) =>
      slot(page, number)
        .getByRole("textbox", { name: /^Nombre del oficial/ })
        .inputValue(),
    proposalWindowOpen: async () => (await page.getByTestId("proposal-note").count()) > 0,
    openMyProposals: async () => {
      await page.getByRole("button", { name: /^Menú de / }).click();
      await page
        .getByRole("menu", { name: "Tu cuenta" })
        .getByRole("menuitem", { name: /Mis propuestas/ })
        .click();
      await page
        .getByTestId("my-proposal-list")
        .locator('[data-testid="my-proposal-card"], :scope:not(:has-text("Cargando"))')
        .first()
        .waitFor();
    },
    myProposals: () =>
      page.getByTestId("my-proposal-card").evaluateAll((cards) =>
        cards.map((card) => ({
          company: card.querySelector('[data-part="company"]')?.textContent ?? "",
          text: card instanceof HTMLElement ? card.innerText : "",
          buttons: Array.from(card.querySelectorAll("button"), (button) => button.textContent),
        })),
      ),
    pressAnswer: (company) =>
      page
        .getByTestId("my-proposal-card")
        .filter({ hasText: company })
        .getByRole("button", { name: "Responder" })
        .click(),
  };
}
