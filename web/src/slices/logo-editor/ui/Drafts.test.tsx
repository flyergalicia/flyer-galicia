import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { workspaceOnScreen } from "@/shared/lib/flyer-workspace/testing/painted-flyer.ts";
import { INVENTED_USER } from "@/shared/supabase/testing/recording-fetch.ts";
import { forgetPickerFilters } from "../model/brand-picker.ts";
import type { LogoEditorProbe } from "../model/editor-probe.ts";
import { client, drag, handles, key, openEditor, theEditor } from "../testing/editor-cloud.ts";

const STORAGE_KEY = `fg_borradores_${INVENTED_USER.id}`;
const PLACE = { x: 100, y: 600, w: 80, h: 40, bg: "rgb(255,255,255)" };
const OTHER_PLACE = { x: 300, y: 600, w: 80, h: 40, bg: "rgb(255,255,255)" };
const STORED = {
  id: "viejo",
  opcion: 9,
  nombre: "Borrador 3",
  cambios: [
    { x: 96, y: 596, w: 88, h: 48, bg: "#fff", img: "", t: "", ox: 100, oy: 600, ow: 80, oh: 40 },
  ],
  recortes: [{ y: 300, h: 100 }],
  legal: "Legal del borrador",
  subidos: {},
};

function isProbe(value: unknown): value is LogoEditorProbe {
  return value instanceof Object && "openWork" in value;
}

function theProbe(): LogoEditorProbe {
  const read: unknown = window["__flyerProbe"]?.["logoEditor"]?.();
  if (isProbe(read)) return read;
  throw new Error("The editor is not on screen");
}

function tabs() {
  return page.getByTestId("open-work");
}

async function enter() {
  await vi.waitFor(() => {
    expect(theEditor().currentArt()).not.toBe("");
  });
  await page.getByRole("button", { name: "Cambiar logos" }).click();
}

function height() {
  return workspaceOnScreen().getState().slot.scene?.art.height ?? 0;
}

function waitForReview() {
  return vi.waitFor(
    () => {
      expect(theEditor().works.isReviewed()).toBe(true);
    },
    { timeout: 3000 },
  );
}

function settled() {
  return vi.waitFor(() => {
    expect(theEditor().isSettled()).toBe(true);
  });
}

function draft(id: string, cuts: readonly { y: number; h: number }[]) {
  return {
    id,
    option: 9,
    name: id,
    temp: true,
    mine: false,
    status: "borrador",
    company: "",
    changes: [],
    cuts,
    legal: null,
    uploads: {},
  };
}

function saved(): { lista: { nombre: string; recortes: unknown[]; cambios: unknown[] }[] } | null {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
}

beforeEach(async () => {
  handles.editor = null;
  localStorage.clear();
  forgetPickerFilters();
  await page.viewport(1366, 800);
});

afterEach(() => {
  handles.editor = null;
  vi.restoreAllMocks();
});

describe("the drafts", () => {
  it("the first change goes to Borrador 1, and the original stays clean", async () => {
    await openEditor();
    await enter();
    const editor = theEditor();
    editor.placeLogo(PLACE, "", "", null);
    await expect.element(page.getByText(/quedaron en «Borrador 1»/)).toBeVisible();
    await expect.element(tabs()).toHaveAttribute("data-active", "true");
    editor.placeLogo(OTHER_PLACE, "", "", null);
    expect(editor.getState().works).toHaveLength(1);
    expect(editor.works.chooseFlyer(9)).toBe(false);
    expect(editor.active()).toEqual([]);
    expect(editor.works.activeWork()).toBeUndefined();
    await tabs()
      .getByRole("button", { name: /Borrador 1/ })
      .click();
    await vi.waitFor(() => {
      expect(editor.works.activeWork()?.name).toBe("Borrador 1");
    });
    expect(editor.active()).toHaveLength(2);
  });

  it("a new one starts clean, from the button or with N, and each keeps its own", async () => {
    await openEditor();
    await enter();
    const editor = theEditor();
    editor.placeLogo(PLACE, "", "", null);
    await page.getByRole("button", { name: "+ Nuevo borrador" }).click();
    await vi.waitFor(() => {
      expect(editor.works.activeWork()?.name).toBe("Borrador 2");
    });
    expect(editor.active()).toEqual([]);
    expect(editor.works.isOpening()).toBe(false);
    key("n");
    await vi.waitFor(() => {
      expect(editor.works.activeWork()?.name).toBe("Borrador 3");
    });
    await tabs()
      .nth(0)
      .getByRole("button", { name: /Borrador 1/ })
      .click();
    await vi.waitFor(() => {
      expect(editor.active()).toHaveLength(1);
    });
    await tabs()
      .nth(0)
      .getByRole("button", { name: /Borrador 1/ })
      .click();
    expect(editor.works.activeWork()?.name).toBe("Borrador 1");
  });

  it("closing one with changes asks first; without changes it goes at once", async () => {
    await openEditor();
    await enter();
    const editor = theEditor();
    editor.placeLogo(PLACE, "", "", null);
    await tabs().getByRole("button", { name: "Cerrar" }).click();
    await expect.element(page.getByRole("alertdialog").getByText(/se pierden/)).toBeVisible();
    await page.getByRole("button", { name: "Volver" }).click();
    expect(editor.getState().works).toHaveLength(1);
    await tabs().getByRole("button", { name: "Cerrar" }).click();
    await page.getByRole("button", { name: "Cerrar borrador" }).click();
    expect(editor.getState().works).toEqual([]);
    expect(editor.active()).toEqual([]);
    editor.works.newDraft();
    await vi.waitFor(() => {
      expect(editor.works.activeWork()).toBeTruthy();
    });
    await tabs().getByRole("button", { name: "Cerrar" }).click();
    expect(editor.getState().works).toEqual([]);
  });

  it("a draft that is not on screen is asked about by what it kept", async () => {
    await openEditor();
    await enter();
    const editor = theEditor();
    editor.works.newDraft();
    await vi.waitFor(() => {
      expect(editor.works.activeWork()?.name).toBe("Borrador 1");
    });
    editor.placeLogo(PLACE, "", "", null);
    expect(editor.works.chooseFlyer(9)).toBe(false);
    await tabs().getByRole("button", { name: "Cerrar" }).click();
    await expect.element(page.getByRole("alertdialog")).toBeVisible();
    editor.works.confirmClose();
  });

  it("Restaurar leaves the original clean, and the draft keeps its own", async () => {
    await openEditor();
    await enter();
    const editor = theEditor();
    const whole = height();
    await page.getByRole("button", { name: "Recortar" }).click();
    drag([300, 300], [300, 450]);
    await page.getByRole("button", { name: "Quitar esta parte" }).click();
    const cropped = height();
    editor.forget();
    expect(height()).toBe(whole);
    expect(editor.works.activeWork()).toBeUndefined();
    await tabs()
      .getByRole("button", { name: /Borrador 1/ })
      .click();
    await vi.waitFor(() => {
      expect(height()).toBe(cropped);
    });
  });

  it("a design of Estudio is added once, and closing it does not ask", async () => {
    await openEditor();
    await enter();
    const editor = theEditor();
    const design = {
      id: "d",
      option: 9,
      name: "Diseño",
      temp: false,
      mine: true,
      status: "privado",
      company: "",
      changes: [
        {
          x: 96,
          y: 596,
          w: 88,
          h: 48,
          bg: "#fff",
          img: "",
          t: "",
          ox: 100,
          oy: 600,
          ow: 80,
          oh: 40,
        },
      ],
      cuts: [],
      legal: "Su legal",
      uploads: {},
    };
    editor.works.add(design);
    await editor.works.open("d");
    expect(workspaceOnScreen().getState().legal).toBe("Su legal");
    editor.works.add(design);
    expect(editor.works.activeWork()).toBeUndefined();
    await editor.works.open("d");
    await tabs().getByRole("button", { name: "Cerrar" }).click();
    expect(editor.getState().works).toEqual([]);
    // As in the current version: using again the design on screen leaves its legal as an edit of
    // the option, and that is what comes back on closing it.
    expect(workspaceOnScreen().getState().legal).toBe("Su legal");
  });

  it("closing a design goes back to the legal of its option", async () => {
    await openEditor();
    await enter();
    const editor = theEditor();
    editor.works.add({
      id: "d",
      option: 9,
      name: "Diseño",
      temp: false,
      mine: true,
      status: "privado",
      company: "",
      changes: [],
      cuts: [],
      legal: "Su legal",
      uploads: {},
    });
    await editor.works.open("d");
    expect(workspaceOnScreen().getState().legal).toBe("Su legal");
    await tabs().getByRole("button", { name: "Cerrar" }).click();
    expect(workspaceOnScreen().getState().legal).toBe("Legal");
  });

  it("one that is opened while another opening is on its way wins", async () => {
    await openEditor();
    await enter();
    const editor = theEditor();
    editor.works.add(draft("a", [{ y: 100, h: 50 }]));
    editor.works.add(draft("b", [{ y: 200, h: 80 }]));
    const first = editor.works.open("a");
    const second = editor.works.open("b");
    await Promise.all([first, second]);
    expect(editor.works.activeWork()?.id).toBe("b");
    expect(editor.cuts()).toEqual([{ y: 200, h: 80 }]);
  });

  it("chooses another flyer from a draft and says it still has to go there", async () => {
    await openEditor();
    await enter();
    const editor = theEditor();
    editor.placeLogo(PLACE, "", "", null);
    expect(editor.works.chooseFlyer(11)).toBe(true);
    expect(editor.works.activeWork()).toBeUndefined();
    expect(editor.works.chooseFlyer(9)).toBe(true);
  });

  it("a flyer that did not load leaves the draft closed, and nothing stuck", async () => {
    await openEditor();
    await enter();
    const editor = theEditor();
    editor.works.add({
      id: "x",
      option: 77,
      name: "Otro",
      temp: true,
      mine: false,
      status: "borrador",
      company: "",
      changes: [],
      cuts: [],
      legal: null,
      uploads: {},
    });
    await editor.works.open("x");
    expect(editor.works.activeWork()).toBeUndefined();
    expect(editor.works.isOpening()).toBe(false);
    await editor.works.open("no existe");
    editor.works.askToClose("no existe");
    editor.works.confirmClose();
    editor.works.cancelClose();
    expect(editor.getState().works).toHaveLength(1);
  });

  it("opening one with a section that cannot come warns: a gap stays", async () => {
    await openEditor();
    await enter();
    const editor = theEditor();
    editor.works.add({
      id: "x",
      option: 9,
      name: "Con sección",
      temp: false,
      mine: true,
      status: "privado",
      company: "",
      changes: [
        {
          x: 0,
          y: 0,
          w: 1,
          h: 1,
          bg: "",
          img: "pc:1:perdido.png",
          t: "",
          ox: 0,
          oy: 0,
          ow: 1,
          oh: 1,
        },
      ],
      cuts: [
        { y: 100, h: 50, ins: { u: "data:image/png;base64,no", sy: 0, sh: 10, sw: 10, pad: 0 } },
      ],
      legal: "   ",
      uploads: {},
    });
    await editor.works.open("x");
    expect(workspaceOnScreen().getState().legal).toBe("Legal");
    await vi.waitFor(() => {
      expect(editor.works.activeWork()?.id).toBe("x");
    });
    await expect.element(page.getByText(/Falta el logo subido de la PC/)).toBeVisible();
    await tabs().getByRole("button", { name: "Cerrar" }).click();
    expect(editor.getState().works).toEqual([]);
  });
});

describe("what a test reads of the drafts and the sections", () => {
  it("says the same as what can be seen", async () => {
    await openEditor();
    await enter();
    const probe = theProbe();
    expect(probe.openWork()).toBeNull();
    expect(probe.openDesign()).toBeNull();
    expect(probe.isPlacing()).toBe(false);
    expect(probe.cuts()).toEqual([]);
    expect(probe.section()).toBeNull();
    expect(probe.sectionImage("x")).toBeNull();
    expect(probe.missingSections()).toBe(0);
    expect(probe.draftsKey()).toBe(STORAGE_KEY);
    expect(probe.isBlankRow("current", 0)).toBe(true);
    expect(probe.isBlankRow("whole", 0)).toBe(true);
    expect(probe.isBlankRow("section", 0)).toBe(false);
    expect(probe.hasDaysBelow(0, 0)).toBe(false);
    theEditor().works.add({
      id: "d",
      option: 9,
      name: "Diseño",
      temp: false,
      mine: true,
      status: "privado",
      company: "",
      changes: [],
      cuts: [],
      legal: null,
      uploads: {},
    });
    await theEditor().works.open("d");
    expect(probe.openWork()).toEqual({ id: "d", name: "Diseño", isDraft: false });
    expect(probe.openDesign()).toBe("Diseño");
    expect(probe.isOpening()).toBe(false);
    expect(probe.draftsReviewed()).toBe(theEditor().works.isReviewed());
    await expect.element(page.getByTestId("work-chip").getByText("Diseño")).toBeVisible();
    await page.getByRole("button", { name: "Dejar de editar este diseño" }).click();
    expect(probe.openWork()).toBeNull();
  });
});

describe("the drafts kept in the browser", () => {
  it("are saved a moment after the last change, and forgotten when closed", async () => {
    await openEditor();
    await enter();
    await waitForReview();
    const editor = theEditor();
    editor.placeLogo(PLACE, "", "", null);
    await settled();
    await vi.waitFor(
      () => {
        expect(saved()?.lista[0]?.nombre).toBe("Borrador 1");
      },
      { timeout: 3000 },
    );
    await tabs().getByRole("button", { name: "Cerrar" }).click();
    await page.getByRole("button", { name: "Cerrar borrador" }).click();
    await vi.waitFor(
      () => {
        expect(saved()).toBeNull();
      },
      { timeout: 3000 },
    );
  });

  it("are offered back and recovered in their tabs, with their name and their cut", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ lista: [STORED, { ...STORED, id: "2" }, { opcion: 5 }] }),
    );
    await openEditor();
    await enter();
    const card = page.getByRole("dialog", { name: "Borradores de la última vez" });
    await expect.element(card.getByText(/2 borradores/)).toBeVisible();
    await expect.element(card.getByText(/Borrador 3/)).toBeVisible();
    await card.getByRole("button", { name: "Recuperar" }).click();
    await expect.element(tabs().nth(1)).toBeVisible();
    await expect.element(tabs().nth(0).getByText("Borrador 3")).toBeVisible();
    await expect.element(tabs().nth(1).getByText("Borrador 1")).toBeVisible();
    await expect.element(page.getByText(/2 borradores recuperados/)).toBeVisible();
    await tabs()
      .nth(0)
      .getByRole("button", { name: /Borrador 3/ })
      .click();
    const editor = theEditor();
    await vi.waitFor(() => {
      expect(editor.cuts()).toHaveLength(1);
    });
    expect(editor.active()).toHaveLength(1);
    expect(workspaceOnScreen().getState().legal).toBe("Legal del borrador");
    expect(saved()?.lista).toHaveLength(2);
  });

  it("says when a logo uploaded from the PC could not be kept", async () => {
    const lost = {
      ...STORED,
      cambios: [{ ...STORED.cambios[0], img: "pc:1:a.png" }],
      recortes: null,
      legal: 3,
      subidos: null,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ lista: [lost] }));
    await openEditor();
    await enter();
    await page.getByRole("button", { name: "Recuperar" }).click();
    await expect.element(page.getByText(/Borrador recuperado.*1 logo subido/)).toBeVisible();
  });

  it("a screen that goes away saves what it had pending, and writes nothing later", async () => {
    const { screen } = await openEditor();
    await enter();
    await waitForReview();
    theEditor().works.newDraft();
    await expect.element(tabs().first()).toBeVisible();
    theEditor().works.saveSoon();
    await screen.unmount();
    expect(saved()?.lista).toHaveLength(1);
    localStorage.clear();
    await new Promise((resolve) => {
      setTimeout(resolve, 1100);
    });
    expect(saved()).toBeNull();
  });

  it("can be discarded, and then they are erased", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ lista: [STORED] }));
    await openEditor();
    await enter();
    await expect.element(page.getByText(/un borrador de la última vez/)).toBeVisible();
    await page.getByRole("button", { name: "Descartar" }).click();
    await expect.element(page.getByText("Borradores descartados.")).toBeVisible();
    expect(saved()).toBeNull();
  });

  it("what cannot be used is forgotten, and what is offered is not stepped on meanwhile", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ lista: [{ ...STORED, opcion: 5 }] }));
    await openEditor();
    await enter();
    await waitForReview();
    expect(saved()).toBeNull();
    localStorage.clear();
  });

  it("with no room it warns once, and what was offered stays in what it tries to keep", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ lista: [STORED] }));
    await openEditor();
    await enter();
    await expect.element(page.getByText(/un borrador de la última vez/)).toBeVisible();
    const written: string[] = [];
    vi.spyOn(Storage.prototype, "setItem").mockImplementation((_key, value) => {
      written.push(value);
      throw new Error("full");
    });
    const editor = theEditor();
    editor.placeLogo(PLACE, "", "", null);
    await vi.waitFor(
      () => {
        expect(written.at(-1)).toContain("viejo");
      },
      { timeout: 3000 },
    );
    await expect.element(page.getByText(/el navegador no tiene lugar/)).toBeVisible();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")?.lista[0]?.id).toBe("viejo");
    expect(client(0, 0)).toBeTruthy();
  });

  it("with no room for the uploaded logos it saves without them, and says so", async () => {
    await openEditor();
    await enter();
    await waitForReview();
    const editor = theEditor();
    const logo = document.createElement("canvas");
    logo.width = 40;
    logo.height = 20;
    editor.uploadedLogo(PLACE, "pc:1:a.png", "a", logo);
    const real = Storage.prototype.setItem.bind(localStorage);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation((name, value) => {
      if (value.includes('pc:1:a.png":"data')) throw new Error("full");
      real(name, value);
    });
    await vi.waitFor(
      () => {
        expect(saved()?.lista[0]?.nombre).toBe("Borrador 1");
      },
      { timeout: 3000 },
    );
    await expect.element(page.getByText(/sin los logos subidos/)).toBeVisible();
  });
});
