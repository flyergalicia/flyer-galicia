// Config → Flyer: the list of the flyers of each option, activating, deactivating and deleting, and
// uploading a flyer up to its calibrator.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import {
  deferred,
  jsonResponse,
  type RecordedRequest,
} from "@/shared/supabase/testing/recording-fetch.ts";
import { FIRST_PLACE, goToSheet, rememberPlace } from "../model/panel.ts";
import { openPanel, type PanelOptions } from "../testing/panel-cloud.ts";

const LIST_PATH = "/storage/v1/object/list/flyers";
const OPTIONS = {
  opts: [
    { n: 1, nombre: "Opción 1" },
    { n: 9, nombre: "Combustible" },
    { n: 8, nombre: "Rubro", solapa: "rubros" },
    { n: 3, nombre: "VIEJO Algo" },
  ],
};
const ACTIVE_NINE = {
  name: "flyer_1_op9.jpg",
  imageUrl: "https://cubo/flyers/flyer_1_op9.jpg?v=1",
  cfg: { imgH: 7000 },
};

type Listed = Record<string, unknown>[];

interface SheetOptions extends PanelOptions {
  readonly listed?: Listed | "fails";
  readonly removeFails?: boolean;
}

const sheet = () => page.getByTestId("admin-flyer-config");
const list = () => page.getByTestId("flyer-list");
const notice = () => page.getByRole("status");
const question = () => page.getByTestId("option-question");
const versions = () => list().getByTestId("flyer-version");

function listAnswer(listed: SheetOptions["listed"]) {
  return (request: RecordedRequest): Response | null => {
    if (request.path === LIST_PATH) {
      return listed === "fails"
        ? jsonResponse({ statusCode: "500", error: "x", message: "sin lista" }, 500)
        : jsonResponse(listed ?? []);
    }
    return null;
  };
}

async function openSheet({
  listed,
  removeFails = false,
  files,
  intercept,
  ...options
}: SheetOptions = {}) {
  rememberPlace(goToSheet(FIRST_PLACE, "subir"));
  const answer = listAnswer(listed);
  const opened = await openPanel({
    files: { "_opciones.json": OPTIONS, "_active9.json": ACTIVE_NINE, ...files },
    intercept: async (request) => {
      const own = await intercept?.(request);
      if (own) return own;
      if (request.method === "DELETE" && request.path === "/storage/v1/object/flyers") {
        return removeFails
          ? jsonResponse({ statusCode: "500", error: "x", message: "no se pudo" }, 500)
          : jsonResponse([{ name: "x" }]);
      }
      return answer(request);
    },
    ...options,
  });
  await expect.element(sheet()).toBeVisible();
  return opened;
}

async function writtenJson(request: RecordedRequest | undefined): Promise<unknown> {
  const body = request?.init?.body;
  if (body === undefined || body === null) return null;
  const content =
    body instanceof FormData ? [...body.values()].find((value) => typeof value !== "string") : body;
  return content === undefined ? null : JSON.parse(await new Response(content).text());
}

function uploadsTo(harness: Awaited<ReturnType<typeof openPanel>>["harness"], file: string) {
  return harness.network.to(`/storage/v1/object/flyers/${file}`, "POST");
}

async function pictureFile(name = "nuevo.png"): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = 124;
  canvas.height = 600;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No canvas");
  context.fillStyle = "#336699";
  context.fillRect(0, 0, 124, 600);
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/png");
  });
  if (!blob) throw new Error("No picture");
  return new File([blob], name, { type: "image/png" });
}

/** A flyer painted for the test, as a picture the browser can load without any network. */
function paintedFlyerAddress(): string {
  const canvas = document.createElement("canvas");
  canvas.width = 1240;
  canvas.height = 2000;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No canvas");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, 1240, 2000);
  return canvas.toDataURL("image/jpeg");
}

/** The pictures of the bucket come from here: no test reaches a network. */
function picturesFrom(address: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
  const setter: unknown = descriptor ? Reflect.get(descriptor, "set") : undefined;
  vi.spyOn(HTMLImageElement.prototype, "src", "set").mockImplementation(function setSource(
    this: HTMLImageElement,
    value: string,
  ) {
    const local = value.startsWith("blob:") || value.startsWith("data:");
    if (typeof setter === "function") Reflect.apply(setter, this, [local ? value : address]);
  });
}

/** `_active9.json` with an HTML of the build, at an address made from that of the bucket. */
function withHtml(htmlUrl: (home: string) => string) {
  return (request: RecordedRequest) =>
    request.path.endsWith("/_active9.json")
      ? jsonResponse({
          ...ACTIVE_NINE,
          htmlUrl: htmlUrl(request.url.replace(/_active9\.json.*$/, "")),
        })
      : null;
}

beforeEach(async () => {
  await page.viewport(1366, 800);
});

afterEach(() => {
  rememberPlace(FIRST_PLACE);
  vi.restoreAllMocks();
});

describe("the list of flyers", () => {
  it("the options with a flyer first; those without one last, with how to remove them", async () => {
    await openSheet();
    await expect.element(list()).toBeVisible();
    const text = list().element().textContent ?? "";
    expect(text).toMatch(/OP\.9Combustibleflyer_1_op9\.jpgDesactivar/);
    expect(text).toMatch(
      /Sin flyer activo \(3\)\. Siguen en la barra de quienes las tienen habilitadas, con el cartel «todavía no tiene flyer»\. Para que no aparezcan más: Config → Opciones → Quitar\./,
    );
    expect(text.indexOf("Combustible")).toBeLessThan(text.indexOf("VIEJO Algo"));
    expect(text).toMatch(
      /Opción 1: sin flyer activo\.VIEJO Algo: sin flyer activo\.Rubro: sin flyer activo\./,
    );
    expect(text).toMatch(/Sin versiones subidas aún\./);
  });

  it("each version says its flyer, whether it is active, and what it offers", async () => {
    await openSheet({
      listed: [
        { name: "_active9.json" },
        {
          name: "flyer_1_op9.jpg",
          created_at: "2026-10-20T10:00:00Z",
          metadata: { size: 812_345 },
        },
        { name: "flyer_2_op8.jpg", created_at: "2026-10-19T10:00:00Z" },
        { name: "index_3.html" },
      ],
    });
    await expect.poll(() => versions().all().length).toBe(3);
    const [active, other, html] = versions().all();
    expect(active?.element().textContent).toMatch(
      /^OP\.9CombustibleACTIVOPDF\/IMGflyer_1_op9\.jpg · 20\/10\/2026 · 793 KBOtra opción…CalibrarVerBorrar$/,
    );
    expect(active?.getByRole("button", { name: "Borrar" }).element()).toHaveProperty(
      "disabled",
      true,
    );
    expect(active?.getByRole("button", { name: "Borrar" }).element().getAttribute("title")).toBe(
      "Desactivá primero",
    );
    expect(other?.element().textContent).toMatch(
      /^OP\.8RubroNO ACTIVOPDF\/IMGflyer_2_op8\.jpg · 19\/10\/2026ActivarOtra opción…CalibrarVerBorrar$/,
    );
    expect(
      other?.getByRole("button", { name: "Activar", exact: true }).element().getAttribute("title"),
    ).toBe("Activar en Rubro");
    expect(html?.element().textContent).toBe("Sin opción asignadaindex_3.htmlActivar en…VerBorrar");
  });

  it("a list that could not be read says so, never that there are no flyers (invariant 24)", async () => {
    const { harness } = await openSheet({ listed: "fails" });
    const problem = sheet().getByTestId("read-problem");
    await expect.element(problem).toBeVisible();
    expect(problem.element().textContent).toMatch(
      /No se pudo leer la lista de flyers: sin lista\./,
    );
    expect(list().query()).toBeNull();
    harness.network.answerWith((request) =>
      request.path === LIST_PATH ? jsonResponse([]) : jsonResponse(null),
    );
    await userEvent.click(problem.getByRole("button", { name: "Reintentar" }));
    await expect.element(list()).toBeVisible();
  });

  it("the flyer of an option that did not arrive is not «sin flyer» either", async () => {
    await openSheet({ droppedFiles: ["_active9.json"] });
    await expect.element(sheet().getByTestId("read-problem")).toBeVisible();
    expect(sheet().element().textContent).toMatch(/no se pudo leer qué flyer tiene cada opción/);
    expect(sheet().element().textContent).not.toMatch(/sin flyer activo/);
  });

  it("an HTML of the build is linked only if it lives in our bucket", async () => {
    const outside = await openSheet({ intercept: withHtml(() => "javascript:x") });
    await expect.element(list()).toBeVisible();
    expect(list().getByRole("link").query()).toBeNull();
    await outside.screen.unmount();
    await openSheet({ intercept: withHtml((home) => `${home}index_1.html`) });
    await expect
      .element(list().getByRole("link", { name: "Ver" }))
      .toHaveAttribute("href", expect.stringMatching(/flyers\/index_1\.html$/));
  });
});

describe("activating, deactivating and deleting", () => {
  it("Desactivar asks first; Cancelar leaves it, and yes takes the picture out, not the option", async () => {
    const { harness } = await openSheet();
    await userEvent.click(list().getByRole("button", { name: "Desactivar" }));
    const confirm = page.getByRole("alertdialog");
    expect(confirm.element().querySelector("h2")?.textContent).toBe(
      "¿Desactivar el flyer de «Combustible»?",
    );
    expect(confirm.element().textContent).toMatch(
      /Se saca la imagen, no la opción: sigue en la barra y quien la elija ve el cartel «todavía no tiene flyer» y no puede descargar\. Para sacarla de la barra: Config → Opciones → Quitar\./,
    );
    await userEvent.click(confirm.getByRole("button", { name: "Cancelar" }));
    expect(uploadsTo(harness, "_active9.json")).toEqual([]);
    await userEvent.click(list().getByRole("button", { name: "Desactivar" }));
    await userEvent.click(
      page.getByRole("alertdialog").getByRole("button", { name: "Desactivar" }),
    );
    await expect.poll(() => uploadsTo(harness, "_active9.json").length).toBe(1);
    expect(await writtenJson(uploadsTo(harness, "_active9.json")[0])).toMatchObject({
      name: "",
      imageUrl: null,
    });
    await expect.poll(() => notice().element().textContent).toBe("Combustible desactivada.");
    expect(harness.network.to("/storage/v1/object/flyers/_opciones.json", "POST")).toEqual([]);
  });

  it("what the server refuses is said", async () => {
    await openSheet({
      intercept: (request) =>
        request.method === "POST" && request.path.endsWith("_active9.json")
          ? jsonResponse({ statusCode: "500", error: "x", message: "falla simulada" }, 500)
          : null,
    });
    await userEvent.click(list().getByRole("button", { name: "Desactivar" }));
    await userEvent.click(
      page.getByRole("alertdialog").getByRole("button", { name: "Desactivar" }),
    );
    await expect
      .poll(() => notice().element().textContent)
      .toBe("No se pudo desactivar: falla simulada");
  });

  it("Activar puts a version in its own option, with a new address and its calibration", async () => {
    const { harness } = await openSheet({
      listed: [{ name: "flyer_2_op8.jpg" }],
      files: { "_flyer_cfgs.json": { "flyer_2_op8.jpg": { imgH: 7711 } } },
    });
    await userEvent.click(versions().first().getByRole("button", { name: "Activar", exact: true }));
    await expect.poll(() => uploadsTo(harness, "_active8.json").length).toBe(1);
    expect(await writtenJson(uploadsTo(harness, "_active8.json")[0])).toMatchObject({
      name: "flyer_2_op8.jpg",
      imageUrl: expect.stringMatching(/flyer_2_op8\.jpg\?v=\d+$/),
      cfg: { imgH: 7711 },
    });
    await expect
      .poll(() => notice().element().textContent)
      .toBe('"flyer_2_op8.jpg" activado en Rubro');
  });

  it("calibrations that could not be read do not activate with none (invariant 24)", async () => {
    const { harness } = await openSheet({
      listed: [{ name: "flyer_2_op8.jpg" }],
      droppedFiles: ["_flyer_cfgs.json"],
    });
    await userEvent.click(versions().first().getByRole("button", { name: "Activar", exact: true }));
    await expect
      .poll(() => notice().element().textContent)
      .toBe("Error al activar: no se pudieron leer las calibraciones guardadas");
    expect(uploadsTo(harness, "_active8.json")).toEqual([]);
  });

  it("Otra opción… asks which one, by tab; Cancelar does nothing", async () => {
    const { harness } = await openSheet({ listed: [{ name: "flyer_2_op8.jpg" }] });
    await userEvent.click(versions().first().getByRole("button", { name: "Otra opción…" }));
    await expect.element(question()).toBeVisible();
    expect(question().element().textContent).toBe(
      '¿En qué otra opción activar "flyer_2_op8.jpg"?Elegí a qué armador corresponde.Flyer GaliciaOpción 1VIEJO AlgoCombustibleFlyer RubrosRubroCancelar',
    );
    await userEvent.click(question().getByRole("button", { name: "Cancelar" }));
    expect(question().query()).toBeNull();
    await userEvent.click(versions().first().getByRole("button", { name: "Otra opción…" }));
    await userEvent.click(page.getByRole("button", { name: "Cerrar la pregunta" }), {
      position: { x: 5, y: 5 },
    });
    expect(question().query()).toBeNull();
    await userEvent.click(versions().first().getByRole("button", { name: "Otra opción…" }));
    await userEvent.click(question().getByRole("button", { name: "VIEJO Algo" }));
    await expect.poll(() => uploadsTo(harness, "_active3.json").length).toBe(1);
    expect(uploadsTo(harness, "_active9.json"), "what was cancelled did nothing").toEqual([]);
  });

  it("an HTML of the build is activated by taking out its picture", async () => {
    const { harness } = await openSheet({
      listed: [{ name: "index_3.html" }],
      intercept: (request) => {
        if (request.path === LIST_PATH) return jsonResponse([{ name: "index_3.html" }]);
        if (request.path.endsWith("/index_3.html")) {
          return new Response(`baseImg.src="data:image/jpeg;base64,${btoa("jpg")}"`, {
            status: 200,
          });
        }
        return null;
      },
    });
    await userEvent.click(versions().first().getByRole("button", { name: "Activar en…" }));
    await userEvent.click(question().getByRole("button", { name: "Combustible" }));
    await expect.poll(() => uploadsTo(harness, "_active9.json").length).toBe(1);
    expect(uploadsTo(harness, "_active9_img.jpg")).toHaveLength(1);
    expect(await writtenJson(uploadsTo(harness, "_active9.json")[0])).toMatchObject({
      name: "index_3.html",
      htmlUrl: expect.stringMatching(/index_3\.html$/),
      imageUrl: expect.stringMatching(/_active9_img\.jpg\?v=\d+$/),
    });
  });

  it("a file with quotes in its name is shown as text, and its buttons act on it (invariant 12)", async () => {
    const name = `flyer'"><img src=x onerror=window.__roto=1>_op8.jpg`;
    const { harness } = await openSheet({ listed: [{ name }] });
    await expect.poll(() => versions().all().length).toBe(1);
    expect(versions().first().element().querySelector("img")).toBeNull();
    expect(versions().first().element().textContent).toContain(name);
    await userEvent.click(versions().first().getByRole("button", { name: "Activar", exact: true }));
    await expect.poll(() => uploadsTo(harness, "_active8.json").length).toBe(1);
    expect(await writtenJson(uploadsTo(harness, "_active8.json")[0])).toMatchObject({ name });
    expect(Reflect.has(window, "__roto")).toBe(false);
  });

  it("Borrar deletes a file no option uses, and says it", async () => {
    const { harness } = await openSheet({ listed: [{ name: "flyer_2_op8.jpg" }] });
    await userEvent.click(versions().first().getByRole("button", { name: "Borrar" }));
    await expect.poll(() => notice().element().textContent).toBe("Archivo eliminado");
    expect(harness.network.to("/storage/v1/object/flyers", "DELETE")).toHaveLength(1);
  });

  it("a file that could not be deleted says so", async () => {
    await openSheet({ listed: [{ name: "flyer_2_op8.jpg" }], removeFails: true });
    await userEvent.click(versions().first().getByRole("button", { name: "Borrar" }));
    await expect.poll(() => notice().element().textContent).toBe("No se pudo borrar: no se pudo");
  });

  it("Ver opens the file apart", async () => {
    const opened = vi.spyOn(window, "open").mockReturnValue(null);
    await openSheet({ listed: [{ name: "flyer_2_op8.jpg" }] });
    await userEvent.click(versions().first().getByRole("button", { name: "Ver" }));
    expect(opened).toHaveBeenCalledWith(
      expect.stringMatching(/flyers\/flyer_2_op8\.jpg$/),
      "_blank",
      "noopener",
    );
  });
});

describe("uploading a flyer", () => {
  it("the field takes PDF, images and the HTML of the build", async () => {
    await openSheet();
    expect(sheet().getByTestId("flyer-file").element().getAttribute("accept")).toBe(
      ".pdf,.png,.jpg,.jpeg,.html,application/pdf,image/*,text/html",
    );
  });

  it("asks which flyer first, and refuses what is not a flyer saying why", async () => {
    const { harness } = await openSheet();
    await userEvent.upload(sheet().getByTestId("flyer-file"), [
      new File(["x"], "datos.txt", { type: "text/plain" }),
    ]);
    await userEvent.click(question().getByRole("button", { name: "Combustible" }));
    await expect
      .poll(() => sheet().getByTestId("flyer-upload-error").element().textContent)
      .toBe("Formatos permitidos: PDF, PNG, JPG o HTML.");
    expect(harness.network.to("/storage/v1/object/flyers/", "POST")).toEqual([]);
  });

  it("a file of more than 25 MB is refused", async () => {
    await openSheet();
    const big = new File([new Uint8Array(25 * 1024 * 1024 + 1)], "grande.pdf", {
      type: "application/pdf",
    });
    await userEvent.upload(sheet().getByTestId("flyer-file"), [big]);
    await userEvent.click(question().getByRole("button", { name: "Combustible" }));
    await expect
      .poll(() => sheet().getByTestId("flyer-upload-error").element().textContent)
      .toBe("El archivo supera los 25 MB.");
  });

  it("an HTML goes up as it is, without asking, and shows its address", async () => {
    const { harness } = await openSheet();
    await userEvent.upload(sheet().getByTestId("flyer-file"), [
      new File(["<html></html>"], "flyer.html", { type: "text/html" }),
    ]);
    await expect
      .poll(() => harness.network.to("/storage/v1/object/flyers/index_", "POST").length)
      .toBe(1);
    expect(question().query()).toBeNull();
    await expect.element(sheet().getByText("¡Archivo subido exitosamente!")).toBeVisible();
    await expect.element(sheet().getByText("URL pública:")).toBeVisible();
    await expect.poll(() => notice().element().textContent).toBe("Flyer subido OK");
    const write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    await userEvent.click(sheet().getByRole("button", { name: "Copiar URL" }));
    expect(write).toHaveBeenCalledWith(expect.stringMatching(/index_\d+\.html$/));
    await expect.poll(() => notice().element().textContent).toBe("URL copiada");
    const saved: HTMLAnchorElement[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.push(this);
    });
    await userEvent.click(sheet().getByRole("button", { name: "Descargar" }));
    click.mockRestore();
    expect(saved.map((link) => [link.download, link.href])).toEqual([
      ["index.html", expect.stringMatching(/index_\d+\.html$/)],
    ]);
  });

  it("an HTML that could not go up says so", async () => {
    await openSheet({
      intercept: (request) =>
        request.path.includes("/object/flyers/index_")
          ? jsonResponse({ statusCode: "500", error: "x", message: "sin lugar" }, 500)
          : null,
    });
    await userEvent.upload(sheet().getByTestId("flyer-file"), [
      new File(["<html></html>"], "flyer.html", { type: "text/html" }),
    ]);
    await expect
      .poll(() => sheet().getByTestId("flyer-upload-error").element().textContent)
      .toBe("Error al subir: sin lugar");
  });

  it("a picture is converted, goes up with a name of its own kept a year, and opens the calibrator", async () => {
    const { harness } = await openSheet({ files: { "_legal9.json": { text: "Legal de nueve" } } });
    await userEvent.upload(sheet().getByTestId("flyer-file"), [await pictureFile()]);
    await userEvent.click(question().getByRole("button", { name: "Combustible" }));
    const calibrator = page.getByTestId("calibrator");
    await expect.element(calibrator).toBeVisible();
    const [image] = harness.network.to("/storage/v1/object/flyers/flyer_", "POST");
    expect(image?.path).toMatch(/flyer_\d+_op9\.jpg$/);
    const form = image?.init?.body;
    expect(form instanceof FormData && form.get("cacheControl")).toBe("31536000");
    await expect
      .poll(() => sheet().element().textContent)
      .toMatch(/¡Flyer convertido! Acomodá las zonas y guardá \(Combustible\)\./);
    expect(calibrator.element().querySelector("h3")?.textContent).toBe(
      "Calibrar flyer — Combustible",
    );
    await userEvent.click(calibrator.getByRole("button", { name: "Guardar y activar" }));
    await expect.element(calibrator).not.toBeInTheDocument();
    const [saved] = uploadsTo(harness, "_flyer_cfgs.json");
    const [active] = uploadsTo(harness, "_active9.json");
    expect(Object.keys(Object(await writtenJson(saved)))[0]).toMatch(/flyer_\d+_op9\.jpg/);
    expect(await writtenJson(active)).toMatchObject({
      imageUrl: expect.stringMatching(/flyer_\d+_op9\.jpg\?v=\d+$/),
      cfg: { imgW: 1240 },
    });
    await expect
      .poll(() => notice().element().textContent)
      .toBe("¡Calibración guardada y activada en Combustible!");
  });

  it("leaving the calibrator without saving writes nothing", async () => {
    const { harness } = await openSheet();
    await userEvent.upload(sheet().getByTestId("flyer-file"), [await pictureFile()]);
    await userEvent.click(question().getByRole("button", { name: "Combustible" }));
    const calibrator = page.getByTestId("calibrator");
    await expect.element(calibrator).toBeVisible();
    await userEvent.click(calibrator.getByRole("button", { name: "Empresa", exact: true }));
    await userEvent.fill(
      calibrator.getByTestId("zone-properties").getByRole("spinbutton").first(),
      "60",
    );
    await userEvent.click(calibrator.getByRole("button", { name: "Cerrar" }));
    await expect.element(calibrator).not.toBeInTheDocument();
    expect(uploadsTo(harness, "_flyer_cfgs.json")).toEqual([]);
    expect(uploadsTo(harness, "_active9.json")).toEqual([]);
  });

  it("a calibration that could not be saved keeps the calibrator open, to try again", async () => {
    await openSheet({
      intercept: (request) =>
        request.method === "POST" && request.path.endsWith("_active9.json")
          ? jsonResponse({ statusCode: "500", error: "x", message: "falla simulada" }, 500)
          : null,
    });
    await userEvent.upload(sheet().getByTestId("flyer-file"), [await pictureFile()]);
    await userEvent.click(question().getByRole("button", { name: "Combustible" }));
    const calibrator = page.getByTestId("calibrator");
    await userEvent.click(calibrator.getByRole("button", { name: "Guardar y activar" }));
    await expect
      .poll(() => notice().element().textContent)
      .toBe("Error al activar la calibración: falla simulada");
    await expect.element(calibrator).toBeVisible();
    await userEvent.click(calibrator.getByRole("button", { name: "Cerrar" }));
    await expect.element(calibrator).not.toBeInTheDocument();
  });

  it("a picture that could not go up, or not be read, says so", async () => {
    await openSheet({
      intercept: (request) =>
        request.path.includes("/object/flyers/flyer_")
          ? jsonResponse({ statusCode: "500", error: "x", message: "sin lugar" }, 500)
          : null,
    });
    await userEvent.upload(sheet().getByTestId("flyer-file"), [await pictureFile()]);
    await userEvent.click(question().getByRole("button", { name: "Combustible" }));
    await expect
      .poll(() => sheet().getByTestId("flyer-upload-error").element().textContent)
      .toBe("Error al subir: sin lugar");
    await userEvent.upload(sheet().getByTestId("flyer-file"), [
      new File(["no es una imagen"], "rota.png", { type: "image/png" }),
    ]);
    await userEvent.click(question().getByRole("button", { name: "Combustible" }));
    await expect
      .poll(() => sheet().getByTestId("flyer-upload-error").element().textContent)
      .toBe("No se pudo procesar el archivo.");
  });

  it("a file dropped on the box goes the same way", async () => {
    await openSheet();
    const box = sheet()
      .getByRole("button", { name: /Hacé clic o arrastrá/ })
      .element();
    const transfer = new DataTransfer();
    transfer.items.add(new File(["x"], "datos.txt", { type: "text/plain" }));
    box.dispatchEvent(
      new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: transfer }),
    );
    await expect.poll(() => box.className).toMatch(/_over_/);
    box.dispatchEvent(new DragEvent("dragleave", { bubbles: true }));
    await expect.poll(() => box.className).not.toMatch(/_over_/);
    box.dispatchEvent(
      new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }),
    );
    await expect.element(question()).toBeVisible();
  });
});

describe("calibrating a version of the list", () => {
  it("opens on the option it is active in, with what was saved for it", async () => {
    picturesFrom(paintedFlyerAddress());
    await openSheet({
      listed: [{ name: "flyer_1_op9.jpg" }],
      files: { "_flyer_cfgs.json": { "flyer_1_op9.jpg": { empresa: { fs: 77 } } } },
    });
    await userEvent.click(versions().first().getByRole("button", { name: "Calibrar" }));
    const calibrator = page.getByTestId("calibrator");
    await expect.element(calibrator).toBeVisible();
    expect(calibrator.element().querySelector("h3")?.textContent).toBe(
      "Calibrar flyer — Combustible",
    );
    await userEvent.click(calibrator.getByRole("button", { name: "Empresa", exact: true }));
    await expect
      .element(calibrator.getByTestId("zone-properties").getByRole("spinbutton").first())
      .toHaveValue(77);
  });

  it("a file of no option asks which one first", async () => {
    picturesFrom(paintedFlyerAddress());
    await openSheet({ listed: [{ name: "viejo.jpg" }] });
    await userEvent.click(versions().first().getByRole("button", { name: "Calibrar" }));
    expect(question().element().querySelector("h3")?.textContent).toBe(
      "¿Qué opción querés calibrar?",
    );
    await userEvent.click(question().getByRole("button", { name: "Rubro" }));
    await expect
      .poll(() => page.getByTestId("calibrator").element().querySelector("h3")?.textContent)
      .toBe("Calibrar flyer — Rubro (Flyer Rubros)");
  });

  it("a picture that does not arrive says so", async () => {
    picturesFrom("data:image/png;base64,roto");
    await openSheet({ listed: [{ name: "flyer_1_op9.jpg" }] });
    await userEvent.click(versions().first().getByRole("button", { name: "Calibrar" }));
    await expect
      .poll(() => notice().element().textContent)
      .toBe("No se pudo cargar la imagen del flyer");
    expect(page.getByTestId("calibrator").query()).toBeNull();
  });

  it("calibrations that could not be read are said: it opens with the factory one", async () => {
    picturesFrom(paintedFlyerAddress());
    await openSheet({ listed: [{ name: "flyer_1_op9.jpg" }], droppedFiles: ["_flyer_cfgs.json"] });
    await userEvent.click(versions().first().getByRole("button", { name: "Calibrar" }));
    await expect
      .poll(() => notice().element().textContent)
      .toBe("No se pudo leer la calibración guardada de este flyer.");
  });

  it("what arrives late for a calibrator already closed does not reach the open one (invariant 6)", async () => {
    picturesFrom(paintedFlyerAddress());
    const late = deferred<Response>();
    let reads = 0;
    await openSheet({
      listed: [{ name: "flyer_1_op9.jpg" }, { name: "flyer_2_op8.jpg" }],
      intercept: (request) => {
        if (!request.path.endsWith("/_flyer_cfgs.json") || request.method !== "GET") return null;
        reads += 1;
        if (reads === 1) return late.promise;
        return jsonResponse({ "flyer_2_op8.jpg": { empresa: { fs: 50 } } });
      },
    });
    const calibrator = page.getByTestId("calibrator");
    await userEvent.click(versions().first().getByRole("button", { name: "Calibrar" }));
    await expect.element(calibrator).toBeVisible();
    await userEvent.click(calibrator.getByRole("button", { name: "Cerrar" }));
    await userEvent.click(versions().last().getByRole("button", { name: "Calibrar" }));
    await expect
      .poll(() => calibrator.element().querySelector("h3")?.textContent)
      .toBe("Calibrar flyer — Rubro (Flyer Rubros)");
    late.resolve(
      jsonResponse({
        "flyer_1_op9.jpg": { empresa: { fs: 99 } },
        "flyer_2_op8.jpg": { empresa: { fs: 99 } },
      }),
    );
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    await userEvent.click(calibrator.getByRole("button", { name: "Empresa", exact: true }));
    await expect
      .element(calibrator.getByTestId("zone-properties").getByRole("spinbutton").first())
      .toHaveValue(50);
  });

  it("a calibrator closed before its calibrations arrive neither complains nor reads its legal text", async () => {
    picturesFrom(paintedFlyerAddress());
    const late = deferred<Response>();
    const { harness } = await openSheet({
      listed: [{ name: "flyer_1_op9.jpg" }],
      intercept: (request) =>
        request.path.endsWith("/_flyer_cfgs.json") && request.method === "GET"
          ? late.promise
          : null,
    });
    const calibrator = page.getByTestId("calibrator");
    await userEvent.click(versions().first().getByRole("button", { name: "Calibrar" }));
    await expect.element(calibrator).toBeVisible();
    await userEvent.click(calibrator.getByRole("button", { name: "Cerrar" }));
    late.resolve(jsonResponse({ statusCode: "500", error: "x", message: "caída" }, 500));
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    expect(notice().element().textContent).not.toBe(
      "No se pudo leer la calibración guardada de este flyer.",
    );
    expect(harness.network.to("/storage/v1/object/public/flyers/_legal9.json", "GET")).toEqual([]);
  });
});

describe("what is read before the list", () => {
  it("a list of options that could not be read is said, and can be read again", async () => {
    const { harness } = await openSheet({ droppedFiles: ["_opciones.json"] });
    const problem = sheet().getByTestId("read-problem");
    await expect.element(problem).toBeVisible();
    expect(problem.element().textContent).toMatch(
      /No se pudo leer la lista de flyers: no se pudo leer la lista de opciones\./,
    );
    harness.network.answerWith((request) => {
      if (request.path === LIST_PATH) return jsonResponse([]);
      return request.path.endsWith("/_opciones.json") ? jsonResponse(OPTIONS) : jsonResponse(null);
    });
    await userEvent.click(problem.getByRole("button", { name: "Reintentar" }));
    await expect.element(list()).toBeVisible();
    expect(sheet().getByTestId("read-problem").query()).toBeNull();
  });

  it("the bar goes up by itself while a picture goes up, and leaves when it ends", async () => {
    const slow = deferred<Response>();
    await openSheet({
      intercept: (request) =>
        request.path.includes("/object/flyers/flyer_") ? slow.promise : null,
    });
    await userEvent.upload(sheet().getByTestId("flyer-file"), [await pictureFile()]);
    await userEvent.click(question().getByRole("button", { name: "Combustible" }));
    const percent = () =>
      sheet()
        .getByText(/^\d+%$/)
        .query()?.textContent;
    await expect.poll(percent, { timeout: 5000 }).toBe("80%");
    expect(
      sheet()
        .getByRole("button", { name: /Hacé clic o arrastrá/ })
        .element(),
    ).toHaveProperty("disabled", true);
    slow.resolve(jsonResponse({ Key: "x" }));
    await expect.poll(percent).toBe("100%");
    await expect.poll(percent).toBeUndefined();
  });
});
