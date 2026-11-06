// The tab Gestiones over a simulated cloud: what each one sees, and what a failure says.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { placeDeskOnPage } from "@/shared/lib/testing/place-desk-on-page.ts";
import { deferred, jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import { CUT, FAILS, fieldsOf, ME } from "../testing/commercial-cloud.ts";
import { openCommercial } from "../testing/commercial-on-screen.tsx";
import { aListedAction } from "../testing/fixtures.ts";

const tabs = () => page.getByTestId("commercial-tabs");
const tab = (name: string) => tabs().getByRole("tab", { name: new RegExp(`^${name}`) });
const rows = () => page.getByTestId("action-row");
const row = (company: string) => rows().filter({ hasText: company });
const notice = () => page.getByRole("status");
const list = () => page.getByTestId("actions-list");
const clear = () => page.getByRole("button", { name: "Limpiar filtros" });
const markAll = () => page.getByRole("button", { name: /Marcar todas como le/ });

const ONE = aListedAction({ id: "a", empresa: "ALIMENTOS SA", dueno_id: ME, creada_por: ME });

async function openList(cloud: Parameters<typeof openCommercial>[0] = {}, options = {}) {
  const opened = await openCommercial(cloud, options);
  await tab(cloud?.role === "hunter" ? "Mis gestiones" : "Gestiones").click();
  return opened;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("the solapas", () => {
  it("an officer enters on Mis empresas", async () => {
    await openCommercial({ role: "vip" });
    await expect.element(tab("Mis empresas")).toHaveAttribute("aria-selected", "true");
    await expect.element(tab("Agenda")).toBeVisible();
    await expect.element(tab("Tablero")).toBeVisible();
    await expect
      .element(page.getByRole("heading", { name: "Gestiones comerciales" }))
      .toBeVisible();
  });

  it("a hunter enters on the agenda", async () => {
    await openCommercial({ role: "hunter" });
    await expect.element(tab("Mi agenda")).toHaveAttribute("aria-selected", "true");
    await expect.element(page.getByTestId("agenda")).toBeVisible();
    await expect.element(page.getByText(/Tu agenda con día y horario/)).toBeVisible();
  });

  it("a leader enters on the agenda of the team", async () => {
    await openCommercial({ role: "lider" });
    await expect.element(tab("Agenda del equipo")).toHaveAttribute("aria-selected", "true");
    await expect.element(tab("Gestiones del equipo")).toBeVisible();
  });

  it("a solapa from the search of screens goes there, as touching it does", async () => {
    await openCommercial({ role: "hunter" });
    await expect.element(tab("Mi agenda")).toHaveAttribute("aria-selected", "true");

    placeDeskOnPage().ask("commercial-actions", "tablero");
    await expect.element(tab("Tablero")).toHaveAttribute("aria-selected", "true");
    placeDeskOnPage().ask("commercial-actions", "otra");
    await expect.element(tab("Tablero")).toHaveAttribute("aria-selected", "true");
  });

  it("a test account says so, and nothing about seeing everything", async () => {
    await openCommercial({ role: "admin", isTestAccount: true });
    await expect.element(page.getByText("Cuenta de prueba")).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Ver todo" })).not.toBeInTheDocument();
  });

  it("the number of what is new goes on the list", async () => {
    await openCommercial({
      role: "hunter",
      tables: {
        gestiones: () =>
          jsonResponse([
            {
              serie_id: "s",
              empresa: "X",
              origen: "derivada",
              creada_por: "o1",
              hunter_id: ME,
              dueno_id: "o1",
              visto_hunter: false,
              visto_dueno: true,
            },
          ]),
      },
    });
    await expect.element(tab("Mis gestiones")).toHaveTextContent("Mis gestiones1");
  });
});

describe("the administrator", () => {
  it("sees theirs by default, and everything on asking, and it is remembered", async () => {
    const { harness } = await openList({ role: "admin", list: [ONE] });
    const asked = () =>
      harness.network.to("/rest/v1/rpc/gestiones_lista").map(({ body }) => fieldsOf(body));
    await vi.waitFor(() => {
      expect(asked().at(-1)).toMatchObject({ p_solo_mio: true, p_limit: 500 });
    });
    await expect.element(page.getByText("Viendo: lo tuyo")).toBeVisible();

    await page.getByRole("button", { name: "Ver todo" }).click();

    await vi.waitFor(() => {
      expect(asked().at(-1)).toMatchObject({ p_solo_mio: false });
    });
    await expect.element(page.getByText("Viendo: todo el equipo")).toBeVisible();
    expect(localStorage.getItem("fg_ges_vertodo")).toBe("1");

    await page.getByRole("button", { name: "Sólo lo mío" }).click();
    expect(localStorage.getItem("fg_ges_vertodo")).toBe("0");
  });

  it("the late answer of what it saw before does not step on what it asked for", async () => {
    const late = deferred<Response>();
    await openList({
      role: "admin",
      list: (request) =>
        Reflect.get(fieldsOf(request.body), "p_solo_mio") === true
          ? late.promise
          : jsonResponse([{ ...ONE, empresa: "DE TODOS SA" }]),
    });
    await page.getByRole("button", { name: "Ver todo" }).click();
    await expect.element(row("DE TODOS SA")).toBeVisible();

    late.resolve(jsonResponse([{ ...ONE, empresa: "MIA SA" }]));

    await expect.element(row("DE TODOS SA")).toBeVisible();
    await expect.element(row("MIA SA")).not.toBeInTheDocument();
  });

  it("does not offer it on the agenda", async () => {
    await openCommercial({ role: "admin" });
    await expect.element(page.getByRole("button", { name: "Ver todo" })).toBeVisible();
    await tab("Agenda").click();
    await expect.element(page.getByRole("button", { name: "Ver todo" })).not.toBeInTheDocument();
  });

  it("starts from what is remembered", async () => {
    localStorage.setItem("fg_ges_vertodo", "1");
    await openCommercial({ role: "admin" });
    await expect.element(page.getByText("Viendo: todo el equipo")).toBeVisible();
  });
});

describe("the list", () => {
  it("a failure says so and offers to try again: it is not an empty list", async () => {
    let cut = true;
    await openList({
      list: (request) => (cut ? FAILS(request) : jsonResponse([ONE])),
    });
    await expect
      .element(page.getByTestId("commercial-problem"))
      .toMatchTextContent(/No se pudo cargar/);
    await expect.element(page.getByText(/Todavía no hay gestiones/)).not.toBeInTheDocument();

    cut = false;
    await page.getByRole("button", { name: "Reintentar" }).click();

    await expect.element(row("ALIMENTOS SA")).toBeVisible();
  });

  it("a cut in the network too", async () => {
    await openList({ list: CUT });
    await expect.element(page.getByRole("button", { name: "Reintentar" })).toBeVisible();
  });

  it("empty, each one reads where to start", async () => {
    await openList({ list: [] });
    await expect.element(list()).toMatchTextContent(/Derivá una acción desde/);
  });

  it("empty, a hunter reads their way", async () => {
    await openList({ role: "hunter", list: [] });
    await expect.element(list()).toMatchTextContent(/Buscá una empresa en/);
  });

  it("a filter with nothing says so", async () => {
    await openList({ list: [ONE] });
    await page.getByPlaceholder("Buscar empresa, CUIT o persona").fill("zzz");
    await expect.element(list()).toHaveTextContent("Nada coincide con el filtro.");
  });

  it('"Limpiar filtros" comes with a filter and goes away, without touching the search', async () => {
    await openList({ list: [ONE] });
    await expect.element(clear()).not.toBeInTheDocument();
    const search = page.getByPlaceholder("Buscar empresa, CUIT o persona");
    await search.fill("ALI");
    await expect.element(clear()).toBeVisible();
    await expect.element(search).toHaveValue("ALI");

    await clear().click();

    await expect.element(clear()).not.toBeInTheDocument();
    await expect.element(search).toHaveValue("");
  });

  it("the filters last when going to another solapa and back", async () => {
    await openList({ list: [ONE] });
    await page.getByLabelText("Filtrar por tipo de acción").selectOptions("feria");
    await tab("Mis empresas").click();
    await tab("Gestiones").click();
    await expect.element(page.getByLabelText("Filtrar por tipo de acción")).toHaveValue("feria");
  });

  it("filters by hunter, or by what is nobody's", async () => {
    await openList({
      list: [
        ONE,
        aListedAction({ id: "b", empresa: "SIN HUNTER SA", hunter_id: null, lider_id: "l1" }),
      ],
    });
    await page.getByLabelText("Filtrar por hunter").selectOptions("__sin");
    await expect.element(row("SIN HUNTER SA")).toBeVisible();
    await expect.element(row("ALIMENTOS SA")).not.toBeInTheDocument();
    await expect.element(row("SIN HUNTER SA")).toMatchTextContent(/por asignar \(Laura Méndez\)/);
  });

  it("a hunter has no filter of hunters, and goes to register from their screen", async () => {
    const goToTab = vi.fn<(tabId: string) => void>();
    await openList({ role: "hunter", list: [ONE] }, { goToTab });
    await expect.element(list()).toBeVisible();
    await expect.element(page.getByLabelText("Filtrar por hunter")).not.toBeInTheDocument();

    await page.getByRole("button", { name: "+ Registrar desde Buscar flyer" }).click();

    expect(goToTab).toHaveBeenCalledWith("hunter");
  });

  it("with nobody to filter by, the field is not there", async () => {
    await openList({ list: [{ ...ONE, hunter_id: null }], personsOfTeam: [] });
    await expect.element(rows().first()).toBeVisible();
    await expect.element(page.getByLabelText("Filtrar por hunter")).not.toBeInTheDocument();
  });

  it("filters by dates and by state", async () => {
    await openList({
      list: [
        aListedAction({ id: "x", empresa: "VIEJA SA", fecha: "2026-01-01" }),
        aListedAction({ id: "y", empresa: "NUEVA SA", fecha: "2026-12-01", estado: "realizada" }),
      ],
    });
    await page.getByLabelText("Desde", { exact: true }).fill("2026-06-01");
    await expect.element(row("VIEJA SA")).not.toBeInTheDocument();
    await page.getByLabelText("Desde", { exact: true }).fill("");
    await page.getByLabelText("Hasta", { exact: true }).fill("2026-06-01");
    await expect.element(row("NUEVA SA")).not.toBeInTheDocument();
    await page.getByLabelText("Hasta", { exact: true }).fill("");
    await page.getByLabelText("Filtrar por estado").selectOptions("realizada");
    await expect.element(row("VIEJA SA")).not.toBeInTheDocument();
    await expect.element(row("NUEVA SA")).toBeVisible();
  });

  it("paints 300 and says so", async () => {
    const many = Array.from({ length: 305 }, (_, index) =>
      aListedAction({ id: `r${String(index)}`, empresa: `EMPRESA ${String(index)}` }),
    );
    await openList({ list: many });
    await expect.element(page.getByText(/Se muestran las 300 más recientes/)).toBeVisible();
    expect(rows().all()).toHaveLength(300);
  });

  it("writes text of others as text", async () => {
    await openList({
      list: [{ ...ONE, empresa: '<img src=x onerror="alert(1)">', nota: "<b>nota</b>" }],
    });
    await expect.element(rows().first()).toMatchTextContent('<img src=x onerror="alert(1)">');
    expect(document.querySelector('[data-testid="action-row"] img')).toBeNull();
  });

  it("each person reads what the action is to them", async () => {
    await openList({
      role: "hunter",
      list: [
        aListedAction({ id: "own", empresa: "PROPIA SA", origen: "propia", dueno_id: ME }),
        aListedAction({ id: "their", empresa: "AJENA SA", origen: "propia", dueno_id: "o1" }),
        aListedAction({ id: "fwd", empresa: "DERIVADA SA", creada_por: "o1" }),
      ],
    });
    await expect.element(row("PROPIA SA")).toMatchTextContent(/Tu empresa/);
    await expect.element(row("AJENA SA")).toMatchTextContent(/Empresa de Mariana Costa/);
    await expect.element(row("DERIVADA SA")).toMatchTextContent(/Te la derivó Mariana Costa/);
  });

  it("an officer reads hunter and officer", async () => {
    await openList({ list: [aListedAction({ empresa: "X SA" })] });
    await expect
      .element(row("X SA"))
      .toMatchTextContent(/Hunter: Sofía Paz · Oficial: Mariana Costa/);
  });

  it("counts what a done action and a data list had", async () => {
    await openList({
      list: [
        aListedAction({ id: "d", empresa: "HECHA SA", estado: "realizada", n_pros: 4, n_altas: 1 }),
        aListedAction({ id: "h", empresa: "DOS SA", estado: "realizada", n_pros: 4, n_altas: 2 }),
        aListedAction({
          id: "b",
          empresa: "BASE SA",
          tipo: "datos",
          n_pros: 3,
          n_datos: 15,
          n_altas: 2,
          prueba: true,
        }),
      ],
    });
    await expect.element(row("HECHA SA")).toMatchTextContent(/4 prospectos · 1 alta · 25%/);
    await expect.element(row("DOS SA")).toMatchTextContent(/2 altas · 50%/);
    await expect.element(row("BASE SA")).toMatchTextContent(/3 de 15 contactados · 2 altas/);
    await expect.element(row("BASE SA")).toMatchTextContent(/prueba/);
  });

  it("says the state of each one", async () => {
    await openList({
      list: [
        aListedAction({ id: "1", empresa: "P SA", hunter_id: null }),
        aListedAction({ id: "2", empresa: "Q SA", estado: "cancelada" }),
        aListedAction({ id: "3", empresa: "R SA", estado: "realizada" }),
        aListedAction({ id: "4", empresa: "S SA", tipo: "datos", vence: "2026-12-01" }),
        aListedAction({ id: "5", empresa: "T SA", tipo: "datos", estado: "cancelada" }),
        aListedAction({ id: "6", empresa: "U SA", tipo: "datos", estado: "realizada" }),
        aListedAction({ id: "7", empresa: "V SA", tipo: "datos", hunter_id: null }),
      ],
    });
    await expect.element(row("P SA")).toMatchTextContent(/Por asignar · 10 nov/);
    await expect.element(row("Q SA")).toMatchTextContent(/Cancelada/);
    await expect.element(row("R SA")).toMatchTextContent(/Realizada/);
    await expect.element(row("S SA")).toMatchTextContent(/En curso · hasta el 1 dic/);
    await expect.element(row("T SA")).toMatchTextContent(/Cancelada/);
    await expect.element(row("U SA")).toMatchTextContent(/Terminada/);
    await expect.element(row("V SA")).toMatchTextContent(/Por asignar/);
  });
});

describe("what asks for attention", () => {
  const MARKED = [
    aListedAction({
      id: "n",
      empresa: "NUEVA SA",
      hunter_id: ME,
      visto_hunter: false,
      nota: "Ojo",
    }),
    aListedAction({ id: "o", empresa: "SIN NOTA SA", hunter_id: ME, visto_hunter: false }),
    aListedAction({ id: "d", empresa: "DUENA SA", dueno_id: ME, visto_dueno: false }),
    aListedAction({
      id: "r",
      empresa: "REGISTRADA SA",
      dueno_id: ME,
      visto_dueno: false,
      origen: "propia",
    }),
    aListedAction({ id: "m", empresa: "MENSAJE SA" }),
    aListedAction({ id: "p", empresa: "DOS MENSAJES SA" }),
    aListedAction({
      id: "c",
      empresa: "SU AVISO SA",
      no_puede_at: "2026-11-01",
      no_puede_motivo: "x",
    }),
    aListedAction({ id: "y", empresa: "MI AVISO SA", hunter_id: ME, no_puede_at: "2026-11-01" }),
  ];
  const UNREAD = [
    { gestion_id: "m", n: 1 },
    { gestion_id: "p", n: 2 },
  ];

  it("says why", async () => {
    await openList({ list: MARKED, unread: UNREAD });
    await expect.element(row("NUEVA SA")).toMatchTextContent(/Nueva: Ojo/);
    await expect.element(row("NUEVA SA")).toHaveAttribute("data-flagged", "true");
    await expect.element(row("SIN NOTA SA")).toMatchTextContent(/Nueva$/);
    await expect.element(row("DUENA SA")).toMatchTextContent(/Novedad: Sofía Paz la completó/);
    await expect.element(row("REGISTRADA SA")).toMatchTextContent(/registró esta acción/);
    await expect.element(row("MENSAJE SA")).toMatchTextContent(/1 mensaje nuevo/);
    await expect.element(row("DOS MENSAJES SA")).toMatchTextContent(/2 mensajes nuevos/);
    await expect.element(row("SU AVISO SA")).toMatchTextContent(/Pidió que se la pasen a otro/);
    await expect.element(row("MI AVISO SA")).toMatchTextContent(/Avisaste que no podés/);
    await expect.element(row("SU AVISO SA")).toHaveAttribute("data-flagged", "false");
  });

  it("if the messages cannot be read, there are no chips, and the list is there", async () => {
    await openList({ list: [aListedAction({ id: "m", empresa: "M SA" })], unread: FAILS });
    await expect.element(row("M SA")).toBeVisible();
    await expect.element(row("M SA")).not.toMatchTextContent(/mensaje/);
  });

  it('"Marcar todas como leídas" only comes with something marked, and takes every mark away', async () => {
    const { harness } = await openList({ list: MARKED.slice(0, 1), unread: UNREAD.slice(0, 1) });
    await expect.element(markAll()).toHaveTextContent("Marcar todas como leídas (1)");

    await markAll().click();

    await expect.element(markAll()).not.toBeInTheDocument();
    await expect.element(notice()).toHaveTextContent("Listo: no queda ninguna marcada.");
    await expect.element(row("NUEVA SA")).toHaveAttribute("data-flagged", "false");
    expect(harness.network.to("/rest/v1/rpc/gestiones_marcar_todas_leidas")).toHaveLength(1);
  });

  it("the messages also stop being marked, even if the cloud has not said it yet", async () => {
    await openList({ list: [aListedAction({ id: "m", empresa: "MENSAJE SA" })], unread: UNREAD });
    await expect.element(row("MENSAJE SA")).toHaveAttribute("data-flagged", "true");

    await markAll().click();

    await expect.element(row("MENSAJE SA")).toHaveAttribute("data-flagged", "false");
    await expect.element(row("MENSAJE SA")).not.toMatchTextContent(/mensaje nuevo/);
  });

  it("if marking them fails, they stay, and it says so", async () => {
    await openList({
      list: MARKED.slice(0, 1),
      functions_: { gestiones_marcar_todas_leidas: FAILS },
    });
    await markAll().click();
    await expect.element(notice()).toMatchTextContent(/No se pudo: falla simulada/);
    await expect.element(markAll()).toBeVisible();
  });
});

describe("the names of the team", () => {
  it("if they cannot be read it says so, and does not say that somebody left", async () => {
    let cut = true;
    await openList({
      list: [ONE],
      functions_: {
        gestiones_personas: (request) =>
          cut ? FAILS(request) : jsonResponse([{ id: "h1", nombre: "Sofía Paz", rol: "hunter" }]),
      },
    });
    await expect.element(page.getByTestId("people-problem")).toBeVisible();
    await expect.element(row("ALIMENTOS SA")).not.toMatchTextContent(/dado de baja/);

    cut = false;
    await page.getByTestId("people-problem").getByRole("button", { name: "Reintentar" }).click();

    await expect.element(page.getByTestId("people-problem")).not.toBeInTheDocument();
    await expect.element(row("ALIMENTOS SA")).toMatchTextContent(/Sofía Paz/);
  });
});

describe("the tab keeps up with what is new", () => {
  it("when the number changes, the list is read again", async () => {
    let waiting: readonly object[] = [];
    const { harness, show } = await openList({
      list: [ONE],
      tables: { gestiones: () => jsonResponse(waiting) },
    });
    await expect.element(row("ALIMENTOS SA")).toBeVisible();
    const reads = () => harness.network.to("/rest/v1/rpc/gestiones_lista").length;
    const before = reads();
    waiting = [
      {
        serie_id: "s",
        empresa: "X",
        origen: "derivada",
        creada_por: "o1",
        hunter_id: ME,
        dueno_id: "o1",
        visto_hunter: false,
        visto_dueno: true,
      },
    ];
    void harness.queryClient.invalidateQueries({ queryKey: ["commercial-actions", "notices"] });
    await vi.waitFor(() => {
      expect(reads()).toBeGreaterThan(before);
    });
    await show(true);
  });
});
