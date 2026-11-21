// "Guardar en Estudio", and a design of Estudio opening as a tab.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { workspaceOnScreen } from "@/shared/lib/flyer-workspace/testing/painted-flyer.ts";
import type { StoredDesign } from "@/shared/lib/studio/design-desk.ts";
import { ADVISOR } from "@/shared/lib/testing/app-harness.tsx";
import {
  deferred,
  jsonResponse,
  type RecordedRequest,
} from "@/shared/supabase/testing/recording-fetch.ts";
import { forgetPickerFilters } from "../model/brand-picker.ts";
import type { OpenWork } from "../model/open-work.ts";
import { handles, key, openEditor, theEditor } from "../testing/editor-cloud.ts";

const PLACE = { x: 100, y: 100, w: 120, h: 60, bg: "rgb(255,255,255)" };
const saveButton = () => page.getByTestId("save-design");
const nameField = () => page.getByLabelText("Nombre del diseño");
const companyField = () => page.getByLabelText(/^Empresa/);
const saveWindow = () => page.getByRole("dialog", { name: "Guardar en Estudio" });
const notice = () => page.getByRole("status");
const CHANGE = {
  texto: "Hola",
  x: 96,
  y: 96,
  w: 128,
  h: 68,
  bg: "#fff",
  img: "",
  t: "Hola",
  ox: 100,
  oy: 100,
  ow: 120,
  oh: 60,
};

function aDesign(fields: Partial<StoredDesign> = {}): StoredDesign {
  return {
    id: "design-1",
    name: "Mío",
    company: "ACME",
    option: 9,
    mine: true,
    status: "privado",
    shared: false,
    baseName: "",
    changes: [{ ...CHANGE, tipo: "txt" }],
    uploads: {},
    cuts: [],
    legal: "Su legal",
    ...fields,
  };
}

function savedRow({ body }: RecordedRequest, id = "saved-1") {
  return {
    id,
    nombre: Object(body).nombre,
    empresa: Object(body).empresa,
    estado: "privado",
    opcion: 9,
    user_id: "me",
  };
}

function designsAnswer(ids = ["saved-1", "saved-2"]) {
  const calls: RecordedRequest[] = [];
  return {
    calls,
    flyer_disenos: (request: RecordedRequest) => {
      calls.push(request);
      if (request.method === "PATCH" || request.method === "POST") {
        const id = request.method === "PATCH" ? "design-1" : (ids.shift() ?? "other");
        return jsonResponse(savedRow(request, id), 201);
      }
      return jsonResponse([]);
    },
  };
}

async function enter() {
  await vi.waitFor(() => {
    expect(theEditor().currentArt()).not.toBe("");
  });
  await page.getByRole("button", { name: "Cambiar logos" }).click();
}

function settled() {
  return vi.waitFor(() => {
    expect(theEditor().isSettled()).toBe(true);
  });
}

async function withAChange() {
  await enter();
  theEditor().placeLogo(PLACE, "", "", null);
  await settled();
}

beforeEach(() => {
  localStorage.clear();
  forgetPickerFilters();
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("Guardar en Estudio", () => {
  it("is there with something to save and the faculty of Estudio", async () => {
    await openEditor();
    await enter();
    await expect.element(saveButton()).not.toBeInTheDocument();
    theEditor().placeLogo(PLACE, "", "", null);
    await expect.element(saveButton()).toHaveTextContent("Guardar en Estudio");
  });

  it("is not there without the faculty", async () => {
    await openEditor({
      files: { "_facultades.json": { roles: { asesor: { opcion_9: true, estudio: false } } } },
    });
    await withAChange();
    await expect.element(saveButton()).not.toBeInTheDocument();
  });

  it("saves the design with what is on the flyer, and the draft becomes that design", async () => {
    const designs = designsAnswer();
    const { harness } = await openEditor({ tables: { flyer_disenos: designs.flyer_disenos } });
    await withAChange();
    const draft = theEditor().works.activeWork();
    expect(draft?.temp).toBe(true);
    await saveButton().click();
    await expect.element(saveWindow()).toMatchTextContent(/sobre el flyer «Combustible»/);
    await expect.element(nameField()).toHaveValue("");
    await nameField().fill("  Mi <diseño>  ");
    await companyField().fill("ACME");
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect.element(saveWindow()).not.toBeInTheDocument();
    await expect.element(notice()).toHaveTextContent("Guardado en Estudio: «Mi diseño».");
    const post = harness.network.to("/rest/v1/flyer_disenos", "POST")[0];
    expect(post?.body).toMatchObject({
      nombre: "Mi diseño",
      empresa: "ACME",
      opcion: 9,
      estado: "privado",
      datos: { v: 1, legal: "Legal", recortes: [] },
    });
    expect(Object(post?.body).datos.cambios).toHaveLength(1);
    expect(String(Object(post?.body).miniatura)).toMatch(/^data:image\/jpeg;base64,/);
    const work = theEditor().works.activeWork();
    expect(work).toMatchObject({ id: "saved-1", name: "Mi diseño", temp: false, mine: true });
    expect(
      theEditor()
        .getState()
        .works.map(({ id }) => id),
    ).toEqual(["saved-1"]);
    await expect.element(saveButton()).toHaveTextContent("Guardar cambios");
    await expect.element(page.getByTestId("work-chip")).toMatchTextContent(/Diseño: Mi diseño/);
  });

  it("without a name it asks for one; Escape and Cancelar save nothing", async () => {
    const designs = designsAnswer();
    await openEditor({ tables: { flyer_disenos: designs.flyer_disenos } });
    await withAChange();
    await saveButton().click();
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect.element(notice()).toHaveTextContent("Ponele un nombre al diseño.");
    await page.getByRole("button", { name: "Cancelar" }).click();
    await saveButton().click();
    key("Escape");
    await expect.element(saveWindow()).not.toBeInTheDocument();
    expect(designs.calls).toEqual([]);
  });

  it("Enter in a field saves, and the name of the form is offered as the company", async () => {
    const designs = designsAnswer();
    await openEditor({ tables: { flyer_disenos: designs.flyer_disenos } });
    await withAChange();
    workspaceOnScreen().setForm({ ...workspaceOnScreen().getState().form, empresa: "Del form" });
    await saveButton().click();
    await expect.element(companyField()).toHaveValue("Del form");
    await nameField().fill("Con enter");
    await userEvent.keyboard("{Enter}");
    await expect.element(saveWindow()).not.toBeInTheDocument();
    expect(designs.calls[0]?.body).toMatchObject({ nombre: "Con enter", empresa: "Del form" });
  });

  it("a failure says so and leaves the window to try again", async () => {
    await openEditor({
      tables: { flyer_disenos: () => jsonResponse({ message: "row-level security" }, 403) },
    });
    await withAChange();
    await saveButton().click();
    await nameField().fill("Uno");
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect
      .element(notice())
      .toHaveTextContent("No se pudo guardar: no tenés permiso para hacer eso.");
    await expect.element(saveWindow()).toBeVisible();
    expect(theEditor().works.activeWork()?.temp).toBe(true);
  });

  it("an answer that arrives with another draft open does not convert it", async () => {
    const late = deferred<Response>();
    await openEditor({ tables: { flyer_disenos: () => late.promise } });
    await withAChange();
    const first = theEditor().works.activeWork()?.id;
    await saveButton().click();
    await nameField().fill("Lento");
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    key("Escape");
    await expect.element(saveWindow()).not.toBeInTheDocument();
    theEditor().works.newDraft();
    await vi.waitFor(() => {
      expect(theEditor().works.activeWork()).toBeDefined();
      expect(theEditor().works.activeWork()?.id).not.toBe(first);
    });
    const other = theEditor().works.activeWork();
    late.resolve(jsonResponse({ id: "saved", nombre: "Lento", estado: "privado", opcion: 9 }, 201));
    await expect.element(notice()).toHaveTextContent("Guardado en Estudio: «Lento».");
    expect(theEditor().works.activeWork()).toEqual(other);
    expect(theEditor().works.activeWork()?.temp).toBe(true);
    expect(
      theEditor()
        .getState()
        .works.map(({ id }) => id),
    ).not.toContain("saved");
  });

  it("logos that weigh too much are not sent", async () => {
    const designs = designsAnswer();
    await openEditor({ tables: { flyer_disenos: designs.flyer_disenos } });
    await enter();
    const editor = theEditor();
    const heavy = "x".repeat(2_300_000);
    editor.works.add({
      ...(await openedWork()),
      id: "pesado",
      temp: true,
      changes: [{ ...CHANGE, img: "pc:1:pesado.png" }],
      uploads: { "pc:1:pesado.png": heavy },
    });
    await editor.works.open("pesado");
    await saveButton().click();
    await nameField().fill("Pesado");
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect.element(notice()).toMatchTextContent(/pesan demasiado/);
    expect(designs.calls).toEqual([]);
  });

  it("a logo of the PC that is nowhere is warned about in the window", async () => {
    await openEditor();
    await enter();
    const editor = theEditor();
    editor.works.add({
      ...(await openedWork()),
      id: "perdido",
      temp: true,
      changes: [{ ...CHANGE, img: "pc:1:perdido.png" }],
      uploads: {},
    });
    await editor.works.open("perdido");
    await saveButton().click();
    await expect
      .element(page.getByTestId("save-design-missing"))
      .toMatchTextContent(/Falta el logo subido de la PC «perdido\.png»/);
    await page.getByRole("button", { name: "Cancelar" }).click();
    editor.works.add({
      ...(await openedWork()),
      id: "perdidos",
      temp: true,
      changes: [
        { ...CHANGE, img: "pc:1:a.png" },
        { ...CHANGE, x: 300, img: "pc:2:b.png" },
      ],
      uploads: {},
    });
    await editor.works.open("perdidos");
    await saveButton().click();
    await expect
      .element(page.getByTestId("save-design-missing"))
      .toMatchTextContent(/Faltan 2 logos subidos de la PC/);
  });

  it("over a design of one's own it offers the same one or a new one", async () => {
    const designs = designsAnswer();
    await openEditor({ tables: { flyer_disenos: designs.flyer_disenos } });
    await enter();
    const editor = theEditor();
    await editor.works.openDesign(() => Promise.resolve(aDesign()));
    await expect.element(saveButton()).toHaveTextContent("Guardar cambios");
    await saveButton().click();
    await expect.element(nameField()).toHaveValue("Mío");
    await expect.element(companyField()).toHaveValue("ACME");
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect.element(notice()).toHaveTextContent("Cambios guardados en «Mío».");
    expect(designs.calls.map(({ method }) => method)).toEqual(["PATCH"]);
    expect(designs.calls[0]?.query.get("id")).toBe("eq.design-1");
    expect(editor.works.activeWork()?.id).toBe("design-1");

    await saveButton().click();
    await page.getByRole("radio", { name: /Guardar como un diseño nuevo/ }).click();
    await nameField().fill("Otro");
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect.element(notice()).toHaveTextContent("Guardado en Estudio: «Otro».");
    expect(designs.calls.at(-1)?.method).toBe("POST");
    expect(editor.works.activeWork()?.id).toBe("saved-1");
    expect(editor.getState().works.map(({ id }) => id)).toEqual(["design-1", "saved-1"]);

    await saveButton().click();
    await page.getByRole("radio", { name: /Guardar como un diseño nuevo/ }).click();
    await page.getByRole("radio", { name: /Guardar los cambios en/ }).click();
    await expect.element(page.getByRole("radio", { name: /Guardar los cambios en/ })).toBeChecked();
  });

  it("over somebody else's, or one already published, it only saves a new one", async () => {
    await openEditor();
    await enter();
    const editor = theEditor();
    await editor.works.openDesign(() => Promise.resolve(aDesign({ mine: false })));
    await expect.element(saveButton()).toHaveTextContent("Guardar en Estudio");
    await editor.works.openDesign(() => Promise.resolve(aDesign({ status: "publicado" })));
    await expect.element(saveButton()).toHaveTextContent("Guardar en Estudio");
    await saveButton().click();
    await expect.element(nameField()).toHaveValue("");
    expect(document.querySelector('input[type="radio"]')).toBeNull();
  });

  it("with the × of the design let go, what is saved opens as a design", async () => {
    const designs = designsAnswer();
    await openEditor({ tables: { flyer_disenos: designs.flyer_disenos } });
    await enter();
    const editor = theEditor();
    await editor.works.openDesign(() => Promise.resolve(aDesign()));
    editor.works.letGoDesign();
    await saveButton().click();
    await nameField().fill("Suelto");
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect.element(notice()).toHaveTextContent("Guardado en Estudio: «Suelto».");
    expect(editor.works.activeWork()).toMatchObject({ id: "saved-1", name: "Suelto" });
  });
});

async function openedWork() {
  return {
    id: "x",
    option: 9,
    name: "Borrador",
    temp: true,
    mine: false,
    status: "borrador",
    company: "",
    changes: [],
    cuts: [],
    legal: null,
    uploads: {},
  };
}

describe("a design of Estudio", () => {
  it("opens as a tab, with what is saved", async () => {
    await openEditor();
    await enter();
    const editor = theEditor();
    const goToTab = vi.fn<(option: number) => void>();
    const opened = vi.fn<(work: OpenWork) => void>();
    const stop = editor.works.onOpened(opened);
    await editor.works.openDesign(() => Promise.resolve(aDesign()), goToTab);
    stop();
    expect(goToTab).toHaveBeenCalledWith(9);
    expect(opened).toHaveBeenCalledWith(
      expect.objectContaining({ id: "design-1", company: "ACME" }),
    );
    expect(editor.works.activeWork()).toMatchObject({ id: "design-1", name: "Mío", temp: false });
    expect(editor.active()).toHaveLength(1);
    expect(workspaceOnScreen().getState().legal).toBe("Su legal");
    await expect.element(page.getByTestId("open-work")).toMatchTextContent("Mío");
    await page.getByTestId("work-chip").getByRole("button").click();
    expect(editor.works.activeWork()).toBeUndefined();
    expect(editor.active()).toHaveLength(1);
  });

  it("if something else is chosen while it is read, it does not open", async () => {
    await openEditor();
    await enter();
    const editor = theEditor();
    const late = deferred<StoredDesign>();
    const going = editor.works.openDesign(() => late.promise);
    editor.works.chooseFlyer(9);
    late.resolve(aDesign());
    await going;
    expect(editor.getState().works).toEqual([]);
    expect(editor.active()).toEqual([]);
  });

  it("its flyer changed: it is said once", async () => {
    await openEditor();
    await enter();
    const editor = theEditor();
    await editor.works.openDesign(() => Promise.resolve(aDesign({ baseName: "otro.jpg" })));
    await expect
      .element(notice())
      .toHaveTextContent(
        "Ojo: el flyer «Combustible» cambió desde que se guardó este diseño. Revisá que todo haya quedado en su lugar.",
      );
    expect(editor.works.activeWork()?.warnChanged).toBe(false);
  });

  it("if it is deleted in Estudio its tab goes away", async () => {
    await openEditor();
    await enter();
    const editor = theEditor();
    await editor.works.openDesign(() => Promise.resolve(aDesign()));
    editor.works.closeDesign("design-1");
    expect(editor.getState().works).toEqual([]);
    expect(editor.active()).toEqual([]);
    expect(editor.works.activeWork()).toBeUndefined();
  });

  it("what a test can read of them", async () => {
    await openEditor();
    await enter();
    const editor = theEditor();
    await editor.works.openDesign(() =>
      Promise.resolve(aDesign({ uploads: { "pc:1:a.png": "data:image/png;base64,AAAA" } })),
    );
    const probe: unknown = window["__flyerProbe"]?.["logoEditor"]?.();
    expect(probe).toMatchObject({
      work: expect.any(Function),
      canUseOption: expect.any(Function),
    });
    const { work, canUseOption, profileHasOption, openWorkUploads, offeredUploads } = Object(probe);
    expect(work("design-1")).toEqual({ id: "design-1", name: "Mío", isDraft: false });
    expect(work("ninguno")).toBeNull();
    expect(canUseOption(9)).toBe(true);
    expect(profileHasOption(9)).toBe(true);
    expect(profileHasOption(2)).toBe(false);
    expect(openWorkUploads()).toEqual(["pc:1:a.png"]);
    expect(offeredUploads()).toEqual([]);
    editor.works.closeDesign("design-1");
    expect(openWorkUploads()).toEqual([]);
  });

  it("a shared copy can be used without having its flyer, only while it is open", async () => {
    await openEditor({
      files: {
        "_facultades.json": { roles: { asesor: { opcion_9: true, estudio: true } } },
        "_opciones.json": {
          opts: [
            { n: 9, nombre: "Combustible", solapa: "flyer" },
            { n: 2, nombre: "MVP", solapa: "flyer" },
          ],
        },
        "_active2.json": { imageUrl: null },
      },
    });
    await enter();
    const editor = theEditor();
    expect(editor.works.canUse(2)).toBe(false);
    await editor.works.openDesign(() => Promise.resolve(aDesign({ id: "not-shared", option: 2 })));
    expect(editor.getState().activeWork).toBeNull();
    editor.works.closeDesign("not-shared");
    expect(editor.works.canUse(2)).toBe(false);
    await editor.works.openDesign(() =>
      Promise.resolve(aDesign({ id: "copy", option: 2, shared: true })),
    );
    expect(editor.works.canUse(2)).toBe(true);
    editor.works.closeDesign("copy");
    expect(editor.works.canUse(2)).toBe(false);
  });

  it("the preview of a profile shows what that profile sees: a copy gives no permission", async () => {
    await openEditor({
      profile: { ...ADVISOR, role: "admin" },
      files: {
        "_facultades.json": { roles: { asesor: { opcion_9: true, estudio: true } } },
        "_opciones.json": {
          opts: [
            { n: 9, nombre: "Combustible", solapa: "flyer" },
            { n: 2, nombre: "MVP", solapa: "flyer" },
          ],
        },
        "_active2.json": { imageUrl: null },
      },
    });
    await enter();
    const editor = theEditor();
    expect(editor.works.canUse(2)).toBe(true);
    handles.session?.startRolePreview("asesor");
    await vi.waitFor(() => {
      expect(editor.works.canUse(2)).toBe(false);
    });
    await editor.works.openDesign(() =>
      Promise.resolve(aDesign({ id: "copy", option: 2, shared: true })),
    );
    expect(editor.works.canUse(2)).toBe(false);
  });
});
