import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { workspaceOnScreen } from "@/shared/lib/flyer-workspace/testing/painted-flyer.ts";
import {
  type Answer,
  INVENTED_USER,
  jsonResponse,
  type RecordedRequest,
} from "@/shared/supabase/testing/recording-fetch.ts";
import { forgetPickerFilters } from "../model/brand-picker.ts";
import type { SavedLogo, SavedSetData, SavedStrip } from "../model/saved-set.ts";
import {
  brand,
  CATALOG,
  client,
  drag,
  handles,
  key,
  LOGO_A,
  LOGO_B,
  LOGO_C,
  openEditor,
  theEditor,
  touch,
  waitForFlyer,
} from "../testing/editor-cloud.ts";

const MINE = INVENTED_USER.id;
const OLD_ROW = {
  id: "viejo",
  nombre: "Vieja",
  user_id: "otra",
  autor: "Otra Persona",
  updated_at: "2026-10-22T10:00:00.000Z",
  opcion: 9,
  miniatura: "",
  v: "1",
  resumen: null,
  flyer: null,
  prov: null,
};
const NEW_ROW = {
  ...OLD_ROW,
  id: "nuevo",
  nombre: "Neuquén",
  autor: null,
  v: "2",
  resumen: "1 logo",
  flyer: "Combustible",
  prov: "MENDOZA",
  miniatura: "data:image/jpeg;base64,x",
};

function placeA(): SavedLogo["lugar"] {
  return { x: LOGO_A.x, y: LOGO_A.y, w: LOGO_A.w, h: LOGO_A.h };
}

function logoItem(fields: Partial<SavedLogo> = {}): SavedLogo {
  return {
    tipo: "logo",
    nombre: "Adidas",
    img: "Adidas.png",
    t: "Adidas",
    lugar: placeA(),
    dup: false,
    rel: { x: 0, y: 0, w: 1, h: 1 },
    esSuper: false,
    ...fields,
  };
}

function setOf(fields: Partial<SavedSetData> = {}): SavedSetData {
  const boxes = [LOGO_A, LOGO_B, LOGO_C].map(({ x, y, w, h }) => ({ x, y, w, h }));
  return {
    v: 2,
    ancho: 800,
    alto: 900,
    items: [
      logoItem(),
      {
        tipo: "logo",
        nombre: "Coto",
        img: "Coto.png",
        t: "Coto",
        lugar: { x: LOGO_B.x, y: LOGO_B.y, w: LOGO_B.w, h: LOGO_B.h },
        dup: false,
        rel: { x: 0, y: 0, w: 1, h: 1 },
        esSuper: true,
        conDias: true,
      },
      {
        tipo: "vacio",
        nombre: "Lugar vacío",
        lugar: { x: LOGO_C.x, y: LOGO_C.y, w: LOGO_C.w, h: LOGO_C.h },
      },
    ],
    grupos: [{ items: [0, 1, 2], ctx: boxes }],
    subidos: {},
    prov: "SALTA",
    ...fields,
  };
}

/** Far from everything: nothing is sure, and it goes one by one. */
function lostSet(): SavedSetData {
  const strip: SavedStrip = {
    tipo: "franja",
    nombre: "Franja (1 marca)",
    rect: { x: 100, y: 500, w: 400, h: 100 },
    sel: [{ img: "Adidas.png", t: "Adidas" }],
    cols: 0,
    kt: 1,
    conDias: false,
    n: 1,
    caja: null,
    cajas: [{ x: 100, y: 500, w: 90, h: 30 }],
    ctx: [],
  };
  return setOf({
    items: [
      strip,
      logoItem({ lugar: { x: 300, y: 600, w: 60, h: 60 } }),
      { tipo: "vacio", nombre: "Lugar vacío", lugar: { x: 300, y: 700, w: 60, h: 60 } },
      {
        tipo: "texto",
        nombre: "Texto «hola»",
        texto: "hola",
        color: "#000",
        peso: 500,
        fs: 20,
        lugar: { x: 100, y: 780, w: 90, h: 30 },
        vacio: true,
        pos: { x: 100, y: 780 },
      },
    ],
    grupos: [],
  });
}

function bar() {
  return page.getByTestId("placement-bar");
}

function pressStep(step: number) {
  document.querySelector<HTMLElement>(`[data-step="${String(step)}"]`)?.click();
}

async function enter() {
  await waitForFlyer();
  await page.getByRole("button", { name: "Cambiar logos" }).click();
  await expect.element(page.getByRole("button", { name: "Listo" })).toBeVisible();
  await vi.waitFor(() => {
    expect(page.getByRole("button", { name: "Marcas guardadas" }).elements()).toHaveLength(1);
  });
}

function placement() {
  const view = theEditor().getState().placement;
  if (!view) throw new Error("It is not placing anything");
  return view;
}

function settled() {
  return vi.waitFor(() => {
    expect(theEditor().isSettled()).toBe(true);
    expect(theEditor().getState().placement?.isBusy ?? false).toBe(false);
  });
}

function tableAnswer(rows: () => readonly unknown[], content: unknown = null): Answer {
  return (request) => {
    const url = request.url;
    if (url.includes("select=id%2Cdatos") || url.includes("select=id,datos")) {
      return jsonResponse(content);
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return jsonResponse(request.method === "DELETE" ? null : NEW_ROW);
    }
    return jsonResponse(rows());
  };
}

function answerFailingContent(request: RecordedRequest): Response {
  return request.url.includes("datos") && !request.url.includes("resumen")
    ? jsonResponse({ message: "Failed to fetch" }, 500)
    : jsonResponse([NEW_ROW]);
}

function rejectLogo(): Promise<Blob> {
  return Promise.reject(new Error("no red"));
}

function noAnswerYet(): void {
  // Nobody is waiting yet.
}

function withTable(answer: Answer) {
  return { tables: { flyer_disenos: answer } };
}

async function openWith(data: SavedSetData) {
  await openEditor();
  await enter();
  await theEditor().placement.apply("id", "Prueba", data);
  await settled();
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

describe("the window of Marcas guardadas", () => {
  it("lists what each one holds, warns of the old ones, and a failure is not an empty list", async () => {
    await openEditor(withTable(tableAnswer(() => [NEW_ROW, OLD_ROW])));
    await enter();
    await page.getByRole("button", { name: "Marcas guardadas" }).click();
    const rows = page.getByTestId("saved-set");
    await expect.element(rows.nth(1)).toBeVisible();
    await expect
      .element(rows.nth(0).getByText(/1 logo · del flyer Combustible · Mendoza/i))
      .toBeVisible();
    await expect.element(rows.nth(1).getByText(/de Otra Persona/)).toBeVisible();
    await expect.element(rows.nth(1).getByTestId("saved-set-outdated")).toBeVisible();
    await expect.element(page.getByText(/primero cambiá algo del flyer/)).toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Guardar las de este flyer" }))
      .toBeDisabled();
    await page.getByRole("dialog").getByRole("button", { name: "Cerrar" }).click();
    expect(theEditor().getState().savedSets).toBeNull();
  });

  it("says when there are none, and when they could not be read", async () => {
    await openEditor(withTable(tableAnswer(() => [])));
    await enter();
    await page.getByRole("button", { name: "Marcas guardadas" }).click();
    await expect.element(page.getByText(/Todavía no guardaste marcas/)).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Cerrar" }).click();
  });

  it("a list that does not arrive says so", async () => {
    await openEditor(withTable(() => jsonResponse({ message: "permission denied" }, 403)));
    await enter();
    await page.getByRole("button", { name: "Marcas guardadas" }).click();
    await expect.element(page.getByText(/No se pudieron leer: no tenés permiso/)).toBeVisible();
  });

  it("deletes after asking, and says when it could not", async () => {
    let rows = [NEW_ROW];
    const answer = tableAnswer(() => rows);
    await openEditor(withTable(answer));
    await enter();
    await page.getByRole("button", { name: "Marcas guardadas" }).click();
    const row = page.getByTestId("saved-set");
    await row.getByRole("button", { name: "Borrar" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancelar" }).click();
    expect(row.elements()).toHaveLength(1);
    await row.getByRole("button", { name: "Borrar" }).click();
    rows = [];
    await page.getByRole("alertdialog").getByRole("button", { name: "Borrar" }).click();
    await expect.element(page.getByText("Listo: «Neuquén» borrada.")).toBeVisible();
    await expect.element(page.getByText(/Todavía no guardaste marcas/)).toBeVisible();
  });

  it("applies a row: what it holds is read, and an empty one says so", async () => {
    await openEditor(
      withTable(tableAnswer(() => [NEW_ROW], { id: "nuevo", nombre: "N", datos: { items: [] } })),
    );
    await enter();
    await page.getByRole("button", { name: "Marcas guardadas" }).click();
    await page.getByTestId("saved-set").getByRole("button", { name: "Aplicar" }).click();
    await expect.element(page.getByText("Esa combinación está vacía.")).toBeVisible();
    expect(theEditor().getState().placement).toBeNull();
  });

  it("a row that cannot be read says so", async () => {
    await openEditor(withTable(answerFailingContent));
    await enter();
    await page.getByRole("button", { name: "Marcas guardadas" }).click();
    await page.getByTestId("saved-set").getByRole("button", { name: "Aplicar" }).click();
    await expect.element(page.getByText(/No se pudo leer la combinación/)).toBeVisible();
  });

  it("applies what it holds, on the flyer of now", async () => {
    const content = { id: "nuevo", nombre: "Lo guardado", datos: setOf() };
    await openEditor(withTable(tableAnswer(() => [NEW_ROW], content)));
    await enter();
    await page.getByRole("button", { name: "Marcas guardadas" }).click();
    await page.getByTestId("saved-set").getByRole("button", { name: "Aplicar" }).click();
    await expect.element(bar().getByText("Así queda «Lo guardado»")).toBeVisible();
  });
});

describe("applying from the window", () => {
  it("with another under way it ends it; with the flyer changing it does nothing", async () => {
    const content = { id: "nuevo", nombre: "Lo guardado", datos: setOf() };
    let answerContent: (response: Response) => void = noAnswerYet;
    const held = new Promise<Response>((resolve) => {
      answerContent = resolve;
    });
    await openEditor(
      withTable((request) =>
        request.query.get("select")?.startsWith("id,datos") ? held : jsonResponse([NEW_ROW]),
      ),
    );
    await enter();
    const editor = theEditor();
    await editor.placement.apply("id", "P", lostSet());
    await settled();
    await page.getByRole("button", { name: "Marcas guardadas" }).click();
    await page.getByTestId("saved-set").getByRole("button", { name: "Aplicar" }).click();
    expect(editor.getState().placement).toBeNull();
    workspaceOnScreen().setCuts([{ y: 300, h: 100 }]);
    answerContent(jsonResponse(content));
    await vi.waitFor(() => {
      expect(document.querySelector<HTMLElement>("output")?.dataset["visible"]).toBe("false");
    });
    expect(editor.getState().placement).toBeNull();
  });
});

describe("saving a set", () => {
  it("says what it saves, asks for a name and adds it to the list", async () => {
    const posted: unknown[] = [];
    await openEditor(
      withTable((request) => {
        if (request.method === "POST") {
          posted.push(request.body);
          return jsonResponse({ ...NEW_ROW, user_id: MINE });
        }
        return jsonResponse([]);
      }),
    );
    await enter();
    theEditor().placeLogo({ x: 100, y: 100, w: 120, h: 60, bg: "rgb(255,255,255)" }, "", "", null);
    await page.getByRole("button", { name: "Marcas guardadas" }).click();
    await page.getByRole("button", { name: "Guardar las de este flyer" }).click();
    const window = page.getByRole("dialog", { name: "Guardar las marcas de este flyer" });
    await expect.element(window.getByText("1 lugar vacío")).toBeVisible();
    await window.getByRole("button", { name: "Guardar" }).click();
    await expect.element(page.getByText(/Ponele un nombre/)).toBeVisible();
    await window.getByRole("textbox", { name: "Nombre" }).fill("Mi <set>");
    await window
      .getByRole("combobox", { name: "Provincia de estas marcas" })
      .selectOptions("SALTA");
    key("Enter", {}, window.getByRole("textbox", { name: "Nombre" }).element());

    await expect.element(page.getByText(/Guardadas como «Neuquén»/)).toBeVisible();
    expect(posted[0]).toMatchObject({
      nombre: "Mi set",
      tipo: "combinacion",
      estado: "privado",
      opcion: 9,
      miniatura: expect.stringMatching(/^data:image\/jpeg/),
      datos: { prov: "SALTA", resumen: "1 lugar vacío", flyer: "Combustible" },
    });
    expect(theEditor().placement.lastApplied()?.id).toBe("nuevo");
  });

  it("offers to replace one of mine, with its name; a failure lets it try again", async () => {
    const mine = { ...NEW_ROW, user_id: MINE };
    let failing = true;
    const patched: string[] = [];
    await openEditor(
      withTable((request) => {
        if (request.method !== "PATCH") return jsonResponse([mine]);
        patched.push(request.url);
        return failing ? jsonResponse({ message: "boom" }, 500) : jsonResponse(mine);
      }),
    );
    await enter();
    theEditor().placeLogo({ x: 100, y: 100, w: 120, h: 60, bg: "rgb(255,255,255)" }, "", "", null);
    theEditor().placement.noteApplied("nuevo", "Neuquén");
    await page.getByRole("button", { name: "Marcas guardadas" }).click();
    await page.getByRole("button", { name: "Guardar las de este flyer" }).click();
    const window = page.getByRole("dialog", { name: "Guardar las marcas de este flyer" });
    const name = window.getByRole("textbox", { name: "Nombre" });
    await expect.element(name).toHaveValue("Neuquén");
    await window.getByRole("button", { name: "Reemplazar" }).click();
    await expect.element(page.getByText(/No se pudo guardar: boom/)).toBeVisible();
    failing = false;
    await window.getByRole("button", { name: "Reemplazar" }).click();
    await expect.element(page.getByText(/Actualicé «Neuquén»/)).toBeVisible();
    expect(patched.at(-1)).toContain("id=eq.nuevo");
  });

  it("can go as a new one instead, and be cancelled", async () => {
    const mine = { ...NEW_ROW, user_id: MINE };
    await openEditor(withTable(tableAnswer(() => [mine])));
    await enter();
    theEditor().placeLogo({ x: 100, y: 100, w: 120, h: 60, bg: "rgb(255,255,255)" }, "", "", null);
    theEditor().placement.noteApplied("nuevo", "Neuquén");
    await page.getByRole("button", { name: "Marcas guardadas" }).click();
    await page.getByRole("button", { name: "Guardar las de este flyer" }).click();
    const window = page.getByRole("dialog", { name: "Guardar las marcas de este flyer" });
    await window.getByRole("combobox", { name: "Guardar como" }).selectOptions("");
    await expect.element(window.getByRole("textbox", { name: "Nombre" })).toHaveValue("");
    await expect.element(window.getByRole("button", { name: "Guardar" })).toBeVisible();
    await window.getByRole("button", { name: "Cancelar" }).click();
    expect(theEditor().getState().savedSets).toBeNull();
  });
});

describe("Así queda", () => {
  it("everything found is seen placed, and can be kept in one step of Deshacer", async () => {
    await openWith(setOf());
    await expect.element(bar().getByText("Así queda «Prueba»")).toBeVisible();
    const editor = theEditor();
    expect(editor.active().filter(({ img }) => img).length).toBeGreaterThanOrEqual(2);
    expect(page.getByTestId("placement-placed").elements().length).toBe(3);
    expect(editor.works.activeWork()).toBeUndefined();
    expect(editor.active().find(({ img }) => img === "Adidas.png")?.prov).toBe("SALTA");
    await bar()
      .getByRole("button", { name: /Dejar así/ })
      .click();
    await expect.element(page.getByText(/Listo «Prueba»: 2 logos, 1 lugar vacío/)).toBeVisible();
    expect(editor.getState().placement).toBeNull();
    expect(editor.works.activeWork()?.temp).toBe(true);
    await settled();
    const count = editor.getState().history.steps.length;
    await page.getByRole("button", { name: "Deshacer" }).click();
    expect(editor.active()).toEqual([]);
    expect(editor.getState().history.steps).toHaveLength(count);
  });

  it("going back leaves no empty draft, and reviewing goes one by one", async () => {
    await openWith(setOf());
    const editor = theEditor();
    await bar().getByRole("button", { name: "Revisar uno por uno" }).click();
    expect(placement().mode).toBe("steps");
    expect(editor.active()).toEqual([]);
    await expect.element(page.getByTestId("placement-suggestion")).toBeInTheDocument();
    editor.placement.finish(true);
    await editor.placement.apply("id", "Prueba", setOf());
    await settled();
    await bar().getByRole("button", { name: "Volver a como estaba" }).click();
    await expect.element(page.getByText("Listo: el flyer quedó como estaba.")).toBeVisible();
    expect(editor.getState().placement).toBeNull();
    expect(editor.active()).toEqual([]);
    expect(editor.getState().works).toEqual([]);
  });

  it("Enter keeps it, Ctrl+Z goes back, and leaving the editor keeps it", async () => {
    await openWith(setOf());
    const editor = theEditor();
    key("z", { ctrlKey: true });
    expect(editor.getState().placement).toBeNull();
    await editor.placement.apply("id", "Prueba", setOf());
    await settled();
    key("Enter");
    expect(editor.getState().placement).toBeNull();
    expect(editor.works.activeWork()?.temp).toBe(true);
    editor.forget();
    await editor.placement.apply("id", "Prueba", setOf());
    await settled();
    await page.getByRole("button", { name: "Listo" }).click();
    expect(editor.getState().placement).toBeNull();
    expect(editor.active().length).toBeGreaterThan(0);
  });

  it("warns of what expired and of what has no promotion in that province", async () => {
    await openEditor({ catalog: [...CATALOG, brand("Vieja", { fecha_hasta: "2020-01-01" })] });
    await enter();
    const item = logoItem({ img: "Vieja.png", t: "Vieja", nombre: "Vieja" });
    const other = logoItem({
      img: "Adidas.png",
      lugar: { x: LOGO_C.x, y: LOGO_C.y, w: LOGO_C.w, h: LOGO_C.h },
    });
    const data = setOf({
      items: [item, other],
      grupos: [{ items: [0, 1], ctx: setOf().grupos[0]?.ctx ?? [] }],
    });
    await theEditor().placement.apply("id", "P", data);
    await settled();
    await expect.element(bar().getByText(/1 vencida \(en rojo\)/)).toBeVisible();
    await expect.element(bar().getByText(/1 sin promo en Salta/)).toBeVisible();
    expect(document.querySelector('[data-note="province"]')).not.toBeNull();
  });

  it("the flyer changing in the middle cuts it", async () => {
    await openWith(lostSet());
    const editor = theEditor();
    workspaceOnScreen().setCuts([{ y: 300, h: 100 }]);
    await expect.element(page.getByText(/se cortó la colocación/)).toBeVisible();
    expect(editor.getState().placement).toBeNull();
  });
});

describe("one thing at a time", () => {
  it("marks where it would go, and asks when it is not sure", async () => {
    await openWith(lostSet());
    expect(placement().mode).toBe("steps");
    await expect.element(bar().getByText(/1 de 4/)).toBeVisible();
    await expect.element(bar().getByText("Franja (1 marca)")).toBeVisible();
    const mark = page.getByTestId("placement-suggestion");
    await expect.element(mark).toHaveAttribute("data-text", "¿Va acá?");
    await expect.element(bar().getByRole("button", { name: /Atrás/ })).toBeDisabled();
    await expect.element(page.getByText(/Vamos de a una/)).toBeVisible();
  });

  it("places, skips, goes to any step and comes back as it was", async () => {
    await openWith(lostSet());
    const editor = theEditor();
    await bar()
      .getByRole("button", { name: /Poner acá/ })
      .click();
    await settled();
    expect(placement().index).toBe(1);
    expect(editor.active().some(({ franjaBase }) => franjaBase)).toBe(true);
    await expect
      .element(
        bar()
          .getByText(/Revisá|2 de 4/)
          .first(),
      )
      .toBeVisible();
    await bar().getByRole("button", { name: "Saltar" }).click();
    expect(placement().skipped).toBe(1);
    pressStep(3);
    expect(placement().order[2]).toBe(3);
    await expect.element(bar().getByText("Texto «hola»")).toBeVisible();
    key("Enter");
    await settled();
    expect(editor.active().some(({ tipo }) => tipo === "txt")).toBe(true);
    key("z", { ctrlKey: true });
    await settled();
    expect(editor.active().some(({ tipo }) => tipo === "txt")).toBe(false);
    pressStep(0);
    await settled();
    expect(placement().index).toBe(0);
    expect(editor.active()).toEqual([]);
    expect(placement().skipped).toBe(0);
    pressStep(0);
    expect(placement().index).toBe(0);
    editor.placement.goToStep(99);
    expect(placement().index).toBe(0);
  });

  it("reaches the end, can still go back, and Escape ends with what was placed", async () => {
    await openWith(lostSet());
    const editor = theEditor();
    await bar().getByRole("button", { name: "Saltar" }).click();
    await bar().getByRole("button", { name: "Saltar" }).click();
    await bar().getByRole("button", { name: "Saltar" }).click();
    await bar()
      .getByRole("button", { name: /Poner acá/ })
      .click();
    await settled();
    await expect.element(bar().getByText("Listo «Prueba»")).toBeVisible();
    expect(page.getByTestId("placement-placed").elements()).toHaveLength(1);
    await bar().getByRole("button", { name: /Atrás/ }).click();
    await settled();
    await expect.element(bar().getByText(/4 de 4/)).toBeVisible();
    key("Enter");
    await settled();
    key("Enter");
    expect(editor.getState().placement).toBeNull();
    await expect.element(page.getByText(/3 salteados/)).toBeVisible();
    await editor.placement.apply("id", "Otra", lostSet());
    await settled();
    key("Escape");
    expect(editor.getState().placement).toBeNull();
  });

  it("touching or dragging on the flyer chooses the place", async () => {
    await openWith(lostSet());
    const editor = theEditor();
    drag([100, 200], [600, 300]);
    await settled();
    expect(placement().index).toBe(1);
    expect(editor.active().find(({ franjaBase }) => franjaBase)?.oy).toBe(200);
    touch(600, 860);
    await expect.element(page.getByText(/Ahí no encontré un logo/)).toBeVisible();
    touch(LOGO_B.x + 40, LOGO_B.y + 20);
    await settled();
    expect(placement().index).toBe(2);
    drag([50, 800], [90, 860]);
    await settled();
    expect(placement().index).toBe(3);
    touch(100, 500);
    await expect.element(page.getByText(/Para el texto, arrastrá un recuadro/)).toBeVisible();
    drag([300, 780], [420, 860]);
    await settled();
    expect(placement().index).toBe(4);
    expect(editor.active().find(({ tipo }) => tipo === "txt")?.vacio).toBe(true);
    await bar().getByRole("button", { name: /Listo/ }).click();
  });

  it("for a strip, touching looks for its shape; on one built it goes there; if not, it says so", async () => {
    const boxes = [LOGO_A, LOGO_B, LOGO_C].map(({ x, y, w, h }) => ({ x, y: y + 400, w, h }));
    const first = lostSet().items[0];
    if (first?.tipo !== "franja") throw new Error("It is a strip");
    const shaped = { ...first, cajas: boxes };
    const other = { ...first, nombre: "Otra", cajas: [{ x: 100, y: 500, w: 900, h: 900 }] };
    await openWith(
      setOf({
        items: [other, other, logoItem({ lugar: { x: 300, y: 700, w: 60, h: 60 } })],
        grupos: [],
      }),
    );
    touch(700, 700);
    await expect.element(page.getByText(/No reconocí una franja/)).toBeVisible();
    drag([100, 300], [600, 420]);
    await settled();
    expect(placement().index).toBe(1);
    touch(300, 360);
    await settled();
    expect(placement().index).toBe(2);
    const editor = theEditor();
    editor.placement.finish(true);
    editor.forget();
    await editor.placement.apply(
      "id",
      "P",
      setOf({ items: [shaped, logoItem({ lugar: { x: 300, y: 700, w: 60, h: 60 } })], grupos: [] }),
    );
    await settled();
    touch(LOGO_A.x + 40, LOGO_A.y + 20);
    await settled();
    expect(placement().index).toBe(1);
    expect(editor.active().some(({ franjaBase }) => franjaBase)).toBe(true);
  });

  it("places what is sure at once, and leaves the doubtful for later", async () => {
    const data = setOf();
    await openEditor();
    await enter();
    const lost: SavedLogo = logoItem({
      nombre: "Perdido",
      lugar: { x: 300, y: 700, w: 60, h: 60 },
    });
    await theEditor().placement.apply("id", "P", {
      ...data,
      items: [...data.items, lost],
      grupos: [...data.grupos, { items: [3], ctx: null }],
    });
    await settled();
    await bar()
      .getByRole("button", { name: /Poner de una los 3/ })
      .click();
    await settled();
    expect(placement().index).toBe(3);
    await expect.element(page.getByText(/Puse 3\. Queda 1/)).toBeVisible();
    await expect.element(bar().getByText("Perdido")).toBeVisible();
  });

  it("a logo that did not come down or is not in memory is said, and goes on", async () => {
    await openEditor({ fetchLogo: rejectLogo });
    await enter();
    const data = lostSet();
    const editor = theEditor();
    await editor.placement.apply("id", "P", data);
    await settled();
    await bar()
      .getByRole("button", { name: /Poner acá/ })
      .click();
    await settled();
    expect(placement().approx.join()).toContain("no se pudieron bajar sus logos");
    await bar()
      .getByRole("button", { name: /Poner acá/ })
      .click();
    await settled();
    expect(placement().approx.join()).toContain("no se pudo bajar");
    expect(client(0, 0)).toBeTruthy();
  });

  it("moved logos of the flyer and those with days are put as they were", async () => {
    await openEditor();
    await enter();
    const editor = theEditor();
    const boxes = setOf().grupos[0]?.ctx ?? [];
    const moved = logoItem({
      nombre: "Logo del flyer movido",
      img: "orig:1,2,3,4",
      mover: true,
      rel: { x: 0.5, y: 0, w: 0.5, h: 1 },
    });
    const data = setOf({ items: [moved], grupos: [{ items: [0], ctx: boxes }] });
    await editor.placement.apply("id", "P", data);
    await settled();
    await expect.element(bar().getByText("Así queda «P»")).toBeVisible();
    const placed = editor.active()[0];
    expect(placed?.tx).toBeCloseTo((placed?.ox ?? 0) + (placed?.ow ?? 0) / 2);
    expect(editor.placement.daysFor("no está", "")).toBe("");
    expect(editor.placement.isOutOfProvince("Adidas.png", "")).toBe(false);
    expect(editor.placement.isOutOfProvince("pc:1:a", "SALTA")).toBe(false);
  });

  it("a thing that cannot be put is said, and the step stays", async () => {
    await openWith(lostSet());
    const logos = workspaceOnScreen().logos;
    vi.spyOn(logos, "fetch").mockRejectedValueOnce(new Error("no red"));
    await bar()
      .getByRole("button", { name: /Poner acá/ })
      .click();
    await expect.element(page.getByText(/No se pudo poner «Franja/)).toBeVisible();
    expect(placement().index).toBe(0);
    expect(placement().isBusy).toBe(false);
  });

  it("what is sure failing at once goes on one by one", async () => {
    await openEditor();
    await enter();
    const first = lostSet().items[0];
    if (first?.tipo !== "franja") throw new Error("It is a strip");
    const shaped = {
      ...first,
      cajas: [LOGO_A, LOGO_B, LOGO_C].map(({ x, y, w, h }) => ({ x, y, w, h })),
    };
    const data = setOf({
      items: [shaped, shaped, logoItem({ lugar: { x: 300, y: 700, w: 60, h: 60 } })],
      grupos: [{ items: [2], ctx: null }],
    });
    await theEditor().placement.apply("id", "P", data);
    await settled();
    vi.spyOn(workspaceOnScreen().logos, "fetch").mockRejectedValueOnce(new Error("no red"));
    await bar()
      .getByRole("button", { name: /Poner de una/ })
      .click();
    await expect
      .element(page.getByText(/No se pudo poner todo de una: seguí de a uno/))
      .toBeVisible();
    expect(placement().isBusy).toBe(false);
  });

  it("putting it all at once failing goes to one by one", async () => {
    await openEditor();
    await enter();
    const first = lostSet().items[0];
    if (first?.tipo !== "franja") throw new Error("It is a strip");
    const shaped = {
      ...first,
      cajas: [LOGO_A, LOGO_B, LOGO_C].map(({ x, y, w, h }) => ({ x, y, w, h })),
    };
    const logos = workspaceOnScreen().logos;
    const real = logos.fetch.bind(logos);
    let calls = 0;
    vi.spyOn(logos, "fetch").mockImplementation((logo) => {
      calls += 1;
      return calls === 2 ? Promise.reject(new Error("no red")) : real(logo);
    });
    await theEditor().placement.apply("id", "P", setOf({ items: [shaped], grupos: [] }));
    await expect.element(page.getByText(/vamos uno por uno/)).toBeVisible();
    expect(placement().mode).toBe("steps");
  });

  it("the flyer changing while it is put cuts it, and what was asked for is not left half done", async () => {
    await openEditor();
    await enter();
    const logos = workspaceOnScreen().logos;
    const real = logos.fetch.bind(logos);
    let release: () => void = noAnswerYet;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(logos, "fetch").mockImplementation(async (logo) => {
      await held;
      return real(logo);
    });
    const applying = theEditor().placement.apply("id", "P", setOf());
    workspaceOnScreen().setCuts([{ y: 300, h: 100 }]);
    release();
    await applying;
    expect(theEditor().getState().placement).toBeNull();
  });

  it("replaces what was there before: with the size it had, and without touching the rest", async () => {
    await openEditor();
    await enter();
    const editor = theEditor();
    const place = placeA();
    editor.placeLogo({ ...place, bg: "rgb(255,255,255)" }, "", "", null);
    await settled();
    const boxes = setOf().grupos[0]?.ctx ?? [];
    const item = logoItem({ rel: { x: 0.25, y: 0, w: 0.5, h: 1 }, dup: false });
    await editor.placement.apply(
      "id",
      "P",
      setOf({ items: [item], grupos: [{ items: [0], ctx: boxes }] }),
    );
    await settled();
    expect(editor.active()).toHaveLength(1);
    expect(editor.active()[0]?.tw).toBeCloseTo((editor.active()[0]?.ow ?? 0) / 2);
  });

  it("what this one just put is not stepped on: two things on one place are two changes", async () => {
    await openEditor();
    await enter();
    const editor = theEditor();
    const copy = logoItem({ dup: true, nombre: "Copia" });
    const boxes = setOf().grupos[0]?.ctx ?? [];
    await editor.placement.apply(
      "id",
      "P",
      setOf({ items: [logoItem(), copy], grupos: [{ items: [0], ctx: boxes }] }),
    );
    await settled();
    expect(editor.active()).toHaveLength(2);
  });

  it("with the editor closed it opens; a second one takes the place of the first", async () => {
    await openEditor();
    await waitForFlyer();
    const editor = theEditor();
    await editor.placement.apply("id", "P", lostSet());
    await settled();
    expect(editor.getState().on).toBe(true);
    await editor.placement.apply("id2", "Q", lostSet());
    await settled();
    expect(placement().name).toBe("Q");
    expect(editor.placement.lastApplied()?.id).toBe("id2");
    editor.placement.restore();
    editor.placement.review();
    expect(placement().mode).toBe("steps");
    editor.placement.placeSure();
    expect(placement().index).toBe(0);
  });

  it("nothing is done while it is busy, or with nothing open", async () => {
    await openEditor();
    await enter();
    const { placement: actions } = theEditor();
    actions.place();
    actions.skip();
    actions.goToStep(1);
    actions.back();
    actions.placeSure();
    actions.restore();
    actions.review();
    actions.enter();
    actions.finish();
    actions.touched({ x: 1, y: 1 }, { x: 1, y: 1 }, false);
    expect(theEditor().getState().placement).toBeNull();
    await actions.apply("id", "P", lostSet());
    await settled();
    actions.place();
    actions.place();
    actions.skip();
    actions.goToStep(1);
    actions.placeSure();
    actions.back();
    actions.enter();
    actions.finish();
    actions.touched({ x: 1, y: 1 }, { x: 1, y: 1 }, false);
    await settled();
    expect(placement().index).toBe(1);
  });

  it("a box too small, and days of a supermarket by zone", async () => {
    await openWith(lostSet());
    const editor = theEditor();
    editor.placement.touched({ x: 100, y: 100 }, { x: 104, y: 104 }, true);
    await expect.element(page.getByText("Ese recuadro es muy chico.")).toBeVisible();
    expect(editor.placement.daysFor("Coto.png", "")).toBe("Martes");
    expect(editor.placement.isOutOfProvince("Puppis.png", "MENDOZA")).toBe(true);
  });
});
