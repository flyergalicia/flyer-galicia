import { type Page } from "@playwright/test";
import {
  type DesignToSave,
  type NoRoomForDrafts,
  type LostUploadReading,
  type SameKeyColors,
  type SaveDialog,
  type ShareDialog,
  type StudioCard,
  type StudioDriver,
  type StudioFilter,
} from "../studio.ts";

const CARD = ".est-card";
const SAVE_BUTTON = "#fg-lg-guardar";
const SAVE_WINDOW = "#fg-est-ov";
const SHARE_WINDOW = "#fg-comp-ov";
const SHOWN_TIMEOUT_MS = 15_000;
const SOON_TIMEOUT_MS = 8000;
const PUBLISH_TIMEOUT_MS = 30_000;
// Reading the conversation and the list goes on a moment after an answer is saved.
const ANSWER_SETTLE_MS = 800;
const PUBLISHED_SETTLE_MS = 500;
const DIALOG_SETTLE_MS = 200;
// _fgLgAvisarFaltan warns 1.5 s after the notice that a draft opened.
const HISTORY_NOTICE_MS = 2200;
const FILTER_NAMES: Record<StudioFilter, string> = {
  mine: "mios",
  all: "todos",
  requests: "pedidos",
};

function base64(bytes: Buffer): string {
  return bytes.toString("base64");
}

function readCards(page: Page): Promise<StudioCard[]> {
  return page.locator(CARD).evaluateAll((cards) =>
    cards.map((card) => {
      const read = (selector: string) => card.querySelector(selector)?.textContent ?? "";
      return {
        id: card.querySelector("button[data-acc]")?.getAttribute("data-id") ?? "",
        name: read(".est-nom"),
        status: read(".est-estado"),
        buttons: [...card.querySelectorAll("button")].map((button) =>
          (button.textContent ?? "").trim(),
        ),
        messages: card.querySelectorAll(".est-msg").length,
        conversation: read(".est-hilo"),
        sharedNote: read(".est-comp"),
      };
    }),
  );
}

async function open(page: Page): Promise<void> {
  await page.locator("#apptab-estudio").click();
  await page.waitForFunction(
    () => Boolean(document.getElementById("est-grid")) && _EST.lista !== null && !_EST.cargando,
    null,
    { timeout: SHOWN_TIMEOUT_MS },
  );
}

async function reloadList(page: Page): Promise<void> {
  await page.evaluate(() => {
    _EST.lista = null;
    _estCargar();
  });
  await page.waitForFunction(() => _EST.lista !== null && !_EST.cargando, null, {
    timeout: SOON_TIMEOUT_MS,
  });
}

async function refreshNow(page: Page): Promise<void> {
  await page.evaluate(() => {
    _estPoll();
  });
  await page.waitForFunction(() => !_EST.cargando, null, { timeout: SOON_TIMEOUT_MS });
}

/** For a wait whose outcome the check that follows tells: a timeout is not a failure by itself. */
async function tolerateTimeout(waiting: Promise<unknown>): Promise<void> {
  await waiting.catch(() => undefined);
}

async function readSaveDialog(page: Page): Promise<SaveDialog> {
  const mode = page.locator("input[name=fg-est-modo]");
  return {
    text: await page.locator(SAVE_WINDOW).innerText(),
    offersSameDesign: (await mode.and(page.locator("[value=mismo]")).count()) > 0,
    offersChoice: (await mode.count()) > 0,
  };
}

async function openSaveDialog(page: Page): Promise<SaveDialog> {
  await page.evaluate(() => {
    _fgLgBarra();
  });
  await page.locator(SAVE_BUTTON).click();
  await page.locator("#fg-est-nom").waitFor({ timeout: SHOWN_TIMEOUT_MS });
  return readSaveDialog(page);
}

async function confirmSave(page: Page, { name, company }: DesignToSave): Promise<void> {
  if (name !== undefined) await page.locator("#fg-est-nom").fill(name);
  if (company !== undefined) await page.locator("#fg-est-emp").fill(company);
  await page.locator("#fg-est-ok").click();
  await page.locator(SAVE_WINDOW).waitFor({ state: "detached", timeout: SOON_TIMEOUT_MS });
}

function cardButton(page: Page, action: string, id?: string) {
  const selector = `${CARD} button[data-acc=${action}]`;
  return id === undefined
    ? page.locator(selector).first()
    : page.locator(`${selector}[data-id="${id}"]`);
}

async function use(page: Page, id?: string): Promise<void> {
  const button = cardButton(page, "usar", id);
  const design = await button.getAttribute("data-id");
  const turn = await page.evaluate(() => _fgProtoTurno);
  await button.click();
  // That design may be the one already open. Asking for it takes one turn and opening it another.
  await page.waitForFunction(
    ({ openId, before }) =>
      _fgProtoTurno >= before + 2 && _fgProtoAct === openId && !_fgBorr.ocupado,
    { openId: design, before: turn },
    { timeout: SHOWN_TIMEOUT_MS },
  );
}

async function answerPrompt(page: Page, text: string): Promise<void> {
  await page.locator("#fg-pt-i").waitFor({ timeout: SHOWN_TIMEOUT_MS });
  await page.locator("#fg-pt-i").fill(text);
  await page.locator("#fg-pt-ok").click();
}

async function requestPublication(page: Page): Promise<void> {
  const button = cardButton(page, "pedir");
  const design = await button.getAttribute("data-id");
  await button.click();
  await page.locator("#fg-cf-ok").click({ timeout: SHOWN_TIMEOUT_MS });
  await tolerateTimeout(
    page.waitForFunction(
      (id) => _EST.lista?.find((row) => row.id === id)?.estado === "pedido",
      design,
      { timeout: SOON_TIMEOUT_MS },
    ),
  );
}

async function approve(page: Page, flyerName: string): Promise<void> {
  await cardButton(page, "aprobar").click();
  await answerPrompt(page, flyerName);
  await page.waitForFunction(() => !_EST.publicando, null, { timeout: PUBLISH_TIMEOUT_MS });
  await page.waitForTimeout(PUBLISHED_SETTLE_MS);
}

async function approveTwiceAtOnce(
  page: Page,
  { design, flyerName, secondName }: { design: string; flyerName: string; secondName: string },
): Promise<void> {
  await cardButton(page, "aprobar").click();
  await answerPrompt(page, flyerName);
  await page.evaluate(
    ({ id, name }) => {
      _estPublicar(id, _estBuscar(id), _optN(_fgOpt), name);
    },
    { id: design, name: secondName },
  );
  await page.waitForFunction(() => !_EST.publicando, null, { timeout: PUBLISH_TIMEOUT_MS });
  await page.waitForTimeout(PUBLISHED_SETTLE_MS);
}

async function readShareDialog(page: Page): Promise<ShareDialog> {
  return {
    people: await page.locator(`${SHARE_WINDOW} .fg-comp-n`).allTextContents(),
    text: (await page.locator("#fg-comp-l").textContent()) ?? "",
    confirmEnabled: await page.locator("#fg-comp-ok").isEnabled(),
    confirmLabel: (await page.locator("#fg-comp-ok").textContent()) ?? "",
  };
}

async function proposeSource(
  page: Page,
  file: { name: string; mimeType: string; buffer: Buffer },
  name: string,
): Promise<void> {
  await page.locator("#est-fu-file").setInputFiles(file);
  await answerPrompt(page, name);
  await page.waitForFunction(() => !_EST_FU.ocupado, null, { timeout: SHOWN_TIMEOUT_MS });
  await page.waitForTimeout(PUBLISHED_SETTLE_MS);
}

function saveSourcesWhenForbidden(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const realFetch = window.fetch;
    window.fetch = (address, options) =>
      (address instanceof Request ? address.url : address.toString()).includes("_fuentes.json")
        ? Promise.resolve(new Response("{}", { status: 403 }))
        : realFetch(address, options);
    try {
      await _estFuGuardarLista(() => []);
      return "saved";
    } catch (error) {
      return String(error);
    } finally {
      window.fetch = realFetch;
    }
  });
}

function uploadKeysOfSameFile(page: Page, file: Buffer, name: string): Promise<string[]> {
  return page.evaluate(
    async ({ content, fileName }) => {
      const bytes = Uint8Array.from(atob(content), (char) => char.charCodeAt(0));
      const upload = () => _fgLgLeerArchivo(new File([bytes], fileName, { type: "image/png" }));
      const first = await upload();
      const second = await upload();
      // The counter goes back to 0 when the page reloads.
      _fgLgSubidos = 0;
      const third = await upload();
      return [first.clave, second.clave, third.clave];
    },
    { content: base64(file), fileName: name },
  );
}

function reopenHistoryWithLostUpload(
  page: Page,
  file: Buffer,
  name: string,
): Promise<LostUploadReading> {
  return page.evaluate(
    async ({ content, fileName, noticeMs }) => {
      const bytes = Uint8Array.from(atob(content), (char) => char.charCodeAt(0));
      const uploaded = await _fgLgLeerArchivo(new File([bytes], fileName, { type: "image/png" }));
      const place = { x: 100, y: 2000, w: 150, h: 60, bg: "rgb(255,255,255)" };
      _fgLgPoner(place, uploaded.clave, uploaded.nombre, uploaded.logo);
      const logos = structuredClone(_fgLg.list);
      const source = _fgLgSrc();
      _fgLg.list = [];
      Reflect.deleteProperty(window._fgLg.imgs, uploaded.clave);
      _fgHistDiseno({ logos, logosSrc: source, recortes: [] });
      await new Promise((resolve) => {
        setTimeout(resolve, noticeMs);
      });
      return {
        key: uploaded.clave,
        notice: document.getElementById("toast-el")?.textContent ?? "",
        changes: _fgLg.list.length,
        openedInTab: Boolean(_fgProtoAct),
      };
    },
    { content: base64(file), fileName: name, noticeMs: HISTORY_NOTICE_MS },
  );
}

function saveDialogTextWithoutStoredUpload(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const work = _fgProtoBuscar(_fgProtoAct);
    if (!work) throw new Error("There is no open design");
    work.subidos = {};
    fgEstGuardar();
    await new Promise((resolve) => {
      setTimeout(resolve, 200);
    });
    const dialog = document.getElementById("fg-est-ov");
    const text = dialog?.innerText ?? "";
    dialog?.remove();
    return text;
  });
}

function saveDialogTextWithStoredUpload(page: Page, key: string, file: Buffer): Promise<string> {
  return page.evaluate(
    async ({ uploadKey, content }) => {
      const work = _fgProtoBuscar(_fgProtoAct);
      if (!work) throw new Error("There is no open design");
      work.subidos = { [uploadKey]: `data:image/png;base64,${content}` };
      fgEstGuardar();
      await new Promise((resolve) => {
        setTimeout(resolve, 200);
      });
      return document.getElementById("fg-est-ov")?.innerText ?? "";
    },
    { uploadKey: key, content: base64(file) },
  );
}

function colorsOfDesignsSharingKey(page: Page): Promise<SameKeyColors> {
  return page.evaluate(async () => {
    const key = "pc:1:logo.png";
    const canvas = document.createElement("canvas");
    canvas.width = 4;
    canvas.height = 4;
    const graphics = canvas.getContext("2d");
    if (!graphics) throw new Error("No canvas context");
    const solid = (color: string) => {
      graphics.fillStyle = color;
      graphics.fillRect(0, 0, 4, 4);
      return canvas.toDataURL("image/png");
    };
    const red = solid("#ff0000");
    const blue = solid("#0000ff");
    const pixel = () => {
      const data = window._fgLg.imgs[key]?.getContext("2d")?.getImageData(1, 1, 1, 1).data;
      return Array.from(data?.slice(0, 3) ?? []);
    };
    Reflect.deleteProperty(window._fgLg.imgs, key);
    Reflect.deleteProperty(window._fgLg.imgsDe, key);
    await _estPrepararSubidos({ [key]: red });
    const first = pixel();
    await _estPrepararSubidos({ [key]: blue });
    const second = pixel();
    await _estPrepararSubidos({ [key]: red });
    return { first, second, third: pixel() };
  });
}

function saveDraftsWithoutRoom(page: Page, file: Buffer): Promise<NoRoomForDrafts> {
  return page.evaluate((content) => {
    const realSetItem: typeof Storage.prototype.setItem = Reflect.get(Storage.prototype, "setItem");
    const big = `data:image/png;base64,${content.repeat(3)}`;
    _fgBorr.revisado = true;
    const draft = _fgBorradorCrear(_optN(_fgOpt));
    draft.cambios = [{ img: "pc:q:a.png", t: "a", x: 0, y: 0, w: 10, h: 10 }];
    draft.subidos = { "pc:q:a.png": big };
    _fgBorr.pendientes = [
      {
        id: "x",
        opcion: _optN(_fgOpt),
        nombre: "Pendiente",
        cambios: [{ img: "pc:z:b.png" }],
        recortes: [],
        legal: null,
        subidos: { "pc:z:b.png": big },
      },
    ];
    const toast = document.getElementById("toast-el");
    Storage.prototype.setItem = function setItem(key, value) {
      if (value.length > 20_000) throw new DOMException("quota", "QuotaExceededError");
      realSetItem.call(this, key, value);
    };
    _fgBorr.avisoGrande = false;
    _fgBorr.avisoSinLugar = false;
    _fgBorrGuardar();
    const saved: { lista: LegacyPendingDraft[] } = JSON.parse(
      localStorage.getItem(_fgBorrClave()) ?? '{"lista":[]}',
    );
    const firstNotice = toast?.textContent ?? "";
    const pendingKeepsItsLogo = Boolean(_fgBorr.pendientes?.[0]?.subidos["pc:z:b.png"]);
    const openDraftLogos = Object.keys(draft.subidos).length;
    // And now it does not fit even without the logos.
    Storage.prototype.setItem = () => {
      throw new DOMException("quota", "QuotaExceededError");
    };
    if (toast) toast.textContent = "";
    _fgBorrGuardar();
    const secondNotice = toast?.textContent ?? "";
    Storage.prototype.setItem = realSetItem;
    return {
      savedLogos: saved.lista.map((entry) => Object.keys(entry.subidos).length),
      firstNotice,
      pendingKeepsItsLogo,
      openDraftLogos,
      secondNotice,
      warnedNoRoom: Boolean(Reflect.get(_fgBorr, "avisoSinLugar")),
    };
  }, base64(file));
}

function recoverDraftWithLostUpload(page: Page): Promise<string> {
  return page.evaluate(() => {
    _fgBorr.pendientes = [
      {
        id: "y",
        opcion: _optN(_fgOpt),
        nombre: "Viejo",
        cambios: [{ img: "pc:z:b.png", t: "b" }],
        recortes: [],
        legal: null,
        subidos: {},
      },
    ];
    _fgBorrRecuperar();
    return document.getElementById("toast-el")?.textContent ?? "";
  });
}

async function redownloadHistoryWithLostUpload(page: Page): Promise<string> {
  await page.evaluate(() => {
    const values = getVals();
    values.logos = [{ img: "pc:perdido:c.png", t: "c", x: 10, y: 10, w: 100, h: 40 }];
    values.logosSrc = _fgLgSrc();
    flyerHistory.unshift({
      v: values,
      fn: "conlogo",
      thumb: "",
      hora: "1:00",
      ts: 1,
      ac: 0,
      opt: _optN(_fgOpt),
    });
    fgRedlPDF(0);
  });
  await page.locator("#fg-cf-ok").waitFor({ timeout: SHOWN_TIMEOUT_MS });
  return page.locator(".fg-cf").innerText();
}

async function askToDeactivateFlyer(page: Page, option: number): Promise<string> {
  await page.evaluate((n) => {
    deactivateFlyer(null, n);
  }, option);
  await page.locator("#fg-cf-ov").waitFor({ timeout: SHOWN_TIMEOUT_MS });
  return (await page.locator("#fg-cf-t").textContent()) ?? "";
}

function flyerListOfConfig(page: Page): Promise<string> {
  return page.evaluate(async () => {
    let list = document.getElementById("upload-history");
    if (!list) {
      list = document.createElement("div");
      list.id = "upload-history";
      document.body.append(list);
    }
    loadUploadHistory();
    for (
      let wait = 0;
      wait < 40 && !(list.textContent ?? "").includes("Sin flyer activo");
      wait += 1
    ) {
      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });
    }
    return list.textContent ?? "";
  });
}

function readingsDriver(page: Page) {
  return {
    isTabVisible: () => page.locator("#apptab-estudio").isVisible(),
    open: () => open(page),
    waitForCards: () => page.locator(CARD).first().waitFor({ timeout: SHOWN_TIMEOUT_MS }),
    reloadList: () => reloadList(page),
    refreshNow: () => refreshNow(page),
    cards: () => readCards(page),
    filters: () =>
      page
        .locator("#est-fil button")
        .evaluateAll((buttons) =>
          buttons.map((button) => (button.textContent ?? "").replace(/\s+/g, " ").trim()),
        ),
    showFilter: (filter: StudioFilter) =>
      page.locator(`#est-fil button[data-f=${FILTER_NAMES[filter]}]`).click(),
    tabBadge: () =>
      page.evaluate(() => {
        const badge = document.getElementById("est-tab-badge");
        return badge && badge.style.display !== "none" ? (badge.textContent ?? "") : "";
      }),
    headerMessages: async () => ({
      visible: await page.locator("#hdr-msg").isVisible(),
      explanation: await page.evaluate(
        () => document.getElementById("hdr-msg")?.parentElement?.title ?? "",
      ),
    }),
    openQuestions: () => page.evaluate(() => _estAv.consulta.length),
    sharedWithMe: () => page.evaluate(() => _estAv.comp),
    waitForOpenQuestions: (count: number) =>
      tolerateTimeout(
        page.waitForFunction((n) => _estAv.consulta.length === n, count, {
          timeout: SOON_TIMEOUT_MS,
        }),
      ),
    waitForSharedWithMe: (count: number) =>
      tolerateTimeout(
        page.waitForFunction((n) => _estAv.comp === n, count, { timeout: SOON_TIMEOUT_MS }),
      ),
    intro: async () => (await page.locator(".est-sub").first().textContent()) ?? "",
    savedBrandsSectionShown: async () => (await page.locator("#est-mg-lista").count()) > 0,
    waitForConversation: (messages: number) =>
      tolerateTimeout(
        page.waitForFunction(
          (n) => document.querySelectorAll(".est-card .est-msg").length === n,
          messages,
          { timeout: SOON_TIMEOUT_MS },
        ),
      ),
    waitForStatus: (status: string) =>
      page
        .locator(`${CARD} .est-estado`, { hasText: status })
        .first()
        .waitFor({ timeout: SOON_TIMEOUT_MS }),
  };
}

function savingDriver(page: Page) {
  return {
    saveButton: async () => {
      const button = page.locator(SAVE_BUTTON);
      return {
        visible: await button.isVisible(),
        label: (await button.textContent()) ?? "",
      };
    },
    openDesignLabel: async () => (await page.locator("#fg-lg-proy").textContent()) ?? "",
    openSaveDialog: () => openSaveDialog(page),
    confirmSave: (design: DesignToSave) => confirmSave(page, design),
    save: async (design: DesignToSave) => {
      await openSaveDialog(page);
      await confirmSave(page, design);
    },
    uploadedLogoInMemory: () =>
      page.evaluate(() => {
        const { imgs } = window._fgLg;
        const key = Object.keys(imgs).find((name) => name.startsWith("pc:"));
        return key !== undefined && Boolean(imgs[key]);
      }),
  };
}

function cardActionsDriver(page: Page) {
  return {
    use: (id?: string) => use(page, id),
    requestPublication: () => requestPublication(page),
    openCompleteView: async () => {
      await cardButton(page, "ver").click();
      const view = page.locator("#fg-ver-ov canvas");
      await view.waitFor({ timeout: SHOWN_TIMEOUT_MS });
      return { height: Number(await view.getAttribute("height")) };
    },
    closeCompleteView: () => page.locator("#fg-ver-ok").click(),
    completeViewOpen: async () => (await page.locator("#fg-ver-ov").count()) > 0,
    approveVisibleInCompleteView: () => page.locator("#fg-ver-apr").isVisible(),
    approve: (flyerName: string) => approve(page, flyerName),
    reject: async (note: string) => {
      await cardButton(page, "rechazar").click();
      await answerPrompt(page, note);
      await page.waitForTimeout(ANSWER_SETTLE_MS);
    },
    ask: async (question: string) => {
      await cardButton(page, "preguntar").click();
      await answerPrompt(page, question);
    },
    answer: async (text: string) => {
      await cardButton(page, "responder").click();
      await answerPrompt(page, text);
    },
    approveTwiceAtOnce: (design: string, flyerName: string, secondName: string) =>
      approveTwiceAtOnce(page, { design, flyerName, secondName }),
    publishDirectly: async (design: string, option: number, flyerName: string) => {
      await page.evaluate(
        ({ id, n, name }) => {
          _estPublicar(id, {}, n, name);
        },
        { id: design, n: option, name: flyerName },
      );
      await page.waitForFunction(() => !_EST.publicando, null, { timeout: PUBLISH_TIMEOUT_MS });
    },
  };
}

function sharingDriver(page: Page) {
  return {
    openShareDialog: async (options?: { onlyOriginalDesign: boolean }) => {
      const selector = options?.onlyOriginalDesign
        ? `${CARD}:not(:has(.est-comp)) button[data-acc=compartir]`
        : `${CARD} button[data-acc=compartir]`;
      await page.locator(selector).first().click();
      await page.locator(`${SHARE_WINDOW} .fg-comp-it`).first().waitFor({
        timeout: SHOWN_TIMEOUT_MS,
      });
    },
    shareDialog: () => readShareDialog(page),
    searchPeopleToShare: (text: string) => page.locator("#fg-comp-q").fill(text),
    tickFirstPersonToShare: () =>
      page.locator(`${SHARE_WINDOW} input[type=checkbox]`).first().check(),
    confirmShare: async () => {
      await page.locator("#fg-comp-ok").click();
      await page.locator(SHARE_WINDOW).waitFor({ state: "detached", timeout: SOON_TIMEOUT_MS });
      await page.waitForTimeout(DIALOG_SETTLE_MS);
    },
    profileHasOption: (option: number) => page.evaluate((n) => _can(`opcion_${String(n)}`), option),
    canUseOption: (option: number) => page.evaluate((n) => _canOpt(n), option),
  };
}

function sourcesDriver(page: Page) {
  return {
    sourcesButtonLabel: async () => (await page.locator("#est-fu-subir").textContent()) ?? "",
    waitForSourcesButton: () =>
      page.locator("#est-fu-subir").waitFor({ timeout: SHOWN_TIMEOUT_MS }),
    proposeSource: (file: { name: string; mimeType: string; buffer: Buffer }, name: string) =>
      proposeSource(page, file, name),
    waitForSourceToApprove: () =>
      page
        .locator("#est-fu-lista button[data-fu=aprobar]")
        .first()
        .waitFor({ timeout: SHOWN_TIMEOUT_MS }),
    approveFirstSource: async () => {
      await page.locator("#est-fu-lista button[data-fu=aprobar]").first().click();
      await page.waitForFunction(() => !_EST_FU.ocupado, null, { timeout: 20_000 });
      await page.waitForTimeout(PUBLISHED_SETTLE_MS);
    },
    removeSource: async (id: string) => {
      await page.locator(`#est-fu-lista button[data-fu=quitar][data-id=${id}]`).click();
      await page.locator("#fg-cf-ok").click();
      await page.waitForTimeout(ANSWER_SETTLE_MS);
    },
    saveSourcesWhenListIsForbidden: () => saveSourcesWhenForbidden(page),
  };
}

function uploadsDriver(page: Page) {
  return {
    uploadKeysOfSameFile: (file: Buffer, name: string) => uploadKeysOfSameFile(page, file, name),
    reopenHistoryWithLostUpload: (file: Buffer, name: string) =>
      reopenHistoryWithLostUpload(page, file, name),
    saveDialogTextWithoutStoredUpload: () => saveDialogTextWithoutStoredUpload(page),
    saveDialogTextWithStoredUpload: (key: string, file: Buffer) =>
      saveDialogTextWithStoredUpload(page, key, file),
    fillSaveDialogAndSave: (name: string) => confirmSave(page, { name }),
    colorsOfDesignsSharingKey: () => colorsOfDesignsSharingKey(page),
    saveDraftsWithoutRoom: (file: Buffer) => saveDraftsWithoutRoom(page, file),
    recoverDraftWithLostUpload: () => recoverDraftWithLostUpload(page),
    redownloadHistoryWithLostUpload: () => redownloadHistoryWithLostUpload(page),
  };
}

export function createLegacyStudioDriver(page: Page): StudioDriver {
  return {
    ...readingsDriver(page),
    ...savingDriver(page),
    ...cardActionsDriver(page),
    ...sharingDriver(page),
    ...sourcesDriver(page),
    ...uploadsDriver(page),
    askToDeactivateFlyer: (option) => askToDeactivateFlyer(page, option),
    flyerListOfConfig: () => flyerListOfConfig(page),
    listedDesigns: () => page.evaluate(() => (_EST.lista ?? []).map((row) => row.nombre)),
  };
}
