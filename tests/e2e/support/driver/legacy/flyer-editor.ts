import { createHash } from "node:crypto";
import { type Page } from "@playwright/test";
import { type FlyerEditorDriver, type FlyerRegion } from "../flyer-editor.ts";
import { toastText } from "./zip-capture.ts";
import { createFlyerBatches } from "./flyer-batches.ts";
import { createFlyerDownloads } from "./flyer-downloads.ts";
import { createOptionBar } from "./flyer-option-bar.ts";

const NOTICE = "#fg-flyer-falla";
const NOTICE_TIMEOUT_MS = 25_000;
const SHOWN_TIMEOUT_MS = 25_000;
const META_TIMEOUT_MS = 8_000;
const AFTER_DOWNLOAD_MS = 500;

/** Runs in the page: the draft with that id, or the one open now. */
function readDraft(id: string | null) {
  const wanted = id ?? _fgProtoAct;
  const draft = _fgProtos.find((candidate) => candidate.id === wanted);
  const editor: { list: unknown; proy?: { nombre?: string } } = _fgLg;
  return {
    id: _fgProtoAct,
    temporary: Boolean(draft?.temp),
    name: draft?.nombre ?? null,
    designName: editor.proy?.nombre ?? null,
  };
}

async function waitForLoadProblem(page: Page): Promise<string> {
  const notice = page.locator(NOTICE);
  await notice.waitFor({ state: "attached", timeout: NOTICE_TIMEOUT_MS });
  return (await notice.innerText()).replace(/\s+/g, " ").trim();
}

async function downloadRegionDigest(page: Page, region: FlyerRegion): Promise<string> {
  const pixels = await page.evaluate(({ x, y, width, height }) => {
    const full = fullRes(getVals());
    const crop = document.createElement("canvas");
    crop.width = width;
    crop.height = height;
    crop.getContext("2d")?.drawImage(full, x, y, width, height, 0, 0, width, height);
    return crop.toDataURL("image/png");
  }, region);
  return createHash("sha256").update(pixels).digest("hex");
}

export function createLegacyFlyerEditorDriver(page: Page): FlyerEditorDriver {
  return {
    selectOption: (option) =>
      page.evaluate((n) => {
        switchFlyerOption(n);
      }, option),
    reloadOption: (option) =>
      page.evaluate((n) => {
        Reflect.deleteProperty(_fgOptCache, n);
        switchFlyerOption(n);
      }, option),
    waitForOptionShown: async (option) => {
      await page.waitForFunction(
        ({ n, notice }) => {
          const artwork = _fgOptCache[n]?.img;
          return (
            !document.querySelector(notice) &&
            window._fgOpt === n &&
            window._fgPrevGate === false &&
            Boolean(artwork) &&
            baseImg === artwork
          );
        },
        { n: option, notice: NOTICE },
        { timeout: SHOWN_TIMEOUT_MS },
      );
    },
    waitForLoadProblem: () => waitForLoadProblem(page),
    waitForNoLoadProblem: () =>
      page.locator(NOTICE).waitFor({ state: "detached", timeout: NOTICE_TIMEOUT_MS }),
    hasLoadProblem: async () => (await page.locator(NOTICE).count()) > 0,
    retryLoading: () => page.locator(`${NOTICE} button`).click(),
    optionStatus: (option) =>
      page.evaluate(
        (n) => ({
          settled: _fgOptCache[n]?.loaded === true,
          hasArtwork: _optTieneImg(n) ?? null,
          ready: _fgOptLista(n),
        }),
        option,
      ),
    showsArtworkOf: (option) => page.evaluate((n) => baseImg === _fgOptCache[n]?.img, option),
    activeCalibration: () => page.evaluate(() => FLYER_CFG),
    optionCalibration: (option) => page.evaluate((n) => _fgOptCache[n]?.cfg ?? {}, option),
    downloadBlockReason: () => page.evaluate(() => _fgDescargaBloqueo()),
    previewIsOff: () =>
      page.evaluate(() =>
        Boolean(document.querySelector(".cw")?.classList.contains("fg-cw-falla")),
      ),
    setZoom: (zoom) =>
      page.evaluate((value) => {
        ZOOM = value;
        calcSC();
        redrawNow();
      }, zoom),
    restoreDefaults: () =>
      page.evaluate(() => {
        resetVals();
      }),
    downloadRegionDigest: (region) => downloadRegionDigest(page, region),
    fillCompanyName: (name) => page.locator("#empresa").fill(name),
    companyName: () => page.locator("#empresa").inputValue(),
    fillOfficerName: (name) => page.locator("#nombre").fill(name),
    setOfficer: ({ name, phone, email }) =>
      page.evaluate(
        (fields) => {
          _setVal("nombre", fields.name);
          _setVal("celular", fields.phone);
          _setVal("email", fields.email);
        },
        { name, phone, email },
      ),
    setNoCashback: (on) =>
      page.evaluate((value) => {
        _fgSetNoCB(value);
      }, on),
    activeOption: () => page.evaluate(() => _optN(_fgOpt)),
    latestNotice: () => toastText(page),
    downloadPdfToDisk: async () => {
      await page.evaluate(() => _lib("jspdf"));
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.locator("#btn-dl-pdf").click(),
      ]);
      return download.suggestedFilename();
    },
    downloadPngToDisk: async () => {
      await page.locator("#fg-otros .fg-otros-tg").click();
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.locator('#fg-otros-menu button[onclick="dlPNG()"]').click(),
      ]);
      return download.suggestedFilename();
    },
    otherActions: async () => {
      await page.locator("#fg-otros .fg-otros-tg").click();
      const items = await page
        .locator("#fg-otros-menu .fg-otros-item")
        .evaluateAll((entries) =>
          entries.flatMap((entry) =>
            entry.getClientRects().length > 0 ? [entry.textContent.trim()] : [],
          ),
        );
      await page.locator("#fg-otros .fg-otros-tg").click();
      return items;
    },
    shareOffered: () =>
      page.evaluate(() =>
        ["#btn-share", "#modal-share"].every(
          (selector) => document.querySelector<HTMLElement>(selector)?.style.display !== "none",
        ),
      ),
    pressShare: async () => {
      await page.evaluate(() => _lib("jspdf"));
      await page.locator("#fg-otros .fg-otros-tg").click();
      await page.locator("#btn-share").click();
    },
    chooseEditorTab: (name) =>
      page.locator("#layout .tabs .tab:not(.ptab)", { hasText: name }).first().click(),
    historyRows: () => page.locator("#history-list .hist-item").allInnerTexts(),
    editFromHistory: (index) =>
      page
        .locator("#history-list .hist-item")
        .nth(index)
        .getByRole("button", { name: "Editar" })
        .click(),
    fieldWarning: async (kind, officer = 1) => {
      const suffix = officer === 1 ? "" : String(officer);
      const id = `${kind === "phone" ? "celular" : "email"}${suffix}`;
      const message = page.locator(`.field:has(#${id}) .fg-field-msg`);
      return (await message.count()) > 0 ? ((await message.textContent()) ?? "") : "";
    },
    branchesSwitchOffered: async () => {
      await page.locator("#fg-otros .fg-otros-tg").click();
      const offered = await page.locator("#fg-otros-menu .fg-otros-sw").isVisible();
      await page.locator("#fg-otros .fg-otros-tg").click();
      return offered;
    },
    pressBranchesSwitch: async () => {
      await page.locator("#fg-otros .fg-otros-tg").click();
      await page.locator("#fg-otros-menu .fg-otros-sw").click();
    },
    fillBranch: (officer, place) => page.locator(`#ubic${String(officer)}`).fill(place),
    fillBranchesTitle: (title) => page.locator("#sedes-titulo").fill(title),
    typeCompanyInOneFrame: (letters) =>
      page.locator("#empresa").evaluate((field, count) => {
        if (!(field instanceof HTMLInputElement)) return;
        for (let letter = 0; letter < count; letter += 1) {
          field.value += "x";
          field.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }, letters),
    dismissAfterDownload: async () => {
      await page.waitForTimeout(AFTER_DOWNLOAD_MS);
      if ((await page.locator("#pad-upd .pu-no").count()) > 0) {
        await page.locator("#pad-upd .pu-no").click();
      }
    },
    chooseCashback: (name) => page.locator(".cfg-btn", { hasText: name }).first().click(),
    benefitFieldLabels: () => page.locator("#fg-benef-fields label:visible").allInnerTexts(),
    fillBenefitName: (name) => page.locator("#benef-nombre").fill(name),
    fillBenefitCap: (cap) => page.locator("#benef-importe").fill(cap),
    legalText: () => page.locator("#legal-text").inputValue(),
    fillLegal: (text) => page.locator("#legal-text").fill(text),
    selectInLegal: async (start, end) => {
      const field = page.locator("#legal-text");
      await field.focus();
      await field.evaluate(
        (element, range) => {
          if (element instanceof HTMLTextAreaElement) element.setSelectionRange(...range);
        },
        [start, end] as [number, number],
      );
    },
    pressLegalBold: () => page.locator('button[onclick="fgLegalBold()"]').click(),
    pasteInLegal: (html, text) =>
      page.locator("#legal-text").evaluate(
        (field, content) => {
          const clipboardData = new DataTransfer();
          clipboardData.setData("text/html", content.html);
          clipboardData.setData("text/plain", content.text);
          field.dispatchEvent(
            new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }),
          );
        },
        { html, text },
      ),
    scriptRan: () => page.evaluate(() => Boolean(window.__xss)),
    forgetOption: (option) =>
      page.evaluate((n) => {
        Reflect.deleteProperty(_fgOptCache, n);
      }, option),
    checkOptionsInBackground: () =>
      page.evaluate(() => {
        _optMetasPrecarga();
      }),
    waitForOptionKnownWithoutArtwork: async (option) => {
      await page.waitForFunction((n) => _fgOptMeta[n] === false, option, {
        timeout: META_TIMEOUT_MS,
      });
    },
    noCashbackVariantOf: (option) => page.evaluate((n) => _fgVarianteSinCB(n), option),
    boldPartsOfLegal: (text) =>
      page.evaluate(
        (legal) =>
          fgSplitBold(legal)
            .filter((part) => part.bold)
            .map((part) => part.text.trim()),
        text,
      ),
    screenLayoutAroundDownload: () =>
      page.evaluate(() => {
        redrawNow();
        const before = { extraHeight: _fgExtra, contentBottom: window._fgContentBottomBase };
        fullRes({
          ...getVals(),
          has1: true,
          nombre: "A",
          has2: true,
          nombre2: "B",
          has3: true,
          nombre3: "C",
          has4: true,
          nombre4: "D",
        });
        const after = { extraHeight: _fgExtra, contentBottom: window._fgContentBottomBase };
        return { before, after };
      }),
    redrawFlyer: (times) =>
      page.evaluate(async (count) => {
        for (let round = 0; round < count; round += 1) {
          redrawNow();
          await new Promise((resolve) => {
            setTimeout(resolve, 40);
          });
        }
      }, times),
    startSavingDesign: async (name) => {
      await page.evaluate(() => {
        fgEstGuardar();
      });
      await page.locator("#fg-est-nom").fill(name);
      await page.locator("#fg-est-ok").click();
    },
    newDraft: () =>
      page.evaluate(() => {
        fgBorradorNuevo();
      }),
    openDraft: () => page.evaluate(readDraft, null),
    draftById: (id) => page.evaluate(readDraft, id),
    currentOption: () => page.evaluate(() => _optN(_fgOpt)),
    ...createFlyerDownloads(page),
    ...createFlyerBatches(page),
    ...createOptionBar(page),
  };
}
