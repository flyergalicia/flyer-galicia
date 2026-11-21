// The two sections under the list: the flyers to copy, and the saved sets.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import { SECTION_SOURCES_QUERY_KEY } from "@/slices/logo-editor/index.ts";
import { aDesign, ME, openStudio, type StudioCloud } from "../testing/studio-on-screen.ts";

const HOME = "/storage/v1/object/public/flyers/";
const notice = () => page.getByRole("status");
const WAIT = { timeout: 8000 };
const field = () => page.getByTestId("text-window-field");
const windowButton = (name: string) =>
  page.getByRole("dialog").getByRole("button", { name, exact: true });
const confirm = (name: string) =>
  page.getByRole("alertdialog").getByRole("button", { name, exact: true });
const row = () => page.getByTestId("saved-set");
const proposals = () => page.getByTestId("source-proposal");
const sources = () => page.getByTestId("source");

function aPicture(): File {
  const canvas = document.createElement("canvas");
  canvas.width = 62;
  canvas.height = 310;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No canvas here");
  context.fillStyle = "#123456";
  context.fillRect(0, 0, 62, 310);
  const [, content = ""] = canvas.toDataURL("image/png").split(",");
  const bytes = Uint8Array.from(atob(content), (letter) => letter.charCodeAt(0));
  return new File([bytes], "shop_pings-caba.png", { type: "image/png" });
}

function chooseFile(file: File) {
  const input = document.querySelector<HTMLInputElement>('[data-testid="sources-file"]');
  if (!input) throw new Error("There is no field for the file");
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

/** The whole address of a file of the bucket of this test. */
function aSource(
  harness: { url: string },
  id: string,
  fields: Readonly<Record<string, unknown>> = {},
) {
  return {
    id,
    nombre: `Fuente ${id}`,
    img: `${harness.url}${HOME}fuente_1.jpg`,
    mini: "",
    at: "2026-10-20T15:00:00.000Z",
    de: "",
    ...fields,
  };
}

async function openWithSources(cloud: StudioCloud, make: (url: string) => readonly object[]) {
  const opened = await openStudio(cloud);
  opened.bucketFiles["_fuentes.json"] = { lista: make(opened.harness.url) };
  await opened.show(false);
  await opened.show(true);
  return opened;
}

const PROPOSAL = aDesign("p", {
  tipo: "fuente",
  estado: "pedido",
  nombre: "Shoppings",
  autor: "Ana Inventada",
  miniatura: "data:image/jpeg;base64,AAAA",
  datos: {
    img: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP",
    w: 1240,
    h: 400,
  },
});

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("Flyers para copiar", () => {
  it("the administrator uploads one, with a name that starts from the file", async () => {
    const { bucketFiles, harness } = await openStudio({ role: "admin" });
    await expect
      .element(page.getByTestId("sources-button"))
      .toHaveTextContent("Subir un flyer (PDF)");
    await expect.element(page.getByText("Todavía no hay flyers para copiar.")).toBeVisible();
    chooseFile(aPicture());
    await expect.element(field(), { timeout: 8000 }).toHaveValue("shop pings caba");
    await field().fill("Shoppings CABA");
    await windowButton("Subir").click();
    await expect
      .element(notice(), WAIT)
      .toMatchTextContent("Listo: «Shoppings CABA» ya está en Flyers para copiar.");
    expect(bucketFiles["_fuentes.json"]).toMatchObject({
      lista: [{ nombre: "Shoppings CABA", w: 1240, h: 6200, de: "" }],
    });
    expect(
      harness.network
        .to("/storage/v1/object/flyers/")
        .some(({ path }) => /fuente_\d+\.jpg$/.test(path)),
    ).toBe(true);
    await expect.element(sources().first()).toMatchTextContent("Shoppings CABA");
  });

  it("the window of Insertar does not stay with the list it had", async () => {
    const { harness } = await openStudio({ role: "admin" });
    harness.queryClient.setQueryData(SECTION_SOURCES_QUERY_KEY, []);
    await expect.element(page.getByTestId("sources-button")).toBeVisible();
    chooseFile(aPicture());
    await expect.element(field(), { timeout: 8000 }).toHaveValue("shop pings caba");
    await windowButton("Subir").click();
    await vi.waitFor(() => {
      expect(harness.queryClient.getQueryState(SECTION_SOURCES_QUERY_KEY)?.isInvalidated).toBe(
        true,
      );
    }, WAIT);
  });

  it("the others propose it: it goes to the table, and not to the depot", async () => {
    const { table, bucketFiles } = await openStudio();
    await expect
      .element(page.getByTestId("sources-button"))
      .toHaveTextContent("Proponer un flyer (PDF)");
    chooseFile(aPicture());
    await field().fill("Mío");
    await windowButton("Enviar propuesta").click();
    await expect.element(notice(), WAIT).toMatchTextContent(/^Propuesta enviada/);
    expect(bucketFiles["_fuentes.json"]).toBeUndefined();
    expect(table.rows[0]).toMatchObject({ tipo: "fuente", estado: "pedido", nombre: "Mío" });
    expect(Object(table.rows[0])["datos"]["img"]).toMatch(/^data:image\/jpeg;base64,/);
    await expect.element(proposals().first()).toMatchTextContent(/Esperando que el administrador/);
  });

  it("what is not a flyer, or too heavy, is refused", async () => {
    const { harness } = await openStudio();
    await expect.element(page.getByTestId("sources-button")).toBeVisible();
    chooseFile(new File(["x"], "nota.txt", { type: "text/plain" }));
    await expect
      .element(notice(), WAIT)
      .toMatchTextContent("Subí el flyer en PDF (o una imagen PNG o JPG).");
    chooseFile(new File([new ArrayBuffer(26 * 1024 * 1024)], "pesado.png", { type: "image/png" }));
    await expect.element(notice(), WAIT).toMatchTextContent("El archivo supera los 25 MB.");
    chooseFile(new File(["no es una imagen"], "roto.png", { type: "image/png" }));
    await expect.element(notice(), WAIT).toMatchTextContent("No se pudo leer ese archivo.");
    expect(harness.network.to("/storage/v1/object/flyers/")).toEqual([]);
  });

  it("no name asks for one, and cancelling leaves it free for another", async () => {
    await openStudio({ role: "admin" });
    await expect.element(page.getByTestId("sources-button")).toBeVisible();
    chooseFile(aPicture());
    await field().fill("");
    await windowButton("Subir").click();
    await expect.element(notice(), WAIT).toMatchTextContent("Hace falta un nombre.");
    chooseFile(aPicture());
    await windowButton("Cancelar").click();
    chooseFile(aPicture());
    await expect.element(field(), { timeout: 8000 }).toBeVisible();
  });

  it("one at a time", async () => {
    await openStudio({ role: "admin" });
    await expect.element(page.getByTestId("sources-button")).toBeVisible();
    chooseFile(aPicture());
    chooseFile(aPicture());
    await expect
      .element(notice(), WAIT)
      .toMatchTextContent("Esperá a que termine la subida anterior.");
  });

  it("a failure on uploading it, or on proposing it, says so", async () => {
    await openStudio({
      role: "admin",
      intercept: ({ method, path }) =>
        method === "POST" && /fuente_\d+\.jpg$/.test(path)
          ? jsonResponse({ statusCode: "500", error: "x", message: "no" }, 500)
          : null,
    });
    await expect.element(page.getByTestId("sources-button")).toBeVisible();
    chooseFile(aPicture());
    await field().fill("Uno");
    await windowButton("Subir").click();
    await expect.element(notice(), WAIT).toMatchTextContent(/^No se pudo subir:/);
  });

  it("a proposal that could not be sent says so", async () => {
    await openStudio({
      intercept: ({ method, path }) =>
        method === "POST" && path === "/rest/v1/flyer_disenos"
          ? jsonResponse({ message: "row-level security" }, 403)
          : null,
    });
    await expect.element(page.getByTestId("sources-button")).toBeVisible();
    chooseFile(aPicture());
    await field().fill("Uno");
    await windowButton("Enviar propuesta").click();
    await expect
      .element(notice(), WAIT)
      .toMatchTextContent("No se pudo enviar: no tenés permiso para hacer eso.");
  });

  it("the administrator approves one: the picture goes up and the row stays as a record", async () => {
    const { bucketFiles, table, harness } = await openStudio({
      role: "admin",
      designs: [PROPOSAL],
    });
    await expect.element(proposals().first()).toMatchTextContent("Propuesto por Ana Inventada");
    await expect.element(page.getByText("Propuestas para aprobar · 1")).toBeVisible();
    await expect.element(page.getByText("En el depósito · 0")).toBeVisible();
    await proposals().first().getByRole("button", { name: "Aprobar", exact: true }).click();
    await expect
      .element(notice(), WAIT)
      .toMatchTextContent("Aprobado: «Shoppings» ya está en Flyers para copiar.");
    expect(bucketFiles["_fuentes.json"]).toMatchObject({
      lista: [{ nombre: "Shoppings", de: "Ana Inventada", w: 1240 }],
    });
    expect(table.rows[0]).toMatchObject({ estado: "publicado", datos: {} });
    await vi.waitFor(() => {
      expect(harness.adminCalls()).toContainEqual({
        action: "notify_estudio",
        id: "p",
        que: "resuelto",
      });
    });
  });

  it("approving one that was resolved meanwhile, or that has no picture, says so", async () => {
    const { table } = await openStudio({ role: "admin", designs: [PROPOSAL] });
    await expect.element(proposals().first()).toBeVisible();
    const proposal = Object(table.rows[0]);
    proposal.datos = {};
    await proposals().first().getByRole("button", { name: "Aprobar", exact: true }).click();
    await expect
      .element(notice(), WAIT)
      .toMatchTextContent("No se pudo aprobar: la propuesta no trae la imagen");
    await vi.waitFor(() => {
      expect(page.getByTestId("source-proposal").elements().length).toBe(1);
    });
    proposal.estado = "publicado";
    await proposals().first().getByRole("button", { name: "Aprobar", exact: true }).click();
    await expect
      .element(notice(), WAIT)
      .toMatchTextContent("No se pudo aprobar: esa propuesta ya se resolvió o se canceló");
  });

  it("if it cannot be marked as approved, it says not to approve it again", async () => {
    await openStudio({
      role: "admin",
      designs: [PROPOSAL],
      intercept: ({ method, query }) =>
        method === "PATCH" && query.has("estado") ? jsonResponse({ message: "no" }, 500) : null,
    });
    await proposals().first().getByRole("button", { name: "Aprobar", exact: true }).click();
    await expect.element(notice(), WAIT).toMatchTextContent(/No la apruebes de nuevo/);
  });

  it("the administrator does not approve it, with or without a reason", async () => {
    const { table, harness } = await openStudio({ role: "admin", designs: [PROPOSAL] });
    await proposals().first().getByRole("button", { name: "No aprobar" }).click();
    await windowButton("Cancelar").click();
    expect(table.rows[0]?.estado).toBe("pedido");
    await proposals().first().getByRole("button", { name: "No aprobar" }).click();
    await field().fill("No sirve");
    await windowButton("No aprobar").click();
    await vi.waitFor(() => {
      expect(table.rows[0]).toMatchObject({ estado: "rechazado", nota_admin: "No sirve" });
    });
    await vi.waitFor(() => {
      expect(harness.adminCalls()).toContainEqual({
        action: "notify_estudio",
        id: "p",
        que: "resuelto",
      });
    });
  });

  it("not approving that fails says so", async () => {
    await openStudio({
      role: "admin",
      designs: [PROPOSAL],
      intercept: ({ method }) => (method === "PATCH" ? jsonResponse({ message: "no" }, 500) : null),
    });
    await proposals().first().getByRole("button", { name: "No aprobar" }).click();
    await windowButton("No aprobar").click();
    await expect.element(notice(), WAIT).toMatchTextContent("No se pudo: no");
  });

  it("whoever proposed it sees what happened and can take it back", async () => {
    const { table } = await openStudio({
      designs: [
        { ...PROPOSAL, user_id: ME },
        aDesign("q", {
          tipo: "fuente",
          estado: "rechazado",
          nota_admin: "No sirve",
          nombre: "Otra",
        }),
      ],
    });
    await expect.element(page.getByText("Tus propuestas · 2")).toBeVisible();
    await expect.element(proposals().nth(1)).toMatchTextContent("No aprobado: No sirve");
    await proposals().nth(0).getByRole("button", { name: "Cancelar" }).click();
    await confirm("Volver").click();
    expect(table.rows).toHaveLength(2);
    await proposals().nth(1).getByRole("button", { name: "Borrar" }).click();
    await expect
      .element(page.getByRole("alertdialog"))
      .toMatchTextContent(/¿Borrar la propuesta «Otra»\?/);
    await confirm("Borrar").click();
    await expect.element(notice(), WAIT).toMatchTextContent("Propuesta borrada.");
    expect(table.rows.map(({ id }) => id)).toEqual(["p"]);
  });

  it("a delete that fails says so", async () => {
    await openStudio({
      designs: [PROPOSAL],
      intercept: ({ method }) =>
        method === "DELETE" ? jsonResponse({ message: "no" }, 500) : null,
    });
    await proposals().first().getByRole("button", { name: "Cancelar" }).click();
    await confirm("Borrar").click();
    await expect.element(notice(), WAIT).toMatchTextContent("No se pudo: no");
  });

  it("a proposal can be looked at, and one without a picture says so", async () => {
    const { table } = await openStudio({ role: "admin", designs: [PROPOSAL] });
    await proposals().first().getByRole("button", { name: "Ver" }).click();
    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="flyer-viewer"] img')).not.toBeNull();
    });
    await page.getByTestId("viewer-close").click();
    Object(table.rows[0]).datos = {};
    await proposals().first().getByRole("button", { name: "Ver" }).click();
    await expect.element(notice(), WAIT).toMatchTextContent("No se pudo abrir ese flyer.");
  });

  it("a proposal that cannot be read to look at it says so", async () => {
    await openStudio({
      role: "admin",
      designs: [PROPOSAL],
      intercept: ({ method, query }) =>
        method === "GET" && query.get("select") === "nombre,datos"
          ? jsonResponse({ message: "no" }, 500)
          : null,
    });
    await proposals().first().getByRole("button", { name: "Ver" }).click();
    await expect.element(notice(), WAIT).toMatchTextContent("No se pudo abrir ese flyer.");
  });

  it("the depot is listed; everybody can look, only the administrator changes it", async () => {
    await openWithSources({}, (url) => [
      aSource({ url }, "f1", { mini: "data:image/jpeg;base64,AAAA", de: "Ana" }),
      { id: "ajena", img: "https://otro.example/x.jpg" },
    ]);
    await expect
      .element(sources().first())
      .toMatchTextContent(/Subido el 20\/10\/2026 · propuesto por Ana/);
    await vi.waitFor(() => {
      expect(page.getByTestId("source").elements()).toHaveLength(1);
    });
    await expect
      .element(sources().first().getByRole("button", { name: "Quitar" }))
      .not.toBeInTheDocument();
    await sources().first().getByRole("button", { name: "Ver" }).click();
    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="flyer-viewer"] img')).not.toBeNull();
    });
  });

  it("the administrator renames one and takes it off, without touching the picture", async () => {
    const { bucketFiles, harness } = await openWithSources({ role: "admin" }, (url) => [
      aSource({ url }, "f1"),
      aSource({ url }, "f2", { nombre: "" }),
    ]);
    await expect.element(sources().nth(1)).toMatchTextContent("Sin nombre");
    await sources().first().getByRole("button", { name: "Cambiar nombre" }).click();
    await windowButton("Cancelar").click();
    await sources().first().getByRole("button", { name: "Cambiar nombre" }).click();
    await field().fill("");
    await windowButton("Guardar").click();
    await expect.element(notice(), WAIT).toMatchTextContent("Hace falta un nombre.");
    await sources().first().getByRole("button", { name: "Cambiar nombre" }).click();
    await field().fill("Nuevo");
    await windowButton("Guardar").click();
    await vi.waitFor(() => {
      expect(bucketFiles["_fuentes.json"]).toMatchObject({
        lista: [{ nombre: "Nuevo" }, { id: "f2" }],
      });
    });
    await sources().first().getByRole("button", { name: "Quitar" }).click();
    await confirm("Volver").click();
    await sources().first().getByRole("button", { name: "Quitar" }).click();
    await confirm("Quitar").click();
    await expect.element(notice(), WAIT).toMatchTextContent("Quitado de Flyers para copiar.");
    expect(bucketFiles["_fuentes.json"]).toMatchObject({ lista: [{ id: "f2" }] });
    expect(harness.network.to("/storage/v1/object/flyers", "DELETE")).toEqual([]);
  });

  it("a list that answers 403 is not an empty one: nothing is written over it", async () => {
    let isCut = false;
    const { bucketFiles } = await openWithSources(
      {
        role: "admin",
        intercept: ({ method, path }) =>
          isCut && method === "GET" && path.endsWith("/_fuentes.json")
            ? jsonResponse({}, 403)
            : null,
      },
      (url) => [aSource({ url }, "f1")],
    );
    await expect.element(sources().first()).toBeVisible();
    const before = bucketFiles["_fuentes.json"];
    isCut = true;
    await sources().first().getByRole("button", { name: "Quitar" }).click();
    await confirm("Quitar").click();
    await expect
      .element(notice(), WAIT)
      .toMatchTextContent("No se pudo quitar: no se pudo leer la lista (403)");
    expect(bucketFiles["_fuentes.json"]).toBe(before);
    await sources().first().getByRole("button", { name: "Cambiar nombre" }).click();
    await field().fill("Nuevo");
    await windowButton("Guardar").click();
    await expect
      .element(notice(), WAIT)
      .toMatchTextContent("No se pudo guardar: no se pudo leer la lista (403)");
  });

  it("a list that does not answer says so, and with no network it is not an empty one", async () => {
    await openStudio({
      droppedFiles: ["_fuentes.json"],
    });
    await expect
      .element(page.getByTestId("sources-list"))
      .toMatchTextContent(/No se pudo leer la lista/);
    expect(document.querySelector('[data-testid="source"]')).toBeNull();
  });

  it("proposals that cannot be read do not stop the section", async () => {
    await openStudio({
      tables: {
        flyer_disenos: ({ query }) =>
          query.get("tipo") === "eq.fuente"
            ? jsonResponse({ message: "no such" }, 500)
            : jsonResponse([]),
      },
    });
    await expect.element(page.getByText("Todavía no hay flyers para copiar.")).toBeVisible();
  });

  it("a proposal too heavy to send is said", async () => {
    await openStudio();
    await expect.element(page.getByTestId("sources-button")).toBeVisible();
    chooseFile(aPicture());
    await field().fill("Pesado");
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
      `data:image/jpeg;base64,${"x".repeat(2_700_000)}`,
    );
    await windowButton("Enviar propuesta").click();
    await expect
      .element(notice(), WAIT)
      .toHaveTextContent("No se pudo enviar: el flyer es demasiado grande para mandarlo");
  });

  it("the number on the tab of the administrator counts them too", async () => {
    const { harness } = await openStudio({
      role: "admin",
      designs: [PROPOSAL, aDesign("d", { user_id: "x", estado: "pedido" })],
    });
    await expect.element(proposals().first()).toBeVisible();
    const notices = harness.queryClient.getQueryData<{ requests: number }>(["studio", "notices"]);
    expect(notices?.requests).toBe(2);
  });
});

describe("Marcas guardadas", () => {
  const SET = aDesign("s", {
    tipo: "combinacion",
    nombre: "Neuquén",
    autor: "Otra",
    user_id: "someone",
    v: "2",
    resumen: "1 franja",
    flyer: "Combustible",
    prov: "NEUQUEN",
    miniatura: "data:image/jpeg;base64,AAAA",
  });
  const cloud = { designs: [SET], role: "admin" };

  it("lists them with what they hold, and says when there are none", async () => {
    await openStudio(cloud);
    await expect.element(row()).toMatchTextContent(/1 franja · del flyer Combustible/);
    await expect.element(row()).toMatchTextContent(/de Otra/);
  });

  it("with none it says how to get one", async () => {
    await openStudio();
    await expect.element(page.getByText(/Todavía no guardaste marcas/)).toBeVisible();
  });

  it("a list that could not be read says so", async () => {
    await openStudio({
      tables: {
        flyer_disenos: ({ query }) =>
          query.get("tipo") === "eq.combinacion"
            ? jsonResponse({ message: "permission denied" }, 403)
            : jsonResponse([]),
      },
    });
    await expect.element(page.getByText(/No se pudieron leer: no tenés permiso/)).toBeVisible();
  });

  it("are read again on showing the screen", async () => {
    const { table, show } = await openStudio({ ...cloud, isActive: false });
    await expect.element(row()).toBeVisible();
    table.rows = [{ ...SET, nombre: "Otro nombre" }];
    await show(true);
    await expect.element(row()).toMatchTextContent("Otro nombre");
  });

  it("Aplicar asks the editor", async () => {
    const { works } = await openStudio(cloud);
    await row().getByRole("button", { name: "Aplicar en el flyer" }).click();
    expect(works.applySavedSet).toHaveBeenCalledWith("s");
  });

  it("renames one, and only if the name changed", async () => {
    const { table, harness } = await openStudio(cloud);
    await row().getByRole("button", { name: "Cambiar nombre" }).click();
    await expect.element(field()).toHaveValue("Neuquén");
    await windowButton("Guardar").click();
    expect(harness.network.to("/rest/v1/flyer_disenos", "PATCH")).toEqual([]);
    await row().getByRole("button", { name: "Cambiar nombre" }).click();
    await field().fill("Neuquén capital");
    await windowButton("Guardar").click();
    await vi.waitFor(() => {
      expect(table.rows[0]?.nombre).toBe("Neuquén capital");
    });
    await expect.element(row()).toMatchTextContent("Neuquén capital");
  });

  it("a rename that fails says so", async () => {
    await openStudio({
      ...cloud,
      intercept: ({ method }) =>
        method === "PATCH" ? jsonResponse({ message: "row-level security" }, 403) : null,
    });
    await row().getByRole("button", { name: "Cambiar nombre" }).click();
    await field().fill("Otro");
    await windowButton("Guardar").click();
    await expect
      .element(notice(), WAIT)
      .toMatchTextContent("No se pudo: no tenés permiso para hacer eso.");
  });

  it("deletes one after asking", async () => {
    const { table } = await openStudio(cloud);
    await row().getByRole("button", { name: "Borrar" }).click();
    await confirm("Cancelar").click();
    expect(table.rows).toHaveLength(1);
    await row().getByRole("button", { name: "Borrar" }).click();
    await confirm("Borrar").click();
    await expect.element(notice(), WAIT).toMatchTextContent("Listo: «Neuquén» borrada.");
    expect(table.rows).toEqual([]);
  });

  it("a delete that fails says so", async () => {
    await openStudio({
      ...cloud,
      intercept: ({ method }) =>
        method === "DELETE" ? jsonResponse({ message: "permission" }, 403) : null,
    });
    await row().getByRole("button", { name: "Borrar" }).click();
    await confirm("Borrar").click();
    await expect
      .element(notice(), WAIT)
      .toMatchTextContent("No se pudo borrar: no tenés permiso para hacer eso.");
  });
});
