import ExcelJS from "exceljs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Locator, page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import {
  FlyerGenerationContext,
  type FlyerGenerationPort,
} from "@/shared/lib/company-registry/flyer-generation-port.ts";
import {
  INVENTED_USER,
  jsonResponse,
  type RecordedRequest,
} from "@/shared/supabase/testing/recording-fetch.ts";
import type { registryProbe } from "../model/registry-probe.ts";
import { Inside } from "@/shared/lib/testing/Inside.tsx";
import { placeDeskOnPage } from "@/shared/lib/testing/place-desk-on-page.ts";
import { PlaceDeskReader } from "@/shared/lib/testing/PlaceDeskReader.tsx";
import {
  databaseError,
  FAILED_CONNECTION,
  type RegistryCloud,
  registryHarness,
} from "../testing/registry-cloud.ts";
import { DatabaseWindow } from "./DatabaseWindow.tsx";

const ALL = ["padron_buscar", "asesores_guardados"];
const OFFICER = { nombre: "Ana Perez", celular: "11 4444 5555", email: "ana@bancogalicia.com.ar" };

function company(empresa: string, fields: Record<string, unknown> = {}) {
  return {
    empresa,
    cuits: ["30711111111"],
    config: "BAU",
    asesores: [OFFICER],
    rubro: {},
    ...fields,
  };
}

function open(cloud: RegistryCloud = {}, port: FlyerGenerationPort | null = null) {
  const onClose = vi.fn<() => void>();
  const harness = registryHarness({ faculties: ALL, ...cloud });
  const screen = render(
    harness.wrap(
      <FlyerGenerationContext.Provider value={port}>
        <PlaceDeskReader />
        <Inside>
          <DatabaseWindow onClose={onClose} />
        </Inside>
      </FlyerGenerationContext.Provider>,
    ),
  );
  return { harness, onClose, screen };
}

type Opened = ReturnType<typeof open>;

const dialog = () => page.getByRole("dialog", { name: /Base de datos/ });
const notice = () => page.getByRole("status");
const status = () => page.getByTestId("company-status");
const confirm = () => page.getByRole("alertdialog");
const editorRows = () => page.getByTestId("company-editor-row");
const generatorRows = () => page.getByTestId("generator-row");
const decision = () => page.getByTestId("decision-dialog");

function saved(harness: Opened["harness"], name: string): readonly RecordedRequest[] {
  return harness.network.to(`/rest/v1/rpc/${name}`);
}

function rowsOf(request: RecordedRequest | undefined): readonly Record<string, unknown>[] {
  const body = request?.body;
  const rows: unknown =
    typeof body === "object" && body !== null ? Reflect.get(body, "p_rows") : null;
  return Array.isArray(rows) ? rows : [];
}

async function button(name: string | RegExp): Promise<Locator> {
  const found = page.getByRole("button", { name });
  await expect.element(found.first()).toBeVisible();
  return found.first();
}

async function press(name: string | RegExp): Promise<void> {
  await (await button(name)).click();
}

async function sheetFile(lines: readonly (readonly string[])[]): Promise<File> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Hoja1");
  for (const line of lines) sheet.addRow([...line]);
  const content = await book.xlsx.writeBuffer();
  return new File([content], "e.xlsx");
}

const HEAD = ["empresa", "cuit", "config", "asesor1_nombre"];

async function upload(lines: readonly (readonly string[])[], input = "company-sheet-input") {
  await userEvent.upload(page.getByTestId(input), await sheetFile(lines));
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

function downloads() {
  const names: string[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function record(
    this: HTMLAnchorElement,
  ) {
    names.push(this.download);
  });
  return names;
}

const editorRow = (row: number) => editorRows().nth(row);

function generation(fields: Partial<FlyerGenerationPort> = {}): FlyerGenerationPort {
  return {
    hasFlyer: () => undefined,
    isGenerating: () => false,
    generate: vi.fn<FlyerGenerationPort["generate"]>(() => Promise.resolve()),
    ...fields,
  };
}

async function openGenerator(cloud: RegistryCloud, port: FlyerGenerationPort | null = null) {
  const opened = open(cloud, port);
  await press(/Generar flyers/);
  await expect.element(page.getByTestId("generator")).toBeVisible();
  return opened;
}

const rowOf = (row: number) => generatorRows().nth(row);

const count = () => page.getByTestId("generator-count");

const advisorStatus = () => page.getByTestId("advisor-status");

const advisorRows = () => page.getByTestId("advisor-row");

describe("which panes each one sees", () => {
  it("a pane from the search of screens opens as its solapa does, and works as a screen", async () => {
    open();
    await expect.element(page.getByRole("tab", { name: "Mis empresas" })).toBeVisible();

    placeDeskOnPage().ask("database", "asesores");
    await expect
      .element(page.getByRole("tab", { name: "Mis asesores" }))
      .toHaveAttribute("aria-selected", "true");
    await expect.element(dialog()).toHaveAttribute("data-screen-window");
  });

  it("with both faculties, three solapas", async () => {
    open();

    await expect.element(page.getByRole("tab", { name: "Mis empresas" })).toBeVisible();
    await expect.element(page.getByRole("tab", { name: "Mis asesores" })).toBeVisible();
    await expect.element(page.getByRole("tab", { name: "Cambios pendientes" })).toBeVisible();
  });

  it("with one pane, no solapas and its name in the title", async () => {
    open({ faculties: ["asesores_guardados"] });

    await expect.element(dialog()).toBeVisible();
    await expect
      .element(page.getByRole("heading", { level: 2 }))
      .toHaveTextContent("Base de datos · Mis asesores");
    expect(page.getByRole("tab").elements()).toHaveLength(0);
  });

  it("whoever only has something to decide sees that, with how many", async () => {
    open({
      faculties: [],
      proposals: [
        {
          id: "p1",
          estado: "pendiente",
          empresa: "ACME",
          creada_por: "otro",
          created_at: "2026-10-20T10:00:00Z",
        },
      ],
    });

    await expect
      .element(page.getByRole("heading", { level: 2 }))
      .toHaveTextContent("Base de datos · Cambios pendientes (1)");
  });

  it("whoever has nothing is told so, and it closes", async () => {
    const { onClose } = open({ faculties: [] });

    await expect.element(notice()).toHaveTextContent("No tenés habilitada la base de datos.");
    await vi.waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("a click outside does not close it, and its X does", async () => {
    const { onClose } = open();
    await expect.element(dialog()).toBeVisible();

    await userEvent.click(page.getByRole("dialog").element().parentElement ?? document.body, {
      position: { x: 2, y: 2 },
    });
    expect(onClose).not.toHaveBeenCalled();

    await page.getByRole("button", { name: "Cerrar" }).click();
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("Mis empresas", () => {
  it("says how many there are, and shows them with what they have", async () => {
    open({
      companies: [
        company("ACME SA", { created_at: "2020-03-05T07:00:00Z" }),
        company("SIN NADA", { config: "SIN", asesores: [] }),
      ],
    });

    await expect
      .element(status())
      .toMatchTextContent(/2 empresas.*2 CUIT.*actualizado 05\/03\/2020/);
    await expect.element(page.getByText("Primeras 2 de 2")).toBeVisible();
    await expect.element(page.getByText("ACME SA")).toBeVisible();
    await expect.element(page.getByText("sin oficiales asignados")).toBeVisible();
    await expect.element(page.getByText(/Sin cashback/)).toBeVisible();
  });

  it("nothing saved says how to start", async () => {
    open({ companies: [] });

    await expect
      .element(status())
      .toHaveTextContent(
        'Todavía no cargaste empresas. Subí un Excel o agregalas a mano con "Editar en línea".',
      );
  });

  it("the search finds by name and says when there is nothing", async () => {
    open({ companies: [company("ACME SA"), company("BETA SRL", { cuits: ["30722222222"] })] });
    await expect.element(page.getByText("BETA SRL")).toBeVisible();
    const search = page.getByPlaceholder("Probar el buscador: razón social o CUIT...");

    await search.fill("beta");
    await expect.element(page.getByText("Coincidencias: 1")).toBeVisible();
    await expect.element(page.getByText("ACME SA")).not.toBeInTheDocument();

    await search.fill("zzz");
    await expect.element(page.getByText('Sin resultados para "zzz".')).toBeVisible();
  });

  it("of more than a few it shows the first ones, and says there are more", async () => {
    const many = Array.from({ length: 30 }, (_, row) => company(`EMPRESA ${String(row)}`));
    open({ companies: many });

    await expect.element(page.getByText("Primeras 25 de 30")).toBeVisible();
    await page.getByPlaceholder("Probar el buscador: razón social o CUIT...").fill("empresa");
    await expect.element(page.getByText("Coincidencias: 25+")).toBeVisible();
  });

  it("a row without a name or tax id still reads", async () => {
    open({ companies: [{ empresa: "", cuits: ["307"], asesores: [] }] });

    await expect.element(page.getByText("(sin razón social)")).toBeVisible();
    await expect.element(page.getByText("307", { exact: true })).toBeVisible();
  });

  it("the category goes with its flyer", async () => {
    open({
      files: {
        "_opciones.json": { opts: [{ n: 1 }, { n: 4, nombre: "Súper", solapa: "rubros" }] },
      },
      companies: [company("ACME", { rubro: { opcion: 4, importe: "15000" } })],
    });

    await expect.element(page.getByText("Súper · $15.000")).toBeVisible();
  });

  it("a cut is not an empty list: it says so, and Reintentar brings them", async () => {
    let cut = true;
    open({
      companies: (request) => {
        if (cut) return FAILED_CONNECTION(request);
        return jsonResponse([company("ACME SA")]);
      },
    });

    await expect
      .element(status(), { timeout: 12_000 })
      .toMatchTextContent(/No se pudo conectar para traer tus empresas/);
    await expect.element(status()).not.toMatchTextContent(/Todavía no cargaste/);
    await expect
      .element(notice())
      .toHaveTextContent(
        "No se pudieron traer tus empresas (sin conexión). Tocá Reintentar en la lupa.",
      );

    cut = false;
    await status().getByRole("button", { name: "Reintentar" }).click();
    await expect.element(status()).toMatchTextContent(/1 empresas/);
  });

  it("an answer of the server with an error says it was the server", async () => {
    open({ companies: () => databaseError("falla") });

    await expect
      .element(notice())
      .toHaveTextContent(
        "No se pudieron traer tus empresas (error del servidor). Tocá Reintentar en la lupa.",
      );
  });

  it("reads every page: the list is not cut at 1000", async () => {
    const all = Array.from({ length: 1500 }, (_, row) => company(`EMPRESA ${String(row)}`));
    const answer = ({ query }: RecordedRequest) => {
      const from = Number(query.get("offset") ?? 0);
      const limit = Number(query.get("limit") ?? 1000);
      return jsonResponse(all.slice(from, from + limit));
    };
    const { harness } = open({ companies: answer });

    await expect.element(status()).toMatchTextContent(/1500 empresas/);
    expect(harness.network.to("/rest/v1/padron_empresas").length).toBeGreaterThanOrEqual(2);
  });

  it("Recargar reads them again", async () => {
    let rows = [company("ACME SA")];
    open({ companies: () => jsonResponse(rows) });
    await expect.element(page.getByText("ACME SA")).toBeVisible();

    rows = [company("OTRA SA")];
    await press("Recargar");
    await expect.element(page.getByText("OTRA SA")).toBeVisible();
  });
});

describe("Subir Excel", () => {
  it("the first load saves at once", async () => {
    const { harness } = open({ companies: [] });
    await expect.element(status()).toMatchTextContent(/Todavía no cargaste/);

    await upload([HEAD, ["ACME SA", "30-71111111-1", "BAU", "Ana"]]);

    await expect.element(notice()).toHaveTextContent("Empresas actualizadas: 1");
    expect(rowsOf(saved(harness, "padron_replace")[0])[0]).toMatchObject({ empresa: "ACME SA" });
  });

  it("replacing shows what goes, and nothing is touched until it is accepted", async () => {
    const { harness } = open({
      companies: [company("ACME SA"), company("BETA SA"), company("GAMA SA")],
    });
    await expect.element(status()).toMatchTextContent(/3 empresas/);

    await upload([HEAD, ["NUEVA SA", "30-71111111-1", "BAU", "Ana"]]);

    await expect.element(decision()).toMatchTextContent(/Antes de reemplazar tus empresas/);
    await expect.element(decision()).toMatchTextContent(/Se borran 3 de tus 3 empresas/);
    expect(saved(harness, "padron_replace")).toHaveLength(0);

    await page.getByRole("button", { name: "Reemplazar (1)" }).click();
    await expect.element(notice()).toHaveTextContent("Empresas actualizadas: 1");
    expect(saved(harness, "padron_replace")).toHaveLength(1);
    await expect.element(decision()).not.toBeInTheDocument();
  });

  it("few that go are listed without alarm, and the rest in their place", async () => {
    const before = Array.from({ length: 12 }, (_, row) => company(`EMPRESA ${String(row)}`));
    const changed = before
      .slice(1)
      .map(({ empresa }, row) => [
        empresa,
        "30-71111111-1",
        row === 0 ? "Config 1" : "BAU",
        "Ana Perez",
      ]);
    const entering = Array.from({ length: 12 }, (_, row) => [
      `NUEVA ${String(row)}`,
      "30-71111111-1",
      "BAU",
      "Ana",
    ]);
    open({ companies: before });
    await expect.element(status()).toMatchTextContent(/12 empresas/);

    await upload([HEAD, ...changed, ...entering]);

    await expect.element(decision()).toMatchTextContent(/1se van/);
    await expect.element(decision()).not.toMatchTextContent(/Se borra/);
    await expect.element(decision().getByText("Entran (12)")).toBeVisible();
    await expect.element(decision().getByText(/y 2 más/)).toBeInTheDocument();
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect
      .element(notice())
      .toHaveTextContent("Carga cancelada: tus empresas quedaron como estaban");
  });

  it("a sheet equal to what is saved changes nothing", async () => {
    const { harness } = open({
      companies: [company("ACME SA", { asesores: [{ nombre: "Ana", celular: "", email: "" }] })],
    });
    await expect.element(status()).toMatchTextContent(/1 empresas/);

    await upload([HEAD, ["ACME SA", "30-71111111-1", "BAU", "Ana"]]);

    await expect
      .element(notice())
      .toHaveTextContent("El Excel es igual a lo que ya tenés: no hubo nada que cambiar");
    expect(saved(harness, "padron_replace")).toHaveLength(0);
  });

  it("if what is saved cannot be read again, nothing is replaced", async () => {
    let cut = false;
    const { harness } = open({
      companies: (request) => (cut ? FAILED_CONNECTION(request) : jsonResponse([company("ACME")])),
    });
    await expect.element(status()).toMatchTextContent(/1 empresas/);
    cut = true;

    await upload([HEAD, ["NUEVA SA", "30-71111111-1", "BAU", "Ana"]]);

    await expect
      .element(notice(), { timeout: 12_000 })
      .toHaveTextContent(
        "No pude leer tus empresas guardadas para compararlas: no se reemplazó nada. Probá de nuevo.",
      );
    expect(saved(harness, "padron_replace")).toHaveLength(0);
  });

  it("what is strange goes in a report, with what is written as text", async () => {
    open({ companies: [] });
    await expect.element(status()).toMatchTextContent(/Todavía no cargaste/);

    await upload([
      ["empresa", "cuit", "config"],
      ["ACME", "307", "<b>malo</b>"],
    ]);

    await expect.element(decision()).toMatchTextContent(/Informe de la carga/);
    await expect.element(decision()).toMatchTextContent(/Leí 1 empresa, con estas observaciones:/);
    await expect.element(decision()).toMatchTextContent(/<b>malo<\/b>/);
    expect(decision().element().querySelector("b:not(ul b)")).toBeNull();
    await expect.element(page.getByRole("button", { name: "Guardar igual (1)" })).toBeVisible();
  });

  it("what is serious says to look at the sheet before saving", async () => {
    open({ companies: [company("ACME SA")] });
    await expect.element(status()).toMatchTextContent(/1 empresas/);

    await upload([["otra"], ["x"]]);

    await expect.element(decision()).toMatchTextContent(/Revisá el Excel/);
    await expect.element(decision()).toMatchTextContent(/Además, leí 0 empresas/);
    await expect.element(decision()).toMatchTextContent(/conviene corregir antes de guardar/);
  });

  it("a sheet that cannot be saved says so, and the list stays", async () => {
    const { harness } = open({
      companies: [],
      functions_: { padron_replace: () => databaseError("falla simulada") },
    });
    await expect.element(status()).toMatchTextContent(/Todavía no cargaste/);

    await upload([HEAD, ["ACME SA", "30-71111111-1", "BAU", "Ana"]]);

    await expect
      .element(notice())
      .toHaveTextContent("Error al guardar tus empresas: falla simulada");
    expect(saved(harness, "padron_replace")).toHaveLength(1);
    await expect.element(status()).toMatchTextContent(/Todavía no cargaste/);
  });

  it("a file that is not a sheet says so", async () => {
    open({ companies: [] });
    await expect.element(status()).toMatchTextContent(/Todavía no cargaste/);

    await userEvent.upload(
      page.getByTestId("company-sheet-input"),
      new File(["PK\u0003\u0004 un ZIP roto"], "e.xlsx"),
    );

    await expect.element(notice()).toMatchTextContent(/^No se pudo leer el Excel: /);
  });
});

describe("what goes down", () => {
  it("the list with its name, and it says how many", async () => {
    const names = downloads();
    open({ companies: [company("ACME SA")] });
    await expect.element(status()).toMatchTextContent(/1 empresas/);

    await press(/Descargar Excel/);

    await expect.element(notice()).toHaveTextContent("Excel descargado (1 empresas)");
    expect(names).toEqual(["Mis_Empresas_Galicia.xlsx"]);
  });

  it("nothing to download says so", async () => {
    const names = downloads();
    open({ companies: [] });
    await expect.element(status()).toMatchTextContent(/Todavía no cargaste/);

    await press(/Descargar Excel/);

    await expect.element(notice()).toHaveTextContent("Todavía no cargaste empresas");
    expect(names).toEqual([]);
  });

  it("a list that could not be read is not downloaded as an empty one", async () => {
    const names = downloads();
    open({ companies: () => databaseError("falla") });
    await expect.element(status()).toMatchTextContent(/No se pudo conectar/);

    await press(/Descargar Excel/);

    await expect.element(notice()).toMatchTextContent(/No se pudieron traer tus empresas/);
    expect(names).toEqual([]);
  });

  it("the template", async () => {
    const names = downloads();
    open({ companies: [] });

    await press(/Plantilla vacía/);

    await expect.element(notice()).toHaveTextContent("Plantilla descargada!");
    expect(names).toEqual(["Plantilla_Empresas_Galicia.xlsx"]);
  });

  it("Mis asesores goes down too", async () => {
    const names = downloads();
    open({
      advisors: [{ id: "a1", name: "Ana", nombre: "Ana Perez", celular: "11", email: "a@b.c" }],
    });
    await page.getByRole("tab", { name: "Mis asesores" }).click();
    await expect.element(page.getByTestId("advisor-row")).toBeVisible();

    await press(/Descargar Excel/);
    await expect.element(notice()).toHaveTextContent("Excel descargado (1 asesores)");
    await press(/Plantilla vacía/);
    await expect.element(notice()).toHaveTextContent("Plantilla descargada!");

    expect(names).toEqual(["Mis_Asesores_Galicia.xlsx", "Plantilla_Asesores_Galicia.xlsx"]);
  });

  it("no advisor to download says so", async () => {
    const names = downloads();
    open({ advisors: [] });
    await page.getByRole("tab", { name: "Mis asesores" }).click();
    await expect
      .element(page.getByTestId("advisor-status"))
      .toMatchTextContent(/Todavía no guardaste/);

    await press(/Descargar Excel/);

    await expect.element(notice()).toHaveTextContent("Todavía no guardaste ningún asesor");
    expect(names).toEqual([]);
  });
});

function isRegistryProbe(value: unknown): value is ReturnType<typeof registryProbe> {
  return typeof value === "object" && value !== null && "ownCompanyCount" in value;
}

function readProbe() {
  const value = window["__flyerProbe"]?.["companyRegistry"]?.();
  return isRegistryProbe(value) ? value : null;
}

describe("what the tests can read", () => {
  it("the probe says how many companies there are, and leaves with the window", async () => {
    const { screen } = open({ companies: [company("ACME SA")] });
    await expect.element(status()).toMatchTextContent(/empresas/);

    expect(readProbe()?.ownCompanyCount()).toBe(1);

    await (await screen).unmount();
    expect(readProbe()).toBeNull();
  });
});

describe("the inline editor", () => {
  const OPTIONS = {
    "_opciones.json": {
      opts: [
        { n: 1 },
        { n: 4, nombre: "Combustible", solapa: "rubros" },
        { n: 5, nombre: "Supermercado", solapa: "rubros" },
        { n: 6, nombre: "Ambos", solapa: "rubros" },
      ],
    },
  };

  async function openEditor(cloud: RegistryCloud) {
    const opened = open({ files: OPTIONS, ...cloud });
    await expect.element(status()).toMatchTextContent(/empresas|cargaste/);
    await press(/Editar en línea/);
    await expect.element(page.getByTestId("company-editor")).toBeVisible();
    return opened;
  }

  it("does not open over a list that could not be read: saving would wipe it out", async () => {
    open({ companies: () => databaseError("falla") });
    await expect.element(status()).toMatchTextContent(/No se pudo conectar/);

    await press(/Editar en línea/);

    await expect.element(notice()).toMatchTextContent(/No se pudieron traer tus empresas/);
    expect(page.getByTestId("company-editor").elements()).toHaveLength(0);
  });

  it("saves what was written, and only that", async () => {
    const { harness } = await openEditor({ companies: [company("ACME SA")] });

    await editorRow(0).getByPlaceholder("Razón social").fill("ACME NUEVA");
    await editorRow(0)
      .getByPlaceholder("CUIT (separados por coma)")
      .fill("30-72222222-2, 30733333333");
    await editorRow(0).getByLabelText("Cashback").selectOptions("Config 1");
    await press("Guardar cambios");

    await expect.element(notice()).toHaveTextContent("Empresas actualizadas: 1");
    await expect.element(page.getByTestId("company-editor")).not.toBeInTheDocument();
    expect(rowsOf(saved(harness, "padron_replace")[0])[0]).toMatchObject({
      empresa: "ACME NUEVA",
      cuits: ["30722222222", "30733333333"],
      config: "Config 1",
    });
    expect(rowsOf(saved(harness, "padron_replace")[0])[0]).not.toHaveProperty("key");
  });

  it("nothing is saved if it cannot be saved: the editor stays", async () => {
    await openEditor({
      companies: [company("ACME SA")],
      functions_: { padron_replace: () => databaseError("falla") },
    });

    await press("Guardar cambios");

    await expect.element(notice()).toHaveTextContent("Error al guardar tus empresas: falla");
    await expect.element(page.getByTestId("company-editor")).toBeVisible();
  });

  it("a new row comes empty, with the focus, and takes the filter away", async () => {
    await openEditor({ companies: [company("ACME SA")] });
    const filter = page.getByTestId("company-editor").getByPlaceholder(/^Filtrar/);
    await filter.fill("zzz");
    await expect.element(page.getByText('Sin resultados para "zzz".')).toBeVisible();

    await press("+ Agregar empresa");

    await expect.element(filter).toHaveValue("");
    await expect.element(editorRow(1)).toBeVisible();
    await expect.element(editorRow(1).getByPlaceholder("Razón social")).toHaveFocus();
  });

  it("a filter keeps the real position of each row", async () => {
    await openEditor({ companies: [company("ACME SA"), company("BETA SA")] });

    await page
      .getByTestId("company-editor")
      .getByPlaceholder(/^Filtrar/)
      .fill("beta");

    await expect.element(page.getByText("Mostrando 1 de 2.")).toBeVisible();
    await expect.element(editorRow(0)).toHaveAttribute("data-row", "1");
    await expect.element(editorRow(1)).not.toBeInTheDocument();
  });

  it("with many companies it waits for the typing to stop", async () => {
    const many = Array.from({ length: 400 }, (_, row) => company(`EMPRESA ${String(row)}`));
    await openEditor({ companies: many });
    const filter = page.getByTestId("company-editor").getByPlaceholder(/^Filtrar/);

    await filter.fill("empresa 39");

    expect(editorRows().elements().length).toBe(400);
    await vi.waitFor(() => {
      expect(editorRows().elements().length).toBe(14);
    });
  });

  it("deleting asks, and the expanded officers stay on their company", async () => {
    const { harness } = await openEditor({
      companies: [company("ACME SA"), company("BETA SA"), company("GAMA SA")],
    });
    await editorRow(2)
      .getByRole("button", { name: /Oficiales/ })
      .click();
    await editorRow(0)
      .getByRole("button", { name: /Oficiales/ })
      .click();
    await expect.element(editorRow(2)).toHaveAttribute("data-expanded", "true");
    expect(page.getByTestId("officer-fields").elements()).toHaveLength(8);

    await editorRow(1).getByRole("button", { name: "Eliminar empresa" }).click();
    await expect.element(confirm()).toMatchTextContent(/¿Eliminar BETA SA de tus empresas\?/);
    await confirm().getByRole("button", { name: "Eliminar" }).click();

    await expect.element(editorRow(1).getByPlaceholder("Razón social")).toHaveValue("GAMA SA");
    await expect.element(editorRow(1)).toHaveAttribute("data-expanded", "true");
    expect(saved(harness, "padron_replace")).toHaveLength(0);
  });

  it("closing a row of officers closes it", async () => {
    await openEditor({ companies: [company("ACME SA")] });
    const toggle = editorRow(0).getByRole("button", { name: /Oficiales/ });

    await toggle.click();
    await expect.element(toggle).toHaveTextContent("▲ Oficiales (1)");
    await toggle.click();

    await expect.element(toggle).toHaveTextContent("▼ Oficiales (1)");
    expect(page.getByTestId("officer-fields").elements()).toHaveLength(0);
  });

  it("the officers are corrected in place", async () => {
    const { harness } = await openEditor({ companies: [company("ACME SA")] });
    await editorRow(0)
      .getByRole("button", { name: /Oficiales/ })
      .click();

    await page.getByPlaceholder("Oficial 2: nombre").fill("Luis");
    await press("Guardar cambios");

    await expect.element(notice()).toHaveTextContent("Empresas actualizadas: 1");
    const [row] = rowsOf(saved(harness, "padron_replace")[0]);
    expect(row?.asesores).toMatchObject([OFFICER, { nombre: "Luis" }, {}, {}]);
  });

  it("each category enables its cap, and the cap moves when it changes", async () => {
    const { harness } = await openEditor({
      companies: [company("ACME SA", { rubro: { opcion: 4, importe: "24000" } })],
    });
    const caps = editorRow(0).getByTestId("cap-field");
    await expect.element(caps.nth(0)).toHaveValue("24.000");
    await expect.element(caps.nth(0)).not.toBeDisabled();
    await expect.element(caps.nth(1)).toBeDisabled();

    await editorRow(0).getByLabelText("Rubro").selectOptions("5");

    await expect.element(caps.nth(0)).toBeDisabled();
    await expect.element(caps.nth(1)).toHaveValue("24.000");

    await editorRow(0).getByLabelText("Rubro").selectOptions("6");
    await caps.nth(0).fill("30000");
    await caps.nth(1).fill("20000");
    await press("Guardar cambios");

    await expect.element(notice()).toHaveTextContent("Empresas actualizadas: 1");
    const [row] = rowsOf(saved(harness, "padron_replace")[0]);
    expect(row?.rubro).toMatchObject({
      opcion: 6,
      importe: "20000",
      importe2: "30000",
      txt: "Ambos",
    });
  });

  it("without a category there is nothing to cap", async () => {
    await openEditor({ companies: [company("ACME SA")] });
    const caps = editorRow(0).getByTestId("cap-field");

    await expect.element(caps.nth(0)).toBeDisabled();
    await expect.element(caps.nth(1)).toBeDisabled();
    await editorRow(0).getByLabelText("Rubro").selectOptions("4");
    await expect.element(caps.nth(0)).not.toBeDisabled();
    await editorRow(0).getByLabelText("Rubro").selectOptions("0");
    await expect.element(caps.nth(0)).toBeDisabled();
  });

  it("a cap is kept in the column of the category it was written in", async () => {
    const { harness } = await openEditor({
      companies: [company("ACME SA"), company("BETA SA")],
    });
    const capsOf = (row: number) => editorRow(row).getByTestId("cap-field");
    await editorRow(0).getByLabelText("Rubro").selectOptions("4");
    await capsOf(0).nth(0).fill("24000");
    await editorRow(1).getByLabelText("Rubro").selectOptions("5");
    await capsOf(1).nth(1).fill("18000");
    await press("Guardar cambios");

    await expect.element(notice()).toHaveTextContent("Empresas actualizadas: 2");
    const [fuel, grocery] = rowsOf(saved(harness, "padron_replace")[0]);
    expect(fuel?.rubro).toMatchObject({ opcion: 4, importe: "24000" });
    expect(grocery?.rubro).toMatchObject({ opcion: 5, importe: "18000" });
  });

  it("without flyers of categories there is no column for them", async () => {
    open({ files: { "_opciones.json": { opts: [{ n: 1 }] } }, companies: [company("ACME SA")] });
    await expect.element(status()).toMatchTextContent(/empresas|cargaste/);

    await press(/Editar en línea/);

    await expect.element(editorRow(0).getByPlaceholder("Razón social")).toHaveValue("ACME SA");
    await expect.element(editorRow(0).getByLabelText("Rubro")).not.toBeInTheDocument();
  });

  it("the solapa that is already open does not ask anything", async () => {
    await openEditor({ companies: [company("ACME SA")] });

    await page.getByRole("tab", { name: "Mis empresas" }).click();

    await expect.element(confirm()).not.toBeInTheDocument();
    await expect.element(page.getByTestId("company-editor")).toBeVisible();
  });

  it("going elsewhere from the search of screens asks first, and goes on after the yes", async () => {
    const { onClose } = await openEditor({ companies: [company("ACME SA")] });
    const goOn = vi.fn<() => void>();

    placeDeskOnPage().leave("database", goOn);
    await confirm().getByRole("button", { name: "Seguir editando" }).click();
    expect(goOn).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    placeDeskOnPage().leave("database", goOn);
    await confirm().getByRole("button", { name: "Salir sin guardar" }).click();
    expect(onClose).toHaveBeenCalledOnce();
    expect(goOn).toHaveBeenCalledOnce();
  });

  it("closing it with rows asks, and an empty one closes at once", async () => {
    await openEditor({ companies: [company("ACME SA")] });

    await page.getByTestId("company-editor").getByRole("button", { name: "Cancelar" }).click();
    await expect.element(confirm()).toMatchTextContent(/Salir del editor\?/);
    await confirm().getByRole("button", { name: "Seguir editando" }).click();
    await expect.element(page.getByTestId("company-editor")).toBeVisible();

    await press(/Cerrar editor/);
    await confirm().getByRole("button", { name: "Salir sin guardar" }).click();
    await expect.element(page.getByTestId("company-editor")).not.toBeInTheDocument();
  });

  it("an empty list has nothing to lose", async () => {
    await openEditor({ companies: [] });
    await expect
      .element(page.getByText("Todavía no hay empresas. Agregá la primera abajo."))
      .toBeVisible();

    await press(/Cerrar editor/);

    await expect.element(page.getByTestId("company-editor")).not.toBeInTheDocument();
    await expect.element(confirm()).not.toBeInTheDocument();
  });

  it("leaving the pane or the window with rows asks, and goes on after", async () => {
    const { onClose } = await openEditor({ companies: [company("ACME SA")] });

    await page.getByRole("tab", { name: "Mis asesores" }).click();
    await expect.element(confirm()).toMatchTextContent(/Salir del editor de empresas\?/);
    await confirm().getByRole("button", { name: "Seguir editando" }).click();
    await expect
      .element(page.getByRole("tab", { name: "Mis empresas" }))
      .toHaveAttribute("aria-selected", "true");

    await page.getByRole("tab", { name: "Mis asesores" }).click();
    await confirm().getByRole("button", { name: "Salir sin guardar" }).click();
    await expect
      .element(page.getByRole("tab", { name: "Mis asesores" }))
      .toHaveAttribute("aria-selected", "true");

    await page.getByRole("button", { name: "Cerrar" }).click();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("the generator does not open over the editor until the person answers", async () => {
    await openEditor({ companies: [company("ACME SA")] });

    await press(/Generar flyers/);
    await expect.element(confirm()).toBeVisible();
    await confirm().getByRole("button", { name: "Salir sin guardar" }).click();

    await expect.element(page.getByTestId("generator")).not.toBeInTheDocument();
    await press(/Generar flyers/);
    await expect.element(page.getByTestId("generator")).toBeVisible();
  });
});

describe("Generar flyers", () => {
  const MANY = Array.from({ length: 30 }, (_, row) => company(`EMPRESA ${String(row)}`));

  it("says it could not connect, and not that there are no companies", async () => {
    let cut = true;
    await openGenerator({
      companies: (request) => (cut ? FAILED_CONNECTION(request) : jsonResponse([company("ACME")])),
    });

    await expect
      .element(page.getByTestId("generator"), { timeout: 12_000 })
      .toMatchTextContent(/No se pudo conectar para traer tus empresas/);
    cut = false;
    await page
      .getByTestId("generator")
      .getByRole("button", { name: /Reintentar/ })
      .click();

    await expect.element(rowOf(0)).toBeVisible();
  });

  it("nothing loaded says so", async () => {
    await openGenerator({ companies: [] });

    await expect
      .element(page.getByTestId("generator"))
      .toHaveTextContent("Todavía no cargaste empresas.");
  });

  it("the counter follows the ticks, and the row is not drawn again", async () => {
    await openGenerator({ companies: MANY });
    await expect.element(rowOf(0)).toBeVisible();
    const first = rowOf(0).element();

    await rowOf(4).getByRole("checkbox").click();
    await rowOf(6).getByRole("checkbox").click();

    await expect.element(count()).toMatchTextContent(/^2 de 30 empresas seleccionadas/);
    expect(rowOf(0).element()).toBe(first);

    await rowOf(6).getByRole("checkbox").click();
    await expect.element(count()).toMatchTextContent(/^1 de 30 empresas seleccionada$/);
  });

  it("the filter finds and says how many of those are ticked", async () => {
    await openGenerator({ companies: MANY });
    await rowOf(1).getByRole("checkbox").click();
    const filter = page.getByPlaceholder("Filtrar por razón social o CUIT...");

    await filter.fill("empresa 1");

    await expect.element(count()).toMatchTextContent(/mostrando 12 \(1 tildada\)/);
    await filter.fill("zzz");
    await expect.element(page.getByText('Sin resultados para "zzz".')).toBeVisible();
  });

  it("with many companies the filter waits for the typing to stop", async () => {
    const many = Array.from({ length: 400 }, (_, row) => company(`EMPRESA ${String(row)}`));
    await openGenerator({ companies: many });
    await expect.element(rowOf(0)).toBeVisible();

    await page.getByPlaceholder("Filtrar por razón social o CUIT...").fill("empresa 39");

    expect(generatorRows().elements().length).toBe(400);
    await vi.waitFor(() => {
      expect(generatorRows().elements().length).toBe(14);
    });
  });

  it("Todas and Ninguna go over what is shown", async () => {
    await openGenerator({ companies: MANY });
    await expect.element(rowOf(0)).toBeVisible();

    await press("Todas");
    await expect.element(count()).toMatchTextContent(/^30 de 30/);
    await page.getByPlaceholder("Filtrar por razón social o CUIT...").fill("empresa 29");
    await expect.element(generatorRows()).toBeVisible();
    await press("Ninguna");
    await expect.element(count()).toMatchTextContent(/^29 de 30/);
  });

  it("a company that cannot come out cannot be ticked, and says why", async () => {
    await openGenerator({
      faculties: ["padron_buscar"],
      files: {
        "_opciones.json": { opts: [{ n: 1 }, { n: 4, nombre: "Combustible", solapa: "rubros" }] },
      },
      companies: [company("ACME", { rubro: { opcion: 4 }, config: "", asesores: [] })],
    });
    await expect.element(rowOf(0).getByRole("checkbox")).toBeDisabled();
    await expect
      .element(rowOf(0))
      .toMatchTextContent(
        /rubro «Combustible» no habilitado para tu perfil · sin oficiales · sin cashback/,
      );
    await expect.element(rowOf(0)).toMatchTextContent(/sin formato disponible/);
    await press("Todas");
    await expect.element(count()).toMatchTextContent(/^0 de 1/);
  });

  it("generating needs a tick, and goes to the flyer editor with those companies", async () => {
    const port = generation({
      generate: vi.fn<FlyerGenerationPort["generate"]>(({ onProgress }) => {
        onProgress({ percent: 50, text: "Generando 1 de 2" });
        return Promise.resolve();
      }),
    });
    await openGenerator({ companies: MANY }, port);
    await expect.element(rowOf(0)).toBeVisible();

    await press(/Generar ZIP/);
    await expect.element(notice()).toHaveTextContent("Tildá al menos una empresa");
    expect(port.generate).not.toHaveBeenCalled();

    await rowOf(2).getByRole("checkbox").click();
    await page.getByLabelText("Formato de los archivos").selectOptions("png");
    await press(/Generar ZIP/);

    await expect.element(page.getByText("Generando 1 de 2")).toBeVisible();
    expect(port.generate).toHaveBeenCalledOnce();
    const request = vi.mocked(port.generate).mock.calls[0]?.[0];
    expect(request?.format).toBe("png");
    expect(request?.companies.map(({ empresa }) => empresa)).toEqual(["EMPRESA 2"]);
  });

  it("the format chosen can go back to PDF", async () => {
    const port = generation();
    await openGenerator({ companies: MANY }, port);
    await expect.element(rowOf(0)).toBeVisible();
    await rowOf(0).getByRole("checkbox").click();
    const format = page.getByLabelText("Formato de los archivos");

    await format.selectOptions("png");
    await format.selectOptions("pdf");
    await press(/Generar ZIP/);

    expect(vi.mocked(port.generate).mock.calls[0]?.[0].format).toBe("pdf");
  });

  it("with nobody to generate it, it says it could not", async () => {
    await openGenerator({ companies: MANY });
    await expect.element(rowOf(0)).toBeVisible();
    await rowOf(0).getByRole("checkbox").click();

    await press(/Generar ZIP/);

    await expect.element(notice()).toMatchTextContent(/No se pudo preparar el ZIP/);
  });

  it("what the flyer editor knows decides the flyer of each one", async () => {
    await openGenerator(
      {
        files: {
          "_opciones.json": {
            opts: [
              { n: 1, nombre: "Uno" },
              { n: 2, nombre: "Dos" },
            ],
          },
        },
        role: "admin",
        companies: [company("ACME")],
      },
      generation({ hasFlyer: (option) => option !== 2 }),
    );

    await expect.element(rowOf(0)).toMatchTextContent(/Flyer Galicia · Uno/);
  });

  it("while it generates, nothing that holds it closes", async () => {
    const { onClose } = await openGenerator(
      { companies: MANY },
      generation({ isGenerating: () => true }),
    );

    await page.getByRole("button", { name: "Cerrar" }).click();

    await expect.element(notice()).toHaveTextContent("Esperá a que termine de generar los flyers");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes with its button and the list comes back", async () => {
    await openGenerator({ companies: MANY });

    await press(/Cerrar generador/);

    await expect.element(page.getByTestId("generator")).not.toBeInTheDocument();
    await expect.element(page.getByText("Primeras 25 de 30")).toBeVisible();
  });
});

describe("Mis asesores", () => {
  const ANA = { id: "a1", name: "Ana", nombre: "Ana Perez", celular: "11 1", email: "a@b.com" };
  const LUIS = { id: "a2", name: "", nombre: "Luis Gomez", celular: "11 2", email: "l@b.com" };

  async function openAdvisors(cloud: RegistryCloud = {}) {
    const opened = open({ advisors: [ANA, LUIS], ...cloud });
    await page.getByRole("tab", { name: "Mis asesores" }).click();
    return opened;
  }

  it("shows them, and a real name stands in for the visible one", async () => {
    await openAdvisors();

    await expect.element(advisorStatus()).toHaveTextContent("2 asesores guardados");
    await expect
      .element(advisorRows().nth(1).getByPlaceholder("Nombre visible"))
      .toHaveValue("Luis Gomez");
  });

  it("one reads in singular, and with none it says how to start", async () => {
    await openAdvisors({ advisors: [ANA] });
    await expect.element(advisorStatus()).toHaveTextContent("1 asesor guardado");
  });

  it("nobody saved says how to start", async () => {
    await openAdvisors({ advisors: [] });
    await expect
      .element(advisorStatus())
      .toHaveTextContent("Todavía no guardaste ningún asesor. Agregá el primero o subí un Excel.");
  });

  it("a correction says it is not saved, and goes up with its button", async () => {
    const { harness } = await openAdvisors();
    await expect.element(advisorRows().first()).toBeVisible();

    await advisorRows().first().getByPlaceholder("Celular").fill("11 9");
    await expect.element(advisorStatus()).toMatchTextContent(/cambios sin guardar/);
    expect(saved(harness, "asesores_replace")).toHaveLength(0);

    await page.getByTestId("advisors-save").click();

    await expect.element(notice()).toHaveTextContent("2 asesores guardados");
    expect(rowsOf(saved(harness, "asesores_replace")[0])[0]).toMatchObject({ celular: "11 9" });
    await expect.element(advisorStatus()).not.toMatchTextContent(/cambios sin guardar/);
  });

  it("if the cloud does not take it, it says so and keeps it here", async () => {
    await openAdvisors({ functions_: { asesores_replace: () => databaseError("falla") } });
    await expect.element(advisorRows().first()).toBeVisible();

    await advisorRows().first().getByPlaceholder("Celular").fill("11 9");
    await page.getByTestId("advisors-save").click();

    await expect
      .element(notice())
      .toHaveTextContent("No se pudo guardar en la nube: falla (quedó en esta computadora)");
    await expect.element(advisorStatus()).toMatchTextContent(/cambios sin guardar/);
  });

  it("Recargar does not lose what was written", async () => {
    await openAdvisors();
    await expect.element(advisorRows().first()).toBeVisible();

    await press("Recargar");
    await advisorRows().first().getByPlaceholder("Celular").fill("11 9");
    await page.getByRole("tabpanel").getByRole("button", { name: "Recargar" }).click();

    await expect
      .element(notice())
      .toHaveTextContent("Tenés cambios sin guardar: guardalos o descartalos");
    await expect.element(advisorRows().first().getByPlaceholder("Celular")).toHaveValue("11 9");
  });

  it("a new one comes with the focus, and takes the filter away", async () => {
    await openAdvisors();
    await expect.element(advisorRows().first()).toBeVisible();
    await page.getByPlaceholder("Filtrar: nombre, celular o mail...").fill("luis");
    await expect.element(page.getByText("Mostrando 1 de 2.")).toBeVisible();

    await press("+ Agregar asesor");

    await expect.element(advisorRows().nth(2)).toBeVisible();
    await expect.element(advisorRows().nth(2).getByPlaceholder("Nombre visible")).toHaveFocus();
  });

  it("the filter says when there is nothing", async () => {
    await openAdvisors();
    await expect.element(advisorRows().first()).toBeVisible();

    await page.getByPlaceholder("Filtrar: nombre, celular o mail...").fill("zzz");

    await expect.element(page.getByText('Sin resultados para "zzz".')).toBeVisible();
  });

  it("deleting asks and goes with Guardar cambios", async () => {
    const { harness } = await openAdvisors();
    await expect.element(advisorRows().first()).toBeVisible();

    await advisorRows().first().getByRole("button", { name: "Eliminar asesor" }).click();
    await expect.element(confirm()).toMatchTextContent(/¿Eliminar el asesor guardado "Ana"\?/);
    await expect.element(confirm()).toMatchTextContent(/Se borra al tocar "Guardar cambios"/);
    await confirm().getByRole("button", { name: "Eliminar" }).click();

    await expect
      .element(advisorStatus())
      .toMatchTextContent(/1 asesor guardado.*cambios sin guardar/);
    expect(saved(harness, "asesores_replace")).toHaveLength(0);
  });

  it("discarding asks only if there is something to lose", async () => {
    await openAdvisors();
    await expect.element(advisorRows().first()).toBeVisible();

    await press("Descartar cambios");
    await expect.element(confirm()).not.toBeInTheDocument();

    await advisorRows().first().getByPlaceholder("Celular").fill("11 9");
    await press("Descartar cambios");
    await confirm().getByRole("button", { name: "Descartar" }).click();

    await expect.element(notice()).toHaveTextContent("Cambios descartados");
    await expect.element(advisorRows().first().getByPlaceholder("Celular")).toHaveValue("11 1");
  });

  it("leaving with changes asks, and they are lost only if the person accepts", async () => {
    const { onClose } = await openAdvisors();
    await expect.element(advisorRows().first()).toBeVisible();
    await advisorRows().first().getByPlaceholder("Celular").fill("11 9");

    await page.getByRole("button", { name: "Cerrar" }).click();
    await expect.element(confirm()).toMatchTextContent(/Tenés cambios sin guardar en tus asesores/);
    await confirm().getByRole("button", { name: "Seguir editando" }).click();
    expect(onClose).not.toHaveBeenCalled();

    await page.getByRole("button", { name: "Cerrar" }).click();
    await confirm().getByRole("button", { name: "Salir sin guardar" }).click();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("an empty editor of companies does not ask, and the advisors still do", async () => {
    const { onClose } = await openAdvisors({ companies: [] });
    await expect.element(advisorRows().first()).toBeVisible();
    await advisorRows().first().getByPlaceholder("Celular").fill("11 9");
    await page.getByRole("tab", { name: "Mis empresas" }).click();
    await confirm().getByRole("button", { name: "Salir sin guardar" }).click();
    await press(/Editar en línea/);
    await page.getByRole("tab", { name: "Mis asesores" }).click();
    await expect
      .element(page.getByRole("tab", { name: "Mis asesores" }))
      .toHaveAttribute("aria-selected", "true");
    await page.getByRole("button", { name: "Cerrar" }).click();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("a sheet adds its advisors on top, and says how many", async () => {
    const { harness } = await openAdvisors();
    await expect.element(advisorRows().first()).toBeVisible();

    await upload(
      [
        ["guardar_como", "nombre", "celular", "email", "asesor2_nombre", "asesor2_celular"],
        ["Rotulo", "Sol Ruiz", "11 3", "s@b.com", "Dos Segundo", "11 4"],
      ],
      "advisor-sheet-input",
    );

    await expect.element(notice()).toHaveTextContent("2 asesores importados");
    const rows = rowsOf(saved(harness, "asesores_replace")[0]);
    expect(rows.map(({ nombre }) => nombre)).toEqual([
      "Sol Ruiz",
      "Dos Segundo",
      "Ana Perez",
      "Luis Gomez",
    ]);
    expect(rows[0]?.name).toBe("Rotulo");
  });

  it("one advisor reads in singular, and a sheet without any says so", async () => {
    await openAdvisors();
    await expect.element(advisorRows().first()).toBeVisible();

    await upload([["nombre"], ["Sol Ruiz"]], "advisor-sheet-input");
    await expect.element(notice()).toHaveTextContent("1 asesor importado");

    await upload([["otra"], ["x"]], "advisor-sheet-input");
    await expect.element(notice()).toHaveTextContent("No se encontraron asesores en el Excel");
  });

  const cacheKey = `fg_asesores_${INVENTED_USER.id}`;
  const syncKey = `fg_asesores_sync_${INVENTED_USER.id}`;

  it("what this browser had joins the cloud the first time, without stepping on anything", async () => {
    localStorage.setItem(cacheKey, JSON.stringify([LUIS, ANA]));
    const { harness } = open({ advisors: [ANA], faculties: ["asesores_guardados"] });

    await expect.element(advisorRows().nth(1)).toBeVisible();

    const rows = rowsOf(saved(harness, "asesores_replace")[0]);
    expect(rows.map(({ id }) => id)).toEqual(["a2", "a1"]);
    expect(localStorage.getItem(syncKey)).toBe("1");
  });

  it("after that, an old copy does not bring back what was deleted", async () => {
    localStorage.setItem(cacheKey, JSON.stringify([LUIS]));
    localStorage.setItem(syncKey, "1");
    const { harness } = open({ advisors: [ANA], faculties: ["asesores_guardados"] });

    await expect.element(advisorRows().first()).toBeVisible();

    await expect.element(advisorRows().first().getByPlaceholder("Celular")).toHaveValue("11 1");
    expect(saved(harness, "asesores_replace")).toHaveLength(0);
  });

  it("if the cloud does not answer, the copy of the browser stands in", async () => {
    localStorage.setItem(cacheKey, JSON.stringify([LUIS]));
    open({ advisors: FAILED_CONNECTION, faculties: ["asesores_guardados"] });

    await expect
      .element(advisorRows().first().getByPlaceholder("Celular"), { timeout: 12_000 })
      .toHaveValue("11 2");
  });

  it("if the cloud answers with an error, too", async () => {
    localStorage.setItem(cacheKey, JSON.stringify([LUIS]));
    open({ advisors: () => databaseError("falla"), faculties: ["asesores_guardados"] });

    await expect.element(advisorRows().first().getByPlaceholder("Celular")).toHaveValue("11 2");
  });
});
