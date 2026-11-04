import { type Page } from "@playwright/test";
import { type HunterDriver } from "../hunter.ts";

const LIST_TIMEOUT_MS = 10_000;
const PREVIEW_TIMEOUT_MS = 15_000;

export function createLegacyHunterDriver(page: Page): HunterDriver {
  const row = (company: string) => page.locator("#hun-list .hun-row", { hasText: company }).first();
  return {
    waitForList: async () => {
      await page.waitForFunction(() => _hunRows !== null && _hunMetaOk && !_hunCargando, null, {
        timeout: LIST_TIMEOUT_MS,
      });
    },
    status: async () => (await page.locator("#hun-estado").textContent()) ?? "",
    rows: () =>
      page.locator("#hun-list .hun-row").evaluateAll((rows) =>
        rows.map((line) => ({
          company: line.querySelector(".hun-emp")?.textContent ?? "",
          flyer: line.querySelector(".hun-tag")?.textContent ?? "",
          warnings: line.querySelector(".hun-av")?.textContent ?? "",
          canDraw: !line.classList.contains("hun-no"),
          canPropose: Boolean(line.querySelector(".hun-prop-btn")),
          proposalTag: line.querySelector(".hun-prop-tag")?.textContent ?? "",
        })),
      ),
    search: (text) => page.locator("#hun-q").fill(text),
    pressInSearch: (key) => page.locator("#hun-q").press(key),
    choose: (company) => row(company).locator(".hun-emp").click(),
    waitForPreview: async () => {
      await page.waitForFunction(
        () => {
          const empty = document.querySelector<HTMLElement>("#hun-vacio");
          const image = document.querySelector<HTMLElement>("#hun-img");
          const painted =
            image?.style.display !== "none" && (image?.getClientRects().length ?? 0) > 0;
          return (
            painted || (Boolean(empty?.textContent) && !/Armando/.test(empty?.textContent ?? ""))
          );
        },
        null,
        { timeout: PREVIEW_TIMEOUT_MS },
      );
      return page.evaluate(() => {
        const image = document.querySelector<HTMLElement>("#hun-img");
        const button = document.querySelector<HTMLButtonElement>("#hun-dl");
        return {
          shown: image?.style.display !== "none" && (image?.getClientRects().length ?? 0) > 0,
          message: document.querySelector<HTMLElement>("#hun-vacio")?.innerText ?? "",
          canDownload: !button?.disabled,
        };
      });
    },
    download: async () => {
      await page.evaluate(() => _lib("jspdf"));
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.locator("#hun-dl").click(),
      ]);
      return download.suggestedFilename();
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
          if (window._hunV) fullRes(window._hunV);
        } finally {
          context.fillText = fillText;
        }
        return texts;
      }),
    wheel: async (ctrl) => {
      const box = await page.locator(".hun-prev").boundingBox();
      if (!box) throw new Error("The preview is not on screen");
      await page.mouse.move(box.x + box.width / 2, box.y + 200);
      if (ctrl) await page.keyboard.down("Control");
      await page.mouse.wheel(0, -120);
      await page.waitForTimeout(120);
      if (ctrl) await page.keyboard.up("Control");
      return Number(((await page.locator("#hun-zoom-pct").textContent()) ?? "").replace(/\D/g, ""));
    },
    zoomPercent: async () =>
      Number(((await page.locator("#hun-zoom-pct").textContent()) ?? "").replace(/\D/g, "")),

    startMultiple: async () => {
      await page.locator("#hun-otros .fg-otros-tg").click();
      await page.locator("#hun-otros-multi").click();
    },
    tick: (company) => row(company).locator(".hun-chk").check(),
    ticked: () => page.locator("#hun-multi-sel .hun-sel-e").allInnerTexts(),
    untick: (company) =>
      page
        .locator("#hun-multi-sel .hun-sel-row", { hasText: company })
        .locator(".hun-sel-x")
        .click(),
    downloadTickedWithShortcut: async () => {
      await page.evaluate(() => Promise.all([_lib("jspdf"), _lib("jszip")]));
      await page.locator("#hun-q").focus();
      const downloading = page.waitForEvent("download");
      await page.keyboard.press("Control+Enter");
      await page.locator("#fg-cf-ok").click();
      return (await downloading).suggestedFilename();
    },

    openProposal: (company) => row(company).locator(".hun-prop-btn").click(),
    proposalTitle: async () => (await page.locator("#pad-upd h3").textContent()) ?? "",
    fillProposalOfficer: async (slot, name, phone) => {
      const fields = page
        .locator(".hp-slots > *")
        .nth(slot - 1)
        .locator("input");
      await fields.nth(0).fill(name);
      await fields.nth(1).fill(phone);
    },
    fillProposalNote: (text) => page.locator("#hun-prop-nota").fill(text),
    sendProposal: () => page.locator("#hun-prop-enviar").click(),
    canSendProposal: () => page.locator("#hun-prop-enviar").isEnabled(),
    proposalWindowText: async () => (await page.locator("#pad-upd").textContent()) ?? "",
    proposalOfficerName: (slot) =>
      page
        .locator(".hp-slots > *")
        .nth(slot - 1)
        .locator("input")
        .first()
        .inputValue(),
    proposalWindowOpen: async () => (await page.locator("#hun-prop-enviar").count()) > 0,
    openMyProposals: async () => {
      await page.locator(".hdr-user-btn").click();
      await page.locator("#hdr-dd-hunprop").click();
      await page.locator("#mis-cambios-list :is(.prop-card, .prop-vacio)").first().waitFor();
    },
    myProposals: () =>
      page.locator("#mis-cambios-list .prop-card").evaluateAll((cards) =>
        cards.map((card) => ({
          company: card.querySelector(".prop-emp")?.textContent ?? "",
          text: card instanceof HTMLElement ? card.innerText : "",
          buttons: Array.from(card.querySelectorAll("button"), (button) => button.textContent),
        })),
      ),
    pressAnswer: (company) =>
      page
        .locator("#mis-cambios-list .prop-card", { hasText: company })
        .getByRole("button", { name: "Responder" })
        .click(),
  };
}
