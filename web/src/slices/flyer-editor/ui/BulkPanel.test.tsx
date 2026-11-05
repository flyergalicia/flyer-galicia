// Masivo, whole: a real sheet in its field, the real ZIP that comes out and what is left behind.
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { workspaceOnScreen } from "@/shared/lib/flyer-workspace/testing/painted-flyer.ts";
import type { AppAnswers } from "@/shared/lib/testing/app-harness.tsx";
import { jsonResponse, type RecordedRequest } from "@/shared/supabase/testing/recording-fetch.ts";
import { ALLOWED, flyerFiles, flyerShown, open } from "../testing/editor-on-screen.tsx";

const OK_SHEET = [
  ["empresa", "config", "asesor1_nombre", "asesor1_celular", "asesor1_email"],
  ["ACME", "BAU", "Ana", "11 4444 5555", "ana@x.com"],
  ["BETA", "Config 1", "Luis", "11 3333 4444", "luis@x.com"],
];
const WITH_VERSION = {
  "_opciones.json": {
    opts: [
      { n: 9, nombre: "Combustible", solapa: "flyer", orden: 0 },
      { n: 10, nombre: "Sin cashback", solapa: "flyer", orden: 1, sinCB: 9 },
    ],
  },
};
const MIXED_SHEET = [
  ["empresa", "config", "asesor1_nombre"],
  ["A con", "BAU", "X"],
  ["B sin", "", "Y"],
];

async function sheetFile(lines: readonly (readonly string[])[], name = "t.xlsx") {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Hoja1");
  for (const line of lines) sheet.addRow([...line]);
  const content = await book.xlsx.writeBuffer();
  return new File([content], name);
}

const generate = () => page.getByTestId("batch-generate");
const clear = () => page.getByTestId("batch-clear");
const validation = () => page.getByTestId("batch-validation");
const rowCount = () => page.getByTestId("batch-row-count");
const progress = () => page.getByTestId("batch-progress");
const status = () => page.getByRole("status");

async function upload(lines: readonly (readonly string[])[]) {
  await userEvent.upload(page.getByTestId("batch-file"), await sheetFile(lines));
}

function withFaculties(faculties: Record<string, boolean>, others: AppAnswers = {}): AppAnswers {
  return {
    ...others,
    files: {
      ...flyerFiles(),
      ...others.files,
      "_facultades.json": { roles: { asesor: { ...ALLOWED, ...faculties } } },
    },
  };
}

async function openBulkPanel(answers: AppAnswers = {}) {
  const opened = await open(answers);
  await flyerShown();
  await page.getByRole("tab", { name: "Masivo" }).click();
  return opened;
}

/** What reaches the disk stays here, to be read. */
function zipsDownloaded() {
  const zips: { blob: Blob; name: string }[] = [];
  const pending: Blob[] = [];
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    if (blob instanceof Blob) pending.push(blob);
    return "blob:zip";
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function record(
    this: HTMLAnchorElement,
  ) {
    const blob = pending.shift();
    if (blob) zips.push({ blob, name: this.download });
  });
  return zips;
}

async function zipContent(blob: Blob | undefined) {
  if (!blob) throw new Error("There is no ZIP");
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  return {
    names: Object.keys(zip.files),
    summary: (await zip.file("Resumen.txt")?.async("string")) ?? "",
  };
}

function logsOf(requests: readonly RecordedRequest[]) {
  return requests
    .filter(({ path, method }) => path === "/rest/v1/flyer_logs" && method === "POST")
    .map(({ body }) => body);
}

/** A ZIP that does not finish until it is told: the batch stays running meanwhile. */
function holdZip() {
  const gate: { open?: () => void } = {};
  const held = new Promise<void>((resolve) => {
    gate.open = resolve;
  });
  const real: unknown = Reflect.get(JSZip.prototype, "generateAsync");
  vi.spyOn(JSZip.prototype, "generateAsync").mockImplementation(async function hold(
    this: JSZip,
    ...args
  ) {
    await held;
    return typeof real === "function" ? Reflect.apply(real, this, args) : null;
  });
  return { letGo: () => gate.open?.() };
}

const REAL_FILL_TEXT: unknown = Reflect.get(CanvasRenderingContext2D.prototype, "fillText");

/** A browser that gives up while it draws that company. */
function failWhileDrawing(company: string) {
  Reflect.set(
    CanvasRenderingContext2D.prototype,
    "fillText",
    function draw(this: unknown, ...args: unknown[]) {
      if (String(args[0]).includes(company)) throw new Error("falla simulada");
      if (typeof REAL_FILL_TEXT === "function") Reflect.apply(REAL_FILL_TEXT, this, args);
    },
  );
}

afterEach(() => {
  Reflect.set(CanvasRenderingContext2D.prototype, "fillText", REAL_FILL_TEXT);
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("reading a sheet", () => {
  it("says what it understood, how many lines there are and shows them", async () => {
    await openBulkPanel();
    await upload(OK_SHEET);
    await expect.element(validation()).toHaveAttribute("data-severity", "ok");
    await expect.element(validation()).toHaveTextContent("✓ Todo OK — 2 flyers");
    await expect.element(rowCount()).toHaveTextContent("2 filas");
    await expect.element(page.getByRole("cell", { name: "BETA" })).toBeVisible();
    await expect.element(generate()).toBeEnabled();
  });

  it("an error stops generating, and a warning does not", async () => {
    await openBulkPanel();
    await upload([["razon"], ["Acme"]]);
    await expect.element(validation()).toHaveAttribute("data-severity", "error");
    await expect.element(generate()).toBeDisabled();
    await upload([["empresa"], ["Acme"]]);
    await expect.element(validation()).toHaveAttribute("data-severity", "warning");
    await expect.element(generate()).toBeEnabled();
  });

  it("the same sheet can be chosen again: the field is left empty", async () => {
    await openBulkPanel();
    await upload(OK_SHEET);
    await expect.element(rowCount()).toBeVisible();
    await expect.element(page.getByTestId("batch-file")).toHaveValue("");
    await clear().click();
    await expect.element(rowCount()).not.toBeInTheDocument();
    await upload(OK_SHEET);
    await expect.element(rowCount()).toHaveTextContent("2 filas");
  });

  it("many lines: the first ones, and how many more", async () => {
    await openBulkPanel();
    await upload([
      ["empresa"],
      ...Array.from({ length: 8 }, (_, index) => [`Empresa ${String(index)}`]),
    ]);
    await expect.element(page.getByText("...y 3 más")).toBeVisible();
  });

  it("a sheet with nothing in it is said", async () => {
    await openBulkPanel();
    await upload([["empresa"], [""]]);
    await expect.element(status()).toHaveTextContent("Archivo vacío");
  });

  it("a file that cannot be read says so", async () => {
    await openBulkPanel();
    vi.spyOn(Blob.prototype, "arrayBuffer").mockRejectedValue(new Error("rota"));
    await userEvent.upload(page.getByTestId("batch-file"), new File(["x"], "t.xlsx"));
    await expect.element(status()).toHaveTextContent("No se pudo leer el Excel: rota");
  });

  it("something strange in a sheet stays text", async () => {
    await openBulkPanel();
    await upload([
      ["empresa", "<b>malo</b>"],
      ["<img src=x onerror=alert(1)>", "x"],
    ]);
    await expect.element(validation()).toMatchTextContent(/Columnas que ignoré: <b>malo<\/b>/);
    await expect
      .element(page.getByTestId("batch-preview"))
      .toMatchTextContent(/<img src=x onerror=alert\(1\)>/);
    expect(document.querySelector('[data-testid="bulk-panel"] img')).toBeNull();
  });

  it("dragging it onto its place reads it, and the place says it is ready for it", async () => {
    await openBulkPanel();
    const drop = page.getByTestId("batch-drop");
    const transfer = new DataTransfer();
    transfer.items.add(await sheetFile(OK_SHEET));
    const target = drop.element();
    target.dispatchEvent(
      new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: transfer }),
    );
    await expect.element(drop).toHaveAttribute("data-over", "true");
    target.dispatchEvent(new DragEvent("dragleave", { bubbles: true }));
    await expect.element(drop).toHaveAttribute("data-over", "false");
    target.dispatchEvent(
      new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }),
    );
    await expect.element(rowCount()).toHaveTextContent("2 filas");
    await expect.element(drop).toHaveAttribute("data-over", "false");
  });

  it("dropping nothing does nothing", async () => {
    await openBulkPanel();
    const target = page.getByTestId("batch-drop").element();
    target.dispatchEvent(
      new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() }),
    );
    await expect.element(rowCount()).not.toBeInTheDocument();
  });

  it("clicking on its place opens the field", async () => {
    await openBulkPanel();
    const field = page.getByTestId("batch-file").element();
    const opened = vi.fn<() => void>();
    field.addEventListener("click", (event) => {
      event.preventDefault();
      opened();
    });
    await page.getByTestId("batch-drop").click();
    expect(opened).toHaveBeenCalledTimes(1);
  });

  it("what was read stays while another panel shows", async () => {
    await openBulkPanel();
    await upload(OK_SHEET);
    await expect.element(rowCount()).toBeVisible();
    await page.getByRole("tab", { name: "Individual" }).click();
    await page.getByRole("tab", { name: "Masivo" }).click();
    await expect.element(rowCount()).toHaveTextContent("2 filas");
  });
});

function fileNames() {
  const names: string[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function record(
    this: HTMLAnchorElement,
  ) {
    names.push(this.download);
  });
  return names;
}

describe("the template", () => {
  it("comes down with the name of the flyer, and it is said", async () => {
    const names = fileNames();
    await openBulkPanel();
    await page.getByRole("button", { name: /Descargar plantilla Excel/ }).click();
    await expect.element(status()).toHaveTextContent("Plantilla descargada!");
    expect(names).toEqual(["Plantilla_Flyers_Galicia.xlsx"]);
  });

  it("in Rubros it says which columns fill the sign, and it has them", async () => {
    const names = fileNames();
    const { show } = await open(
      withFaculties({ opcion_9: false, opcion_7: false, opcion_6: false }),
      "rubros",
    );
    await flyerShown();
    await show("rubros");
    await page.getByRole("tab", { name: "Masivo" }).click();
    const hint = page.getByTestId("batch-sign-hint");
    await expect.element(hint).toMatchTextContent(/Columnas del cartel en Rubro Uno:/);
    await expect.element(hint).toMatchTextContent(/importe = Tope de reintegro mensual/);
    await expect.element(hint).not.toHaveTextContent("importe2");
    await page.getByRole("button", { name: /Descargar plantilla Excel/ }).click();
    await expect.element(status()).toHaveTextContent("Plantilla descargada!");
    expect(names).toEqual(["Plantilla_Flyers_Rubros.xlsx"]);
  });

  it("with a second cap on the sign, the hint names it", async () => {
    const SECOND = { benef: { lineas: [{ t: "Tope {importe2}" }] } };
    const files = flyerFiles();
    await open(
      withFaculties(
        { opcion_9: false, opcion_7: false, opcion_6: false },
        { files: { "_active8.json": { ...files["_active8.json"], cfg: SECOND } } },
      ),
      "rubros",
    );
    await flyerShown();
    await page.getByRole("tab", { name: "Masivo" }).click();
    await expect
      .element(page.getByTestId("batch-sign-hint"))
      .toMatchTextContent(/importe2 = Segundo tope \(si es distinto\) \(vacío = igual al otro\)/);
  });

  it("not on any other flyer", async () => {
    await openBulkPanel();
    await expect.element(page.getByTestId("batch-sign-hint")).not.toBeInTheDocument();
  });
});

describe("generating the ZIP", () => {
  it("one flyer per line, with Resumen.txt, and the log counts what came out", async () => {
    const zips = zipsDownloaded();
    const { harness } = await openBulkPanel();
    await upload(OK_SHEET);
    await generate().click();
    await expect.element(status()).toHaveTextContent("ZIP descargado!");
    await expect.element(progress()).toHaveTextContent("✓ ZIP con 2 flyers!");
    const [zip] = zips;
    expect(zip?.name).toMatch(/^Flyers_Galicia_\d{4}-\d{2}-\d{2}\.zip$/);
    const { names, summary } = await zipContent(zip?.blob);
    expect(names.toSorted()).toEqual(["Flyer ACME.pdf", "Flyer BETA.pdf", "Resumen.txt"]);
    expect(summary).toContain("Filas del Excel: 2");
    expect(summary).toContain("Flyers generados: 2");
    expect(logsOf(harness.network.requests)).toEqual([
      expect.objectContaining({
        empresa: "Masivo (2 flyers)",
        config_name: "",
        format: "pdf",
        is_bulk: true,
        bulk_count: 2,
        flyer_type: JSON.stringify({ opcion: 9, masivo: true, padron: false }),
      }),
    ]);
  });

  it("something unexpected at the end is said, and nothing stays locked", async () => {
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => {
      throw new Error("sin lugar");
    });
    await openBulkPanel();
    await upload(OK_SHEET);
    await generate().click();
    await expect.element(status()).toHaveTextContent("Algo salió mal al generar el ZIP");
    await expect
      .element(progress())
      .toHaveTextContent("Algo salió mal al generar. Probá de nuevo.");
    await expect.element(generate()).toBeEnabled();
  });

  it("what a test reads of it, nothing on the screen says", async () => {
    zipsDownloaded();
    await openBulkPanel();
    await upload(OK_SHEET);
    await generate().click();
    await expect.element(status()).toHaveTextContent("ZIP descargado!");
    const read: unknown = window["__flyerProbe"]?.["flyerBatch"]?.();
    expect(read).toMatchObject({ isRunning: expect.any(Function) });
    const probe = Object(read);
    const call = (name: string, ...args: unknown[]): unknown => {
      const reader: unknown = Reflect.get(probe, name);
      return typeof reader === "function" ? Reflect.apply(reader, probe, args) : undefined;
    };
    expect(call("isRunning")).toBe(false);
    expect(call("rowNumbers")).toEqual([2, 3]);
    expect(call("drawn")).toEqual([
      expect.objectContaining({ company: "ACME", officer: "Ana", option: 9, noCashback: false }),
      expect.objectContaining({ company: "BETA", firstAmount: "$350.000", hasAmounts: true }),
    ]);
    expect(call("versionOf", 9)).toBe(0);
    expect(call("baseOf", 9)).toBe(9);
    expect(call("listedAsVersionOf", 9)).toBeNull();
  });

  it("two presses are one ZIP", async () => {
    const zips = zipsDownloaded();
    await openBulkPanel();
    await upload(OK_SHEET);
    await expect.element(generate()).toBeEnabled();
    const button = generate().element();
    if (!(button instanceof HTMLElement)) throw new Error("No button");
    button.click();
    button.click();
    await expect.element(status()).toHaveTextContent("ZIP descargado!");
    expect(zips).toHaveLength(1);
  });

  it("a line that fails does not cut the batch, and the log does not count it", async () => {
    const zips = zipsDownloaded();
    failWhileDrawing("ACME");
    const { harness } = await openBulkPanel();
    await upload(OK_SHEET);
    await generate().click();
    await expect
      .element(status())
      .toHaveTextContent("ZIP descargado: 1 fila(s) no se pudieron generar");
    await expect
      .element(progress())
      .toHaveTextContent(
        "✓ ZIP con 1 flyer — 1 no salió: fila 2 (ACME): no se pudo dibujar (falla simulada) (el detalle está en Resumen.txt, dentro del ZIP)",
      );
    const { names, summary } = await zipContent(zips[0]?.blob);
    expect(names.toSorted()).toEqual(["Flyer BETA.pdf", "Resumen.txt"]);
    expect(summary).toContain("  Fila 2 — ACME: no se pudo dibujar (falla simulada)");
    expect(logsOf(harness.network.requests)).toEqual([
      expect.objectContaining({ bulk_count: 1, empresa: "Masivo (1 flyers)" }),
    ]);
  });

  it("if nothing comes out there is no ZIP and no log, and it says why", async () => {
    const zips = zipsDownloaded();
    failWhileDrawing("ACME");
    const { harness } = await openBulkPanel();
    await upload([["empresa"], ["ACME"]]);
    await generate().click();
    await expect.element(status()).toHaveTextContent("No se generó ningún flyer");
    await expect
      .element(progress())
      .toHaveTextContent(
        "No se generó ningún flyer — fila 2 (ACME): no se pudo dibujar (falla simulada)",
      );
    expect(zips).toEqual([]);
    expect(logsOf(harness.network.requests)).toEqual([]);
    await expect.element(generate()).toBeEnabled();
  });

  it("a ZIP that cannot be made explains it and does not lock the button", async () => {
    vi.spyOn(JSZip.prototype, "generateAsync").mockRejectedValue(new Error("sin memoria"));
    const { harness } = await openBulkPanel();
    await upload(OK_SHEET);
    await generate().click();
    await expect
      .element(status())
      .toHaveTextContent("No se pudo armar el ZIP. Probá con menos filas.");
    await expect.element(progress()).toHaveTextContent("No se pudo armar el ZIP: sin memoria");
    await expect.element(generate()).toBeEnabled();
    expect(logsOf(harness.network.requests)).toEqual([]);
  });

  it("the flyer on screen not loaded: nothing comes out and it says why", async () => {
    const zips = zipsDownloaded();
    await openBulkPanel();
    await upload(OK_SHEET);
    await page.getByRole("tab", { name: "Individual" }).click();
    await page.getByRole("button", { name: "Otro Flyer" }).click();
    await expect.element(page.getByTestId("flyer-load-problem")).toBeVisible();
    await page.getByRole("tab", { name: "Masivo" }).click();
    await generate().click();
    await expect.element(status()).toMatchTextContent(/todavía no tiene flyer/);
    expect(zips).toEqual([]);
  });

  it("while it runs it does not clear, it does not read another sheet and the flyer stays", async () => {
    const { letGo } = holdZip();
    const zips = zipsDownloaded();
    await openBulkPanel();
    await upload(OK_SHEET);
    await generate().click();
    await expect.element(progress()).toHaveTextContent("Empaquetando ZIP...");
    await expect.element(generate()).toBeDisabled();

    await clear().click();
    await expect.element(status()).toHaveTextContent("Esperá a que termine de generar el ZIP.");
    await expect.element(rowCount()).toHaveAttribute("data-rows", "2");

    await page.getByRole("button", { name: "Otro Flyer" }).click();
    await expect.element(status()).toHaveTextContent("Esperá a que termine de generar el ZIP.");
    expect(workspaceOnScreen().getState().slot.option).toBe(9);

    await upload([["empresa"], ["OTRA"]]);
    await expect.element(rowCount()).toHaveAttribute("data-rows", "2");

    letGo();
    await expect.element(status()).toHaveTextContent("ZIP descargado!");
    expect((await zipContent(zips[0]?.blob)).names).toContain("Flyer BETA.pdf");
    // The other sheet was refused: what is there is still the first one.
    await expect.element(rowCount()).toHaveAttribute("data-rows", "2");
    await clear().click();
    await expect.element(rowCount()).not.toBeInTheDocument();
  });
});

describe("with a version without cashback", () => {
  const FILES = {
    ...WITH_VERSION,
    "_active10.json": flyerFiles()["_active9.json"],
    "_legal10.json": { text: "Legal sin cashback" },
  };

  it("each line goes on the flyer it needs, and it goes back to where it started", async () => {
    const zips = zipsDownloaded();
    await openBulkPanel(withFaculties({ opcion_10: true }, { files: FILES }));
    await upload(MIXED_SHEET);
    await generate().click();
    await expect.element(status()).toHaveTextContent("ZIP descargado!");
    const { summary } = await zipContent(zips[0]?.blob);
    expect(summary).toContain("Combustible: 1");
    expect(summary).toContain("Sin cashback: 1");
    await vi.waitFor(() => {
      expect(workspaceOnScreen().getState().slot.option).toBe(9);
    });
  });

  it("if that version does not load, its lines stay out with the reason, and never on the other picture", async () => {
    const zips = zipsDownloaded();
    await openBulkPanel(
      withFaculties({ opcion_10: true }, { files: FILES, droppedFiles: ["_active10.json"] }),
    );
    await upload(MIXED_SHEET);
    await generate().click();
    await expect
      .element(status())
      .toHaveTextContent("ZIP descargado: 1 fila(s) no se pudieron generar");
    const { names, summary } = await zipContent(zips[0]?.blob);
    expect(names.toSorted()).toEqual(["Flyer A con.pdf", "Resumen.txt"]);
    expect(summary).toContain("Fila 3 — B sin: no se pudo cargar el flyer «Sin cashback»");
    await expect
      .element(progress())
      .toMatchTextContent(/1 no salió: fila 3 \(B sin\): no se pudo cargar el flyer/);
  });

  it("with a draft open everything comes out on what is being built", async () => {
    const zips = zipsDownloaded();
    await openBulkPanel(withFaculties({ opcion_10: true }, { files: FILES }));
    await page.getByRole("button", { name: /Cambiar logos/ }).click();
    await page.getByRole("button", { name: /Nuevo borrador/ }).click();
    await vi.waitFor(() => {
      expect(page.getByTestId("flyer-options").element().textContent).toContain("Borrador");
    });
    await upload(MIXED_SHEET);
    await generate().click();
    await expect.element(status()).toHaveTextContent("ZIP descargado!");
    const { summary } = await zipContent(zips[0]?.blob);
    expect(summary).toContain("Combustible: 2");
    expect(summary).not.toContain("Sin cashback");
  });
});

const card = () => page.getByTestId("segment-card");
const download = () => page.getByTestId("segment-generate");

describe("the segment", () => {
  const COMPANIES = [
    {
      empresa: "UNO",
      cuits: [],
      config: "BAU",
      asesores: [{ nombre: "Ana", celular: "1", email: "a@x.com" }],
      rubro: {},
    },
    {
      empresa: "DOS",
      cuits: [],
      config: "BAU",
      asesores: [{ nombre: "Luis", celular: "2", email: "l@x.com" }],
      rubro: {},
    },
    { empresa: "OTRA", cuits: [], config: "BAU", asesores: [], rubro: { opcion: 8 } },
  ];
  it("is only for whoever has the list of companies", async () => {
    await openBulkPanel();
    await expect.element(card()).not.toBeInTheDocument();
  });

  it("offers the companies that come out on this flyer, and it makes their ZIP", async () => {
    const zips = zipsDownloaded();
    const { harness } = await openBulkPanel(
      withFaculties(
        { padron_buscar: true },
        { tables: { padron_empresas: () => jsonResponse(COMPANIES) } },
      ),
    );
    await expect.element(card()).toMatchTextContent(/Todo el segmento «Combustible»/);
    await expect.element(page.getByTestId("segment-text")).toMatchTextContent(/2 empresas/);
    await expect.element(download()).toHaveTextContent("⚡ Descargar 2 flyers de «Combustible»");
    await download().click();
    const question = page.getByRole("alertdialog");
    await expect
      .element(question)
      .toMatchTextContent(/Se van a generar 2 flyers:.*2 en Flyer Galicia · Combustible/);
    await question.getByRole("button", { name: "Generar", exact: true }).click();
    const report = page.getByTestId("decision-dialog");
    await expect.element(report).toMatchTextContent(/✓ Flyers generados/);
    expect(zips[0]?.name).toMatch(/^Flyers_Combustible_/);
    await expect
      .element(page.getByTestId("segment-progress"))
      .toHaveTextContent("✓ ZIP con 2 flyers.");
    expect(logsOf(harness.network.requests)).toEqual([
      expect.objectContaining({
        empresa: "Mis empresas (2 flyers)",
        bulk_count: 2,
        flyer_type: JSON.stringify({ opcion: 9, masivo: true, padron: true }),
      }),
    ]);
    await report.getByRole("button", { name: "Cerrar" }).click();
    await expect.element(report).not.toBeInTheDocument();
  });

  it("with none on this flyer it says so, and there is nothing to press", async () => {
    await openBulkPanel(withFaculties({ padron_buscar: true }));
    await expect
      .element(page.getByTestId("segment-text"))
      .toHaveTextContent("Ninguna de tus empresas sale con este formato todavía.");
    await expect.element(download()).toBeDisabled();
    await expect.element(download()).toHaveTextContent("⚡ Descargar todos de «Combustible»");
  });

  it("one is said in singular", async () => {
    await openBulkPanel(
      withFaculties(
        { padron_buscar: true },
        { tables: { padron_empresas: () => jsonResponse(COMPANIES.slice(0, 1)) } },
      ),
    );
    await expect.element(download()).toHaveTextContent("⚡ Descargar 1 flyer de «Combustible»");
    await expect.element(page.getByTestId("segment-text")).toMatchTextContent(/1 empresa de/);
  });

  it("a failed connection is not an empty list (invariant 24), and it can be tried again", async () => {
    const cloud = { isDown: true };
    await openBulkPanel(
      withFaculties(
        { padron_buscar: true },
        {
          tables: {
            padron_empresas: () =>
              cloud.isDown ? jsonResponse({ message: "No" }, 500) : jsonResponse(COMPANIES),
          },
        },
      ),
    );
    const retry = card().getByRole("button", { name: /Reintentar/ });
    await expect.element(retry, { timeout: 15_000 }).toBeVisible();
    await expect.element(card()).toMatchTextContent(/No se pudo conectar para traer tus empresas/);
    cloud.isDown = false;
    await retry.click();
    await expect.element(page.getByTestId("segment-text")).toMatchTextContent(/2 empresas/);
  });

  it("takes you to Generar flyers for all of them", async () => {
    const openMenuWindow = vi.fn<(id: string) => void>();
    await open(withFaculties({ padron_buscar: true }), "flyer", true, { openMenuWindow });
    await flyerShown();
    await page.getByRole("tab", { name: "Masivo" }).click();
    await card()
      .getByRole("button", { name: /Base de datos → Generar flyers/ })
      .click();
    expect(openMenuWindow).toHaveBeenCalledWith("database");
  });
});
