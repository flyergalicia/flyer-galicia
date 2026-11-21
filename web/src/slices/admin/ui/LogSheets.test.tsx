// The dashboard, Registros, Cambios en las empresas and Auditoría: what they read, what they say
// when they cannot, and the Excel of each with every row.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { SHEET_LIBRARY, type SheetApi } from "@/shared/lib/sheet-library.ts";
import { FIRST_PLACE, goToSheet, rememberPlace, type SheetId } from "../model/panel.ts";
import { openPanel, type PanelOptions } from "../testing/panel-cloud.ts";

const panel = () => page.getByTestId("admin-panel");
const notice = () => page.getByRole("status");
const MARKUP = '<img src=x onerror="window.__xss=1"><b>malo</b>';
const MANY = 2_300;
const NOW = new Date().toISOString();

let library: SheetApi;
let written: unknown[][][] = [];
let files: string[] = [];

beforeEach(async () => {
  library = await SHEET_LIBRARY.load();
  written = [];
  files = [];
  vi.spyOn(library.utils, "aoa_to_sheet").mockImplementation((lines) => {
    written.push(lines.map((line) => [...line]));
    return {};
  });
  vi.spyOn(library, "writeFile").mockImplementation((_book, name) => {
    files.push(name);
  });
});

afterEach(() => {
  rememberPlace(FIRST_PLACE);
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, "__xss");
});

async function openOn(sheet: SheetId, options: PanelOptions = {}) {
  rememberPlace(goToSheet(FIRST_PLACE, sheet));
  return openPanel(options);
}

function failing(path: string, select = "") {
  let fails = true;
  return {
    intercept: ({
      path: asked,
      method,
      query,
    }: {
      path: string;
      method: string;
      query: URLSearchParams;
    }) =>
      fails && asked === path && method === "GET" && (query.get("select") ?? "").startsWith(select)
        ? new Response(JSON.stringify({ message: "sin red" }), { status: 503 })
        : null,
    heal: () => {
      fails = false;
    },
  };
}

const people = [
  {
    id: "u1",
    full_name: "Ana Perez",
    email_asesor: "ana@b.com",
    role: "asesor",
    status: "active",
    last_login: NOW,
  },
  {
    id: "u2",
    full_name: null,
    email_asesor: "luis@b.com",
    role: "admin",
    status: "pending",
    last_login: null,
  },
  {
    id: "u3",
    full_name: "Rita",
    email_asesor: "",
    role: "rara",
    status: "reset_pending",
    last_login: "2026-10-01T10:00:00Z",
  },
];

function flyerLog(at: number, fields: Record<string, unknown> = {}) {
  return {
    id: `l${String(at)}`,
    user_id: "u1",
    empresa: `EMPRESA ${String(at)}`,
    config_name: "BAU",
    format: "pdf",
    flyer_type: "{}",
    created_at: NOW,
    ...fields,
  };
}

describe("the dashboard", () => {
  it("counts the people and the flyers, and lists who entered and who generated", async () => {
    await openPanel({
      accounts: people,
      flyerLogs: [flyerLog(1), flyerLog(2, { user_id: "u9", empresa: "", config_name: null })],
    });
    const dashboard = panel().getByTestId("admin-dashboard");
    await expect.element(dashboard).toMatchTextContent(/Total usuarios3/);
    await expect
      .element(dashboard)
      .toMatchTextContent(/Activos1Admins1Flyers generados2Pendientes aprobación2/);
    await expect.element(dashboard).toMatchTextContent(/Ana Perezana@b.comAsesorhace un momento/);
    await expect.element(dashboard).toMatchTextContent(/RitaAsesor01\/10\/2026/);
    await expect.element(dashboard).toMatchTextContent(/EMPRESA 1 · BAU/);
    await expect.element(dashboard).toMatchTextContent(/u9Sin empresa/);
  });

  it("says when nobody entered and nothing was generated", async () => {
    await openPanel({ accounts: [{ ...people[1], last_login: null }] });
    await expect.element(panel()).toMatchTextContent(/Sin accesos registrados/);
    await expect.element(panel()).toMatchTextContent(/Sin flyers generados aún/);
  });

  it("a read that fails says so, never zero", async () => {
    const summary = failing("/rest/v1/profiles", "id,role,status");
    const logs = failing("/rest/v1/flyer_logs");
    await openPanel({
      intercept: (request) => summary.intercept(request) ?? logs.intercept(request),
    });
    await expect.element(panel()).toMatchTextContent(/No se pudo leer el resumen/);
    await expect.element(panel()).toMatchTextContent(/No se pudieron leer los flyers recientes/);
    expect(panel().element().textContent).not.toMatch(/Total usuarios0/);
    summary.heal();
    logs.heal();
    await panel().getByRole("button", { name: "Reintentar" }).first().click();
    await panel().getByRole("button", { name: "Reintentar" }).first().click();
    await expect.element(panel()).toMatchTextContent(/Sin flyers generados aún/);
  });

  it("exports every flyer, page after page", async () => {
    await openPanel({
      accounts: people,
      flyerLogs: Array.from({ length: MANY }, (_, at) => flyerLog(at)),
    });
    await panel().getByTestId("export-dashboard").click();
    await expect.element(notice()).toHaveTextContent("Excel descargado");
    expect(written[0]?.[0]).toEqual([
      "Usuario",
      "Empresa",
      "Formato",
      "Configuración",
      "Fecha/Hora",
    ]);
    expect(written[0]?.slice(1)).toHaveLength(MANY);
    expect(written[0]?.[1]?.slice(0, 4)).toEqual(["Ana Perez", "EMPRESA 0", "pdf", "BAU"]);
    expect(files[0]).toMatch(/^flyers_galicia_\d{4}-\d{2}-\d{2}\.xlsx$/);
  });

  it("a count of flyers that did not arrive is not zero", async () => {
    await openPanel({
      accounts: people,
      intercept: ({ path, method }) =>
        path === "/rest/v1/flyer_logs" && method === "HEAD"
          ? new Response(null, { status: 503 })
          : null,
    });
    await expect.element(panel()).toMatchTextContent(/No se pudo leer el resumen: sin conexión\./);
    expect(panel().element().textContent).not.toMatch(/Flyers generados0/);
  });

  it("an export with nothing says so", async () => {
    await openPanel({ accounts: people });
    await panel().getByTestId("export-dashboard").click();
    await expect.element(notice()).toHaveTextContent("Sin datos para exportar");
    expect(files).toEqual([]);
  });

  it("an export that fails says so, and the button can be pressed again", async () => {
    let fails = false;
    await openPanel({
      accounts: people,
      intercept: ({ path, query }) =>
        fails && path === "/rest/v1/flyer_logs" && query.has("offset")
          ? new Response(JSON.stringify({ message: "sin red" }), { status: 503 })
          : null,
    });
    await expect.element(panel()).toMatchTextContent(/Sin flyers generados aún/);
    fails = true;
    await panel().getByTestId("export-dashboard").click();
    await expect.element(notice()).toMatchTextContent(/^No se pudo exportar: /);
    expect(files).toEqual([]);
    await expect.element(panel().getByTestId("export-dashboard")).toBeEnabled();
  });
});

const typed = (fields: Record<string, unknown>) => JSON.stringify(fields);

describe("Registros", () => {
  it("shows each flyer with its option, its batch, its amounts and its advisor, as text", async () => {
    await openOn("registros", {
      accounts: people,
      files: {
        "_opciones.json": { opts: [{ n: 9, nombre: "Combustible", color: "#2e7d32" }] },
      },
      flyerLogs: [
        flyerLog(1, {
          empresa: MARKUP,
          format: "png",
          flyer_type: typed({
            opcion: 9,
            masivo: true,
            padron: true,
            config: MARKUP,
            importe: "24.000",
            importe2: "30.000",
            beneficio: "Otro cartel",
            nombre: "Ana",
            celular: "11",
            email: "a@b",
          }),
        }),
        flyerLog(2, { flyer_type: typed({ masivo: true, celular: "11" }), format: null }),
        flyerLog(3, { flyer_type: "[]" }),
      ],
    });
    const list = panel().getByTestId("log-row");
    await expect.element(list.first()).toMatchTextContent(/<b>malo<\/b>/);
    await expect.element(list.first()).toMatchTextContent(/PNGOP\.9EMPRESAS/);
    await expect.element(list.first()).toMatchTextContent(/Tope 24\.000 \/ 30\.000Otro cartel/);
    await expect.element(list.first()).toMatchTextContent(/Asesor: Ana · 11 · a@b/);
    await expect.element(list.nth(1)).toMatchTextContent(/MASIVO/);
    expect(list.nth(1).element().textContent).not.toMatch(/Asesor:/);
    await expect.element(panel()).toMatchTextContent(/3 registros/);
    expect(document.querySelector('[data-testid="admin-panel"] img[src="x"]')).toBeNull();
  });

  it("filters by company and dates on Buscar, by user in the browser, and ✕ clears them", async () => {
    const { harness } = await openOn("registros", {
      accounts: people,
      flyerLogs: [flyerLog(1), flyerLog(2, { user_id: "u3" })],
    });
    await expect.element(panel()).toMatchTextContent(/2 registros/);
    const box = panel().getByTestId("log-filters");
    await userEvent.fill(box.getByPlaceholder("Filtrar empresa..."), " ACME ");
    await userEvent.fill(box.getByPlaceholder("Filtrar usuario..."), "rita");
    await userEvent.fill(box.getByLabelText("Desde"), "2026-10-01");
    await userEvent.fill(box.getByLabelText("Hasta"), "2026-10-31");
    await box.getByRole("button", { name: "Buscar" }).click();
    await expect.element(panel()).toMatchTextContent(/1 registro(?!s)/);
    const asked = harness.network.to("/rest/v1/flyer_logs", "GET").at(-1)?.query;
    expect([asked?.get("empresa"), asked?.getAll("created_at")]).toEqual([
      "ilike.%ACME%",
      ["gte.2026-10-01T00:00:00", "lte.2026-10-31T23:59:59"],
    ]);
    await box.getByRole("button", { name: "Limpiar filtros" }).click();
    await expect.element(panel()).toMatchTextContent(/2 registros/);
    await expect.element(box.getByPlaceholder("Filtrar usuario...")).toHaveValue("");
  });

  it("says when there are none", async () => {
    await openOn("registros", { accounts: people });
    await expect.element(panel()).toMatchTextContent(/Sin registros aún/);
  });

  it("says what failed, never that there are none", async () => {
    const logs = failing("/rest/v1/flyer_logs", "id,user_id");
    await openOn("registros", { accounts: people, intercept: logs.intercept });
    await expect.element(panel().getByRole("alert")).toMatchTextContent(/^Error: /);
    expect(panel().element().textContent).not.toMatch(/Sin registros/);
  });

  it("exports every row that matches, by user too", async () => {
    await openOn("registros", {
      accounts: people,
      flyerLogs: [
        ...Array.from({ length: MANY }, (_, at) => flyerLog(at)),
        flyerLog(9999, { user_id: "u3" }),
      ],
    });
    await userEvent.fill(panel().getByPlaceholder("Filtrar usuario..."), "ana");
    await panel().getByTestId("export-registros").click();
    await expect.element(notice()).toHaveTextContent("Excel descargado");
    expect(written[0]?.slice(1)).toHaveLength(MANY);
    expect(written[0]?.[0]?.[14]).toBe("Formato");
    expect(files[0]).toMatch(/^registros_flyers_galicia_/);
  });
});

const change = (at: number, fields: Record<string, unknown> = {}) => ({
  id: at,
  user_id: "u1",
  usuario: "Ana Perez",
  accion: "alta",
  empresa: `EMPRESA ${String(at)}`,
  cambios: { cuits: { despues: ["30711111111"] } },
  total: 3,
  created_at: NOW,
  ...fields,
});

describe("Cambios en las empresas", () => {
  it("tells each change as text, and hides the ones of format only", async () => {
    await openOn("padronlog", {
      companyLog: [
        change(1, { usuario: MARKUP, empresa: MARKUP }),
        change(2, { accion: "baja", total: 1 }),
        change(3, {
          accion: "modificacion",
          cambios: { config: { antes: "BAU", despues: "BAU" } },
        }),
        change(5, { usuario: null, empresa: "", user_id: null, accion: "baja", cambios: {} }),
        change(4, {
          accion: "modificacion",
          cambios: { config: { antes: "BAU", despues: "Config 1" } },
          total: null,
        }),
      ],
    });
    const rows = panel().getByTestId("log-row");
    await expect.element(panel()).toMatchTextContent(/4 cambios/);
    await expect.element(rows.first()).toMatchTextContent(/<b>malo<\/b>Alta/);
    await expect.element(rows.first()).toMatchTextContent(/CUIT: 30-71111111-1/);
    await expect.element(rows.first()).toMatchTextContent(/Empresas: 3 empresas/);
    await expect.element(rows.nth(1)).toMatchTextContent(/Baja.*Empresas: 1 empresa(?!s)/);
    await expect
      .element(rows.nth(2))
      .toMatchTextContent(/^US—BajaPor Usuario\s*·\s*Empresas: 3 empresas/);
    await expect.element(rows.nth(3)).toMatchTextContent(/Modificación.*Cashback: BAU → Config 1/);
    expect(rows.nth(3).element().textContent).not.toMatch(/Empresas:/);
  });

  it("filters by action on Buscar, says the last 500 and exports everything", async () => {
    const { harness } = await openOn("padronlog", {
      companyLog: Array.from({ length: MANY }, (_, at) => change(at)),
    });
    await expect
      .element(panel())
      .toMatchTextContent(
        /500 cambios \(se muestran los últimos 500; para ver todo, exportá a Excel\)/,
      );
    await userEvent.selectOptions(panel().getByLabelText("Acción"), "Bajas");
    await userEvent.fill(panel().getByPlaceholder("Filtrar empresa..."), "x");
    await userEvent.fill(panel().getByLabelText("Desde"), "2026-10-01");
    await userEvent.fill(panel().getByLabelText("Hasta"), "2026-10-31");
    await panel().getByRole("button", { name: "Buscar" }).click();
    await expect
      .poll(() => harness.network.to("/rest/v1/padron_log").at(-1)?.query.get("accion"))
      .toBe("eq.baja");
    await panel().getByRole("button", { name: "Limpiar filtros" }).click();
    await panel().getByTestId("export-company-log").click();
    await expect.element(notice()).toHaveTextContent("Excel descargado");
    expect(written[0]?.slice(1)).toHaveLength(MANY);
    expect(written[0]?.[1]?.slice(2)).toEqual(["Alta", "EMPRESA 0", "CUIT: 30-71111111-1", 3]);
    expect(files[0]).toMatch(/^cambios_empresas_galicia_/);
  });

  it("says when there are none, and exports nothing", async () => {
    await openOn("padronlog");
    await expect.element(panel()).toMatchTextContent(/Sin cambios registrados todavía/);
    await page.getByTestId("export-company-log").click();
    await expect.element(notice()).toHaveTextContent("Sin datos para exportar");
  });

  it("says what failed, and an export that fails says so", async () => {
    const log = failing("/rest/v1/padron_log");
    await openOn("padronlog", { intercept: log.intercept });
    await expect.element(panel().getByRole("alert")).toMatchTextContent(/^Error: /);
    await page.getByTestId("export-company-log").click();
    await expect.element(notice()).toMatchTextContent(/^Error: /);
  });
});

const entry = (at: number, fields: Record<string, unknown> = {}) => ({
  id: at,
  created_at: NOW,
  accion: "approve_user",
  actor_email: "jefe@b.com",
  objetivo_email: "nueva@b.com",
  detalle: { ip: "1.2.3.4" },
  ...fields,
});

describe("Auditoría", () => {
  it("tells who did what to which account, as text", async () => {
    await openOn("auditoria", {
      audit: [
        entry(1, { actor_email: MARKUP, objetivo_email: MARKUP }),
        entry(2, { actor_email: null, accion: "register", detalle: null, objetivo_email: null }),
      ],
    });
    const rows = panel().getByTestId("log-row");
    await expect.element(rows.first()).toMatchTextContent(/Aprobó la cuenta deCuenta <img src=x/);
    await expect.element(rows.first()).toMatchTextContent(/IP 1\.2\.3\.4/);
    await expect
      .element(rows.nth(1))
      .toMatchTextContent(/Pidió accesoCuenta —Por Visitante \(sin sesión\)/);
    await expect.element(panel()).toMatchTextContent(/2 registros/);
    expect(document.querySelector('[data-testid="admin-panel"] img[src="x"]')).toBeNull();
  });

  it("filters by action at once, and Actualizar reads again", async () => {
    const { harness } = await openOn("auditoria", {
      audit: Array.from({ length: 300 }, (_, at) => entry(at)),
    });
    await expect
      .element(panel())
      .toMatchTextContent(/300 registros \(se muestran los últimos 300\)/);
    await userEvent.selectOptions(panel().getByLabelText("Acción"), "Usuarios eliminados");
    await expect
      .poll(() => harness.network.to("/rest/v1/audit_log").at(-1)?.query.get("accion"))
      .toBe("eq.delete_user");
    const before = harness.network.to("/rest/v1/audit_log").length;
    await panel().getByRole("button", { name: "Actualizar" }).click();
    await expect.poll(() => harness.network.to("/rest/v1/audit_log").length).toBe(before + 1);
  });

  it("says when there are none", async () => {
    await openOn("auditoria");
    await expect.element(panel()).toMatchTextContent(/Sin registros todavía/);
  });

  it("says what failed, never that there are none", async () => {
    const audit = failing("/rest/v1/audit_log");
    await openOn("auditoria", { intercept: audit.intercept });
    await expect.element(panel().getByRole("alert")).toMatchTextContent(/^Error: /);
  });
});
