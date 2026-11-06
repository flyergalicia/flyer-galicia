import { type Locator, type Page, type Route } from "@playwright/test";
import {
  type DesignToSave,
  type LostUploadReading,
  type NoRoomForDrafts,
  type SameKeyColors,
  type SaveDialog,
  type ShareDialog,
  type StudioCard,
  type StudioDriver,
  type StudioFilter,
} from "../studio.ts";
import { createReactAdminDriver } from "./admin.ts";
import { createReactLogoEditorDriver } from "./logo-editor.ts";

const SHOWN_TIMEOUT_MS = 15_000;
const SOON_TIMEOUT_MS = 8000;
const PUBLISH_TIMEOUT_MS = 30_000;
const SETTLE_MS = 500;
const SLOW_RESERVE_MS = 700;
const OTHER_TAB = /^(?!Estudio)/;
const DESIGNS_TABLE = "**/rest/v1/flyer_disenos*";
const SOURCES_FILE = "**/_fuentes.json*";
const CAPTION = "Estudio";

function cards(page: Page): Locator {
  return page.getByTestId("design-card");
}

function card(page: Page, id?: string): Locator {
  return id === undefined
    ? cards(page).first()
    : page.locator(`[data-testid="design-card"][data-design="${id}"]`);
}

function cardButton(page: Page, name: string, id?: string): Locator {
  return card(page, id).getByRole("button", { name, exact: true });
}

function tab(page: Page): Locator {
  return page.getByRole("banner").getByRole("tab", { name: new RegExp(`^${CAPTION}`) });
}

function textWindow(page: Page): Locator {
  return page.getByTestId("text-window-field");
}

function saveWindow(page: Page): Locator {
  return page.getByRole("dialog", { name: "Guardar en Estudio" });
}

function shareWindow(page: Page): Locator {
  return page.getByRole("dialog", { name: /^Compartir «/ });
}

function confirmation(page: Page): Locator {
  return page.getByRole("alertdialog");
}

function logoBar(page: Page): Locator {
  return page.getByTestId("logo-editor-bar");
}

function readCards(page: Page): Promise<StudioCard[]> {
  return cards(page).evaluateAll((all) =>
    all.map((one) => {
      const read = (part: string) =>
        one.querySelector(`[data-part="${part}"]`)?.textContent?.replace(/\s+/g, " ") ?? "";
      return {
        id: one.getAttribute("data-design") ?? "",
        name: read("name"),
        status: read("status"),
        buttons: [...one.querySelectorAll("button")].map((button) =>
          (button.textContent ?? "").trim(),
        ),
        messages: one.querySelectorAll('[data-part="message"]').length,
        conversation: read("conversation"),
        sharedNote: read("shared-note"),
      };
    }),
  );
}

async function waitForTheList(page: Page): Promise<void> {
  await page.getByTestId("design-grid").waitFor({ timeout: SHOWN_TIMEOUT_MS });
  await page.waitForFunction(
    () => {
      const grid = document.querySelector('[data-testid="design-grid"]');
      return grid && !/Cargando dise/.test(grid.textContent ?? "");
    },
    null,
    { timeout: SHOWN_TIMEOUT_MS },
  );
}

/** Showing the screen reads the list again: what a person does to see what is new. */
async function open(page: Page): Promise<void> {
  await tab(page).click();
  await waitForTheList(page);
}

/** Another tab and back: it is what makes the screen read again without waiting for its turn. */
async function readAgain(page: Page): Promise<void> {
  const responded = page
    .waitForResponse(
      (answer) =>
        answer.url().includes("/rest/v1/flyer_disenos") &&
        answer.url().includes("tipo=eq.diseno") &&
        answer.request().method() === "GET",
      { timeout: SOON_TIMEOUT_MS },
    )
    .catch(() => null);
  if (await page.locator('[data-screen="studio"]:not([hidden])').isVisible()) {
    await page.getByRole("banner").getByRole("tab", { name: OTHER_TAB }).first().click();
  }
  await open(page);
  await responded;
  await page.waitForTimeout(SETTLE_MS / 5);
}

async function pressSaveInEditor(page: Page): Promise<SaveDialog> {
  await page.getByTestId("save-design").click();
  await saveWindow(page).waitFor({ timeout: SHOWN_TIMEOUT_MS });
  return readSaveDialog(page);
}

async function readSaveDialog(page: Page): Promise<SaveDialog> {
  const modes = saveWindow(page).locator('input[name="save-design-mode"]');
  return {
    text: await saveWindow(page).innerText(),
    offersSameDesign: (await modes.and(page.locator('[data-mode="same"]')).count()) > 0,
    offersChoice: (await modes.count()) > 0,
  };
}

async function confirmSave(page: Page, { name, company }: DesignToSave): Promise<void> {
  if (name !== undefined) await page.getByLabel("Nombre del diseño").fill(name);
  if (company !== undefined) await page.getByLabel(/^Empresa/).fill(company);
  await saveWindow(page).getByRole("button", { name: "Guardar", exact: true }).click();
  await saveWindow(page).waitFor({ state: "detached", timeout: SOON_TIMEOUT_MS });
}

async function answerText(page: Page, text: string): Promise<void> {
  const field = textWindow(page);
  await field.waitFor({ timeout: SHOWN_TIMEOUT_MS });
  await field.fill(text);
  await page.locator('dialog:has([data-testid="text-window-field"]) button').last().click();
  await field.waitFor({ state: "detached", timeout: SOON_TIMEOUT_MS });
}

async function use(page: Page, id?: string): Promise<void> {
  const button = cardButton(page, "Usar", id);
  const wanted = await card(page, id).getAttribute("data-design");
  await button.click();
  await page.waitForFunction(
    (design) => {
      const editor = window["__flyerProbe"]?.logoEditor?.();
      return editor?.openWork()?.id === design && !editor.isOpening();
    },
    wanted,
    { timeout: SHOWN_TIMEOUT_MS },
  );
}

async function waitForStatusOf(page: Page, id: string | null, status: string): Promise<void> {
  await page
    .locator(`[data-testid="design-card"][data-design="${String(id)}"] [data-status="${status}"]`)
    .waitFor({ timeout: SOON_TIMEOUT_MS })
    .catch(() => undefined);
}

async function requestPublication(page: Page): Promise<void> {
  const wanted = await cards(page)
    .filter({ has: page.getByRole("button", { name: /^(Pedir que se publique|Volver a pedir)$/ }) })
    .first()
    .getAttribute("data-design");
  await card(page, wanted ?? undefined)
    .getByRole("button", { name: /^(Pedir que se publique|Volver a pedir)$/ })
    .click();
  await confirmation(page).getByRole("button", { name: "Pedir", exact: true }).click();
  await waitForStatusOf(page, wanted, "pedido");
}

function publishEnded(page: Page, words: RegExp): Promise<void> {
  return page
    .getByRole("status")
    .filter({ hasText: words })
    .first()
    .waitFor({ timeout: PUBLISH_TIMEOUT_MS });
}

async function approve(page: Page, flyerName: string): Promise<void> {
  await cards(page)
    .getByRole("button", { name: "Aprobar y publicar", exact: true })
    .first()
    .click();
  await answerText(page, flyerName);
  await publishEnded(page, /^(Publicado:|No se pudo publicar|Se creó el flyer)/);
  await page.waitForTimeout(SETTLE_MS);
}

async function slowDown(route: Route): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, SLOW_RESERVE_MS);
  });
  await route.fallback();
}

/** The publication takes its time reserving a number: the second press arrives meanwhile. */
async function approveTwiceAtOnce(page: Page, flyerName: string, secondName: string) {
  await page.route("**/storage/v1/object/flyers/_active*", slowDown);
  await cards(page)
    .getByRole("button", { name: "Aprobar y publicar", exact: true })
    .first()
    .click();
  await answerText(page, flyerName);
  await cards(page)
    .getByRole("button", { name: "Aprobar y publicar", exact: true })
    .first()
    .click();
  await answerText(page, secondName);
  await publishEnded(page, /^(Publicado:|No se pudo publicar|Se creó el flyer)/);
  await page.unroute("**/storage/v1/object/flyers/_active*", slowDown);
  await page.waitForTimeout(SETTLE_MS);
}

async function readShareDialog(page: Page): Promise<ShareDialog> {
  const opened = shareWindow(page);
  const confirm = opened.getByTestId("share-confirm");
  return {
    people: await opened.getByTestId("share-person").locator('[data-part="name"]').allInnerTexts(),
    text: (await opened.getByTestId("share-people").textContent()) ?? "",
    confirmEnabled: await confirm.isEnabled(),
    confirmLabel: (await confirm.textContent()) ?? "",
  };
}

async function openShareDialog(page: Page, options?: { onlyOriginalDesign: boolean }) {
  const eligible = options?.onlyOriginalDesign
    ? cards(page).filter({ hasNot: page.locator('[data-part="shared-note"]') })
    : cards(page);
  await eligible.getByRole("button", { name: "Compartir", exact: true }).first().click();
  await shareWindow(page)
    .getByTestId("share-person")
    .first()
    .waitFor({ timeout: SHOWN_TIMEOUT_MS });
}

async function fulfillForbidden(route: Route): Promise<void> {
  await route.fulfill({ status: 403, contentType: "application/json", body: "{}" });
}

/** A person tries to save the list while reading it answers 403: what happens is what is read. */
async function saveSourcesWhenForbidden(page: Page): Promise<string> {
  await page.route(SOURCES_FILE, async (route) => {
    if (route.request().method() === "GET") await fulfillForbidden(route);
    else await route.fallback();
  });
  await page.getByTestId("source").first().getByRole("button", { name: "Quitar" }).click();
  await confirmation(page).getByRole("button", { name: "Quitar", exact: true }).click();
  const notice = page.getByRole("status").filter({ hasText: /^No se pudo quitar/ });
  await notice.first().waitFor({ timeout: SOON_TIMEOUT_MS });
  const text = await notice.first().textContent();
  await page.unroute(SOURCES_FILE);
  return text ?? "";
}

async function proposeSource(
  page: Page,
  file: { name: string; mimeType: string; buffer: Buffer },
  name: string,
): Promise<void> {
  await page.getByTestId("sources-file").setInputFiles(file);
  await answerText(page, name);
  await page
    .getByRole("status")
    .filter({ hasText: /^(Listo:|Propuesta enviada|No se pudo)/ })
    .first()
    .waitFor({ timeout: SHOWN_TIMEOUT_MS });
  await page.waitForTimeout(SETTLE_MS);
}

function designRow(
  owner: string,
  id: string,
  name: string,
  { cambios, subidos }: { readonly cambios: readonly object[]; readonly subidos: object },
) {
  const now = new Date().toISOString();
  const row = {
    id,
    user_id: owner,
    autor: "",
    nombre: name,
    empresa: "",
    opcion: 9,
    base_name: "",
    miniatura: "",
    estado: "privado",
    tipo: "diseno",
    nota_admin: "",
    opcion_publicada: null,
    pedido_at: null,
    revisado_at: null,
    created_at: now,
    updated_at: now,
    compartido_por: null,
    compartido_de: null,
    compartido_at: null,
  };
  return { ...row, datos: { v: 1, cambios, subidos, recortes: [], legal: "" } };
}

type FakeRow = ReturnType<typeof designRow>;

/** Whose the designs are on the list of this person. */
async function myId(page: Page): Promise<string> {
  return (await draftsKeyOf(page)).replace("fg_borradores_", "");
}

/** What the table answers about designs that were saved long ago. */
async function answerWithDesigns(
  page: Page,
  rows: readonly FakeRow[],
): Promise<() => Promise<void>> {
  const answer = async (route: Route) => {
    const request = route.request();
    if (request.method() !== "GET") {
      await route.fallback();
      return;
    }
    const url = new URL(request.url());
    const id = url.searchParams.get("id")?.replace(/^eq\./, "");
    if (id) {
      const row = rows.find((one) => one.id === id);
      await route.fulfill({
        status: row ? 200 : 406,
        contentType: "application/json",
        body: JSON.stringify(row ?? { code: "PGRST116", message: "no rows" }),
      });
    } else if (url.searchParams.get("tipo") === "eq.diseno") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "Content-Range": `0-${String(rows.length - 1)}/${String(rows.length)}` },
        body: JSON.stringify(rows),
      });
    } else await route.fallback();
  };
  await page.route(DESIGNS_TABLE, answer);
  return () => page.unroute(DESIGNS_TABLE, answer);
}

function placedLogo(key: string) {
  const place = { x: 100, y: 2000, w: 150, h: 60 };
  return {
    img: key,
    t: "logo",
    ...place,
    tx: 100,
    ty: 2000,
    tw: 150,
    th: 60,
    ox: 100,
    oy: 2000,
    ow: 150,
    oh: 60,
    bg: "rgb(255,255,255)",
  };
}

async function uploadedKeys(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    (window["__flyerProbe"]?.logoEditor?.().placed() ?? []).flatMap(({ img }) =>
      img?.startsWith("pc:") ? [img] : [],
    ),
  );
}

function readingsDriver(page: Page) {
  return {
    isTabVisible: () => tab(page).isVisible(),
    open: () => open(page),
    waitForCards: () => cards(page).first().waitFor({ timeout: SHOWN_TIMEOUT_MS }),
    reloadList: () => readAgain(page),
    refreshNow: () => readAgain(page),
    cards: () => readCards(page),
    filters: () =>
      page
        .getByTestId("studio-filters")
        .getByRole("tab")
        .evaluateAll((buttons) =>
          buttons.map((button) => (button.textContent ?? "").replace(/\s+/g, " ").trim()),
        ),
    showFilter: (filter: StudioFilter) =>
      page.locator(`[data-testid="studio-filters"] [data-filter="${filter}"]`).click(),
    tabBadge: async () => {
      const badge = tab(page).locator("i");
      return (await badge.count()) > 0 ? ((await badge.textContent()) ?? "") : "";
    },
    headerMessages: async () => {
      const notice = page.getByTestId("header-notice");
      return {
        visible: await notice.isVisible(),
        explanation:
          (await page.getByRole("button", { name: /^Menú de / }).getAttribute("title")) ?? "",
      };
    },
    openQuestions: () =>
      page.evaluate(() => window["__flyerProbe"]?.studioNotices?.().questions ?? 0),
    sharedWithMe: () => page.evaluate(() => window["__flyerProbe"]?.studioNotices?.().shared ?? 0),
    waitForOpenQuestions: (count: number) =>
      page
        .waitForFunction((n) => window["__flyerProbe"]?.studioNotices?.().questions === n, count, {
          timeout: SOON_TIMEOUT_MS,
        })
        .then(() => undefined)
        .catch(() => undefined),
    waitForSharedWithMe: (count: number) =>
      page
        .waitForFunction((n) => window["__flyerProbe"]?.studioNotices?.().shared === n, count, {
          timeout: SOON_TIMEOUT_MS,
        })
        .then(() => undefined)
        .catch(() => undefined),
    intro: async () => (await page.getByTestId("studio-intro").textContent()) ?? "",
    savedBrandsSectionShown: async () => (await page.getByTestId("studio-saved-sets").count()) > 0,
    waitForConversation: (messages: number) =>
      page
        .waitForFunction(
          (n) =>
            document.querySelectorAll('[data-testid="design-card"] [data-part="message"]')
              .length === n,
          messages,
          { timeout: SOON_TIMEOUT_MS },
        )
        .then(() => undefined)
        .catch(() => undefined),
    waitForStatus: (status: string) =>
      cards(page)
        .locator('[data-part="status"]', { hasText: status })
        .first()
        .waitFor({ timeout: SOON_TIMEOUT_MS }),
    listedDesigns: async () =>
      page.locator('[data-testid="design-card"] [data-part="name"]').allInnerTexts(),
  } satisfies Partial<StudioDriver>;
}

function savingDriver(page: Page) {
  return {
    saveButton: async () => {
      const button = page.getByTestId("save-design");
      const visible = await button.isVisible();
      return { visible, label: visible ? ((await button.textContent()) ?? "") : "" };
    },
    openDesignLabel: async () =>
      (await page.getByTestId("work-chip").textContent())?.replace(/\s*×?$/, " ×") ?? "",
    openSaveDialog: () => pressSaveInEditor(page),
    confirmSave: (design) => confirmSave(page, design),
    save: async (design) => {
      await pressSaveInEditor(page);
      await confirmSave(page, design);
    },
    uploadedLogoInMemory: () =>
      page.evaluate(() => {
        const editor = window["__flyerProbe"]?.logoEditor?.();
        const key = (editor?.placed() ?? []).find(({ img }) => img?.startsWith("pc:"))?.img;
        return Boolean(key && editor?.imageOf(key));
      }),
  } satisfies Partial<StudioDriver>;
}

function cardActionsDriver(page: Page) {
  return {
    use: (id) => use(page, id),
    requestPublication: () => requestPublication(page),
    openCompleteView: async () => {
      await cardButton(page, "Ver completo").click();
      const view = page.getByTestId("flyer-viewer").locator("canvas");
      await view.waitFor({ timeout: SHOWN_TIMEOUT_MS });
      return { height: Number(await view.getAttribute("height")) };
    },
    closeCompleteView: () => page.getByTestId("viewer-close").click(),
    completeViewOpen: async () => (await page.getByTestId("flyer-viewer").count()) > 0,
    approveVisibleInCompleteView: () =>
      page.getByRole("dialog").getByRole("button", { name: "Aprobar y publicar" }).isVisible(),
    approve: (flyerName) => approve(page, flyerName),
    reject: async (note) => {
      await cards(page).getByRole("button", { name: "No aprobar", exact: true }).first().click();
      await answerText(page, note);
      await page.waitForTimeout(SETTLE_MS);
    },
    ask: async (question) => {
      await cards(page)
        .getByRole("button", { name: /^(Preguntar|Otra pregunta)$/ })
        .first()
        .click();
      await answerText(page, question);
    },
    answer: async (text) => {
      await cards(page).getByRole("button", { name: "Responder", exact: true }).first().click();
      await answerText(page, text);
    },
    approveTwiceAtOnce: (_design, flyerName, secondName) =>
      approveTwiceAtOnce(page, flyerName, secondName),
    publishDirectly: async (design, _option, flyerName) => {
      await open(page);
      await card(page, design).getByRole("button", { name: "Aprobar y publicar" }).click();
      await answerText(page, flyerName);
      await publishEnded(page, /^(Publicado:|No se pudo publicar|Se creó el flyer)/);
    },
  } satisfies Partial<StudioDriver>;
}

function sharingDriver(page: Page) {
  return {
    openShareDialog: (options) => openShareDialog(page, options),
    shareDialog: () => readShareDialog(page),
    searchPeopleToShare: (text) =>
      shareWindow(page).getByRole("searchbox", { name: "Buscar por nombre o mail" }).fill(text),
    tickFirstPersonToShare: () =>
      shareWindow(page).getByTestId("share-person").first().getByRole("checkbox").check(),
    confirmShare: async () => {
      await shareWindow(page).getByTestId("share-confirm").click();
      await shareWindow(page).waitFor({ state: "detached", timeout: SOON_TIMEOUT_MS });
      await page.waitForTimeout(SETTLE_MS / 2);
    },
    profileHasOption: (option) =>
      page.evaluate(
        (n) => window["__flyerProbe"]?.logoEditor?.().profileHasOption(n) ?? false,
        option,
      ),
    canUseOption: (option) =>
      page.evaluate((n) => window["__flyerProbe"]?.logoEditor?.().canUseOption(n) ?? false, option),
  } satisfies Partial<StudioDriver>;
}

function sourcesDriver(page: Page) {
  return {
    sourcesButtonLabel: async () => (await page.getByTestId("sources-button").textContent()) ?? "",
    waitForSourcesButton: () =>
      page.getByTestId("sources-button").waitFor({ timeout: SHOWN_TIMEOUT_MS }),
    proposeSource: (file, name) => proposeSource(page, file, name),
    waitForSourceToApprove: () =>
      page
        .getByTestId("source-proposal")
        .getByRole("button", { name: "Aprobar", exact: true })
        .first()
        .waitFor({ timeout: SHOWN_TIMEOUT_MS }),
    approveFirstSource: async () => {
      await page
        .getByTestId("source-proposal")
        .getByRole("button", { name: "Aprobar", exact: true })
        .first()
        .click();
      await page
        .getByRole("status")
        .filter({ hasText: /^(Aprobado:|No se pudo aprobar)/ })
        .first()
        .waitFor({ timeout: SHOWN_TIMEOUT_MS });
      await page.waitForTimeout(SETTLE_MS);
    },
    removeSource: async (id) => {
      await page
        .locator(`[data-testid="source"][data-source="${id}"]`)
        .getByRole("button", { name: "Quitar" })
        .click();
      await confirmation(page).getByRole("button", { name: "Quitar", exact: true }).click();
      await page
        .getByRole("status")
        .filter({ hasText: /^Quitado/ })
        .first()
        .waitFor({ timeout: SOON_TIMEOUT_MS })
        .catch(() => undefined);
    },
    saveSourcesWhenListIsForbidden: () => saveSourcesWhenForbidden(page),
  } satisfies Partial<StudioDriver>;
}

const LOGO_PLACES = [
  { x: 850, y: 2708 },
  { x: 668, y: 2708 },
  { x: 495, y: 2708 },
] as const;

function logoFile(buffer: Buffer, name: string) {
  return { name, mimeType: "image/png", buffer };
}

async function uploadTo(
  page: Page,
  at: { readonly x: number; readonly y: number },
  file: { name: string; mimeType: string; buffer: Buffer },
): Promise<string> {
  const logoEditor = createReactLogoEditorDriver(page);
  const isEditing = await page.evaluate(() =>
    Boolean(window["__flyerProbe"]?.logoEditor?.().isEditing()),
  );
  if (!isEditing) await logoEditor.enter();
  await logoEditor.uploadLogo(at, file);
  await logoEditor.waitUntilSettled();
  return (await uploadedKeys(page)).at(-1) ?? "";
}

/**
 * Reloading, as a real browser does it: what was kept stays. The test harness cleans the storage on
 * every navigation, so what is there goes back in right after. `extra`: what it finds besides.
 */
async function reloadWithWhatWasKept(
  page: Page,
  extra: Readonly<Record<string, string>> = {},
): Promise<void> {
  const kept = await page.evaluate(() => {
    const all: Record<string, string> = {};
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key) all[key] = localStorage.getItem(key) ?? "";
    }
    return all;
  });
  const content = { ...kept, ...extra };
  const stamp = `restore-${String(Date.now())}`;
  await page.addInitScript(
    ({ items, mark }) => {
      if (sessionStorage.getItem(mark)) return;
      sessionStorage.setItem(mark, "1");
      const write = () => {
        for (const [name, value] of Object.entries(items)) localStorage.setItem(name, value);
      };
      write();
      // In whatever order the scripts of the harness run, its cleaning does not take this away.
      const realClear: typeof Storage.prototype.clear = Reflect.get(Storage.prototype, "clear");
      Storage.prototype.clear = function clear() {
        Reflect.apply(realClear, this, []);
        write();
      };
      document.addEventListener("DOMContentLoaded", () => {
        Storage.prototype.clear = realClear;
      });
    },
    { items: content, mark: stamp },
  );
  await page.reload();
  await page.getByRole("banner").waitFor({ timeout: SHOWN_TIMEOUT_MS });
  await page.waitForFunction(() => {
    const slot = window["__flyerProbe"]?.flyerWorkspace?.().getState().slot;
    return Boolean(slot?.scene) && !slot?.loading;
  });
}

async function noticeMatching(page: Page, words: RegExp): Promise<string> {
  const notice = page.getByRole("status").filter({ hasText: words }).first();
  await notice.waitFor({ timeout: SHOWN_TIMEOUT_MS });
  return (await notice.textContent()) ?? "";
}

async function historyTab(page: Page, name: "Historial" | "Individual"): Promise<void> {
  await page.getByRole("tablist", { name: "Modo de armado" }).getByRole("tab", { name }).click();
}

async function reopenHistoryWithLostUpload(
  page: Page,
  file: Buffer,
  name: string,
): Promise<LostUploadReading> {
  // From the clean flyer: what was uploaded before stays on its draft.
  await logoBar(page).getByRole("button", { name: "+ Nuevo borrador" }).click();
  await page.waitForFunction(
    () => window["__flyerProbe"]?.logoEditor?.().placed().length === 0,
    null,
    { timeout: SHOWN_TIMEOUT_MS },
  );
  const key = await uploadTo(page, LOGO_PLACES[1], logoFile(file, name));
  await Promise.all([page.waitForEvent("download"), page.getByTestId("download-pdf").click()]);
  await page.waitForFunction(
    () => Object.keys(localStorage).some((stored) => stored.startsWith("fg_hist_")),
    null,
    { timeout: SHOWN_TIMEOUT_MS },
  );
  await reloadWithWhatWasKept(page);
  await historyTab(page, "Historial");
  await page.getByTestId("history-row").first().getByRole("button", { name: "Editar" }).click();
  const notice = await noticeMatching(page, /Falta el logo subido/);
  const { changes, openedInTab } = await page.evaluate(() => {
    const editor = window["__flyerProbe"]?.logoEditor?.();
    return { changes: editor?.placed().length ?? 0, openedInTab: Boolean(editor?.openWork()) };
  });
  return { key, notice, changes, openedInTab };
}

async function colorsOfDesignsSharingKey(page: Page): Promise<SameKeyColors> {
  const key = "pc:1:logo.png";
  const [red, blue] = await page.evaluate(() =>
    ["#ff0000", "#0000ff"].map((color) => {
      const canvas = document.createElement("canvas");
      canvas.width = 4;
      canvas.height = 4;
      const graphics = canvas.getContext("2d");
      if (!graphics) throw new Error("No canvas context");
      graphics.fillStyle = color;
      graphics.fillRect(0, 0, 4, 4);
      return canvas.toDataURL("image/png");
    }),
  );
  const owner = await myId(page);
  const cambios = [placedLogo(key)];
  const one = designRow(owner, "same-key-1", "Con rojo", { cambios, subidos: { [key]: red } });
  const other = designRow(owner, "same-key-2", "Con azul", { cambios, subidos: { [key]: blue } });
  const stop = await answerWithDesigns(page, [one, other]);
  const colorAfterUsing = async (id: string): Promise<number[]> => {
    await readAgain(page);
    await use(page, id);
    return page.evaluate(
      (logo) =>
        Array.from(
          window["__flyerProbe"]
            ?.logoEditor?.()
            .imageOf(logo)
            ?.getContext("2d")
            ?.getImageData(1, 1, 1, 1)
            .data.slice(0, 3) ?? [],
        ),
      key,
    );
  };
  const first = await colorAfterUsing(one.id);
  const second = await colorAfterUsing(other.id);
  const third = await colorAfterUsing(one.id);
  await stop();
  return { first, second, third };
}

const STORED_DRAFT_BIG_LIMIT = 20_000;

function storedDraft(id: string, name: string, key: string, subidos: object) {
  return {
    id,
    opcion: 9,
    nombre: name,
    cambios: [placedLogo(key)],
    recortes: [],
    legal: null,
    subidos,
  };
}

function draftsKeyOf(page: Page): Promise<string> {
  return page.evaluate(() => window["__flyerProbe"]?.logoEditor?.().draftsKey() ?? "");
}

/** The browser has no room: only what is small goes in. With 0, nothing at all. */
function limitStorage(page: Page, largest: number): Promise<void> {
  return page.evaluate((limit) => {
    const real: typeof Storage.prototype.setItem =
      Reflect.get(window, "__realSetItem") ?? Reflect.get(Storage.prototype, "setItem");
    Reflect.set(window, "__realSetItem", real);
    Storage.prototype.setItem = function setItem(key: string, value: string) {
      if (value.length > limit) throw new DOMException("quota", "QuotaExceededError");
      Reflect.apply(real, this, [key, value]);
    };
  }, largest);
}

async function saveDraftsWithoutRoom(page: Page, file: Buffer): Promise<NoRoomForDrafts> {
  const big = `data:image/png;base64,${file.toString("base64").repeat(3)}`;
  const key = await draftsKeyOf(page);
  const pendingKey = "pc:z:b.png";
  await reloadWithWhatWasKept(page, {
    [key]: JSON.stringify({
      v: 1,
      fecha: 1,
      lista: [storedDraft("x", "Pendiente", pendingKey, { [pendingKey]: big })],
    }),
  });
  await page.getByRole("dialog", { name: /Borradores de la última vez/ }).waitFor();
  await limitStorage(page, STORED_DRAFT_BIG_LIMIT);
  await uploadTo(page, LOGO_PLACES[0], logoFile(file, "a.png"));
  const firstNotice = await noticeMatching(page, /sin los logos subidos/);
  const reading = await page.evaluate((storage) => {
    const stored: { lista?: { subidos: object }[] } = JSON.parse(
      localStorage.getItem(storage) ?? "{}",
    );
    const editor = window["__flyerProbe"]?.logoEditor?.();
    return {
      savedLogos: (stored.lista ?? []).map(({ subidos }) => Object.keys(subidos).length),
      offered: editor?.offeredUploads() ?? [],
      openDraftLogos: editor?.openWorkUploads().length ?? 0,
    };
  }, key);
  await limitStorage(page, 0);
  await uploadTo(page, LOGO_PLACES[1], logoFile(file, "b.png"));
  const secondNotice = await noticeMatching(page, /No se pudieron guardar los borradores/);
  await page.evaluate(() => {
    const real = Reflect.get(window, "__realSetItem");
    if (real) Storage.prototype.setItem = real;
  });
  return {
    savedLogos: reading.savedLogos,
    firstNotice,
    pendingKeepsItsLogo: reading.offered.includes(pendingKey),
    openDraftLogos: reading.openDraftLogos,
    secondNotice,
    warnedNoRoom: secondNotice !== "",
  };
}

async function recoverDraftWithLostUpload(page: Page): Promise<string> {
  const key = await draftsKeyOf(page);
  await reloadWithWhatWasKept(page, {
    [key]: JSON.stringify({ v: 1, fecha: 1, lista: [storedDraft("y", "Viejo", "pc:z:b.png", {})] }),
  });
  await page
    .getByRole("dialog", { name: /Borradores de la última vez/ })
    .getByRole("button", { name: "Recuperar" })
    .click();
  return noticeMatching(page, /recuperado/);
}

function uploadsDriver(page: Page) {
  return {
    uploadKeysOfSameFile: async (file, name) => {
      const first = await uploadTo(page, LOGO_PLACES[0], logoFile(file, name));
      const second = await uploadTo(page, LOGO_PLACES[1], logoFile(file, name));
      await reloadWithWhatWasKept(page);
      const answerOffer = page.getByRole("dialog", { name: /Borradores de la última vez/ });
      await answerOffer
        .getByRole("button", { name: "Descartar" })
        .click({ timeout: SOON_TIMEOUT_MS })
        .catch(() => undefined);
      const third = await uploadTo(page, LOGO_PLACES[2], logoFile(file, name));
      return [first, second, third];
    },
    reopenHistoryWithLostUpload: (file, name) => reopenHistoryWithLostUpload(page, file, name),
    saveDialogTextWithoutStoredUpload: async () => {
      await tabOfTheFlyer(page);
      const { text } = await pressSaveInEditor(page);
      await saveWindow(page).getByRole("button", { name: "Cancelar" }).click();
      return text;
    },
    saveDialogTextWithStoredUpload: async (key, file) => {
      const picture = `data:image/png;base64,${file.toString("base64")}`;
      const row = designRow(await myId(page), "kept-upload", "Con su logo", {
        cambios: [placedLogo(key)],
        subidos: { [key]: picture },
      });
      const stop = await answerWithDesigns(page, [row]);
      await readAgain(page);
      await use(page, row.id);
      await stop();
      await tabOfTheFlyer(page);
      const { text } = await pressSaveInEditor(page);
      return text;
    },
    // That design only exists in what the table answered: this one goes as a new one.
    fillSaveDialogAndSave: async (name) => {
      await saveWindow(page).locator('[data-mode="new"]').check();
      await confirmSave(page, { name });
    },
    colorsOfDesignsSharingKey: () => colorsOfDesignsSharingKey(page),
    saveDraftsWithoutRoom: (file) => saveDraftsWithoutRoom(page, file),
    recoverDraftWithLostUpload: () => recoverDraftWithLostUpload(page),
    redownloadHistoryWithLostUpload: async () => {
      await historyTab(page, "Historial");
      await page.getByTestId("history-row").first().getByRole("button", { name: "PDF" }).click();
      const question = confirmation(page);
      await question.waitFor({ timeout: SHOWN_TIMEOUT_MS });
      return question.innerText();
    },
  } satisfies Partial<StudioDriver>;
}

/** Whoever comes from Estudio is on the flyer; the bar needs the mode on. */
async function tabOfTheFlyer(page: Page): Promise<void> {
  const isEditing = await page.evaluate(() =>
    Boolean(window["__flyerProbe"]?.logoEditor?.().isEditing()),
  );
  if (!isEditing) await logoBar(page).getByRole("button", { name: "Cambiar logos" }).click();
}

/** Config → Flyer, in the panel of the administrator: it also lists what Estudio publishes. */
function flyerConfigDriver(page: Page) {
  const openFlyerSheet = async () => {
    const admin = createReactAdminDriver(page);
    if (!(await admin.isPanelOpen())) await admin.openPanel();
    await admin.openSheet("Config", "Flyer");
    const list = page.getByTestId("flyer-list");
    await list.waitFor({ timeout: SHOWN_TIMEOUT_MS });
    return list;
  };
  return {
    askToDeactivateFlyer: async (option: number) => {
      const list = await openFlyerSheet();
      await list
        .getByTestId("flyer-banner")
        .filter({ hasText: `OP.${String(option)}` })
        .getByRole("button", { name: "Desactivar" })
        .click();
      const question = page.getByRole("alertdialog");
      await question.waitFor({ timeout: SHOWN_TIMEOUT_MS });
      return (await question.getByRole("heading").textContent()) ?? "";
    },
    flyerListOfConfig: async () => {
      const list = await openFlyerSheet();
      await list.getByText(/Sin flyer activo/).waitFor({ timeout: SHOWN_TIMEOUT_MS });
      return (await list.textContent()) ?? "";
    },
  } satisfies Partial<StudioDriver>;
}

export function createReactStudioDriver(page: Page): StudioDriver {
  return {
    ...readingsDriver(page),
    ...savingDriver(page),
    ...cardActionsDriver(page),
    ...sharingDriver(page),
    ...sourcesDriver(page),
    ...uploadsDriver(page),
    ...flyerConfigDriver(page),
  };
}
