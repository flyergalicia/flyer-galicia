import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { Promotion } from "@/shared/domain/promotions/index.ts";
import { useSetIncludeModo } from "@/shared/lib/promotions/include-modo-context.ts";
import {
  type PromotionPicking,
  PromotionPickingContext,
} from "@/shared/lib/promotions/promotion-picking.ts";
import { type AppAnswers, ADVISOR, createAppHarness } from "@/shared/lib/testing/app-harness.tsx";
import "@/shared/lib/test-probe.ts";
import { useSession } from "@/shared/session/index.ts";
import { type Answer, deferred, jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import { usePromotionsActions, usePromotionsState } from "../model/promotions-context.ts";
import { PromotionsView } from "./PromotionsView.tsx";

const ADMIN = { ...ADVISOR, role: "admin", full_name: "Admin Inventado" };
const LOCATIONS = [
  { nombre: "MENDOZA", localidades: ["LUJAN", "GODOY CRUZ"] },
  { nombre: "NEUQUEN", localidades: [] },
  { nombre: "CORDOBA", localidades: [] },
  { nombre: "SALTA", localidades: [] },
];

let nextId = 100;

function promotion(titulo: string, fields: Partial<Promotion> = {}): Promotion {
  nextId += 1;
  return {
    id: nextId,
    titulo,
    subtitulo: "Indumentaria",
    imagen: "logo.png",
    fecha_hasta: "2099-12-31",
    tipo_promocion: "Marca",
    provincias: ["MENDOZA"],
    primera_vez: "2020-01-01",
    proximamente: false,
    fecha_desde: null,
    dias: null,
    beneficio: "10% de ahorro",
    ...fields,
  };
}

interface Cloud extends AppAnswers {
  readonly catalog?: readonly Promotion[] | Answer;
  readonly modo?: readonly Record<string, unknown>[] | Answer;
  readonly meta?: Record<string, unknown> | null;
  readonly edge?: Answer;
}

function asAnswer(rows: readonly unknown[] | Answer): Answer {
  return typeof rows === "function" ? rows : () => jsonResponse(rows);
}

function ReadsState() {
  usePromotionsState();
  return null;
}

function ReadsActions() {
  usePromotionsActions();
  return null;
}

const PICKING: PromotionPicking = {
  firstCell: ({ promotion: found, status }) =>
    found?.imagen ? (
      <button type="button" data-status={status}>
        Agregar {found.titulo}
      </button>
    ) : null,
};

function Outside() {
  const set = useSetIncludeModo();
  return (
    <button
      type="button"
      onClick={() => {
        set(false);
      }}
    >
      Desde otra pantalla
    </button>
  );
}

function InsideOnly({ isActive = true }: { readonly isActive?: boolean }) {
  const session = useSession();
  return session.status === "signed-in" ? (
    <PromotionsView isActive={isActive} tabId="promos" />
  ) : null;
}

async function open(cloud: Cloud = {}) {
  const { catalog = [], modo = [], meta, edge, ...rest } = cloud;
  const answers: AppAnswers = {
    ...rest,
    tables: {
      promos_galicia_cache: asAnswer(catalog),
      promos_modo_cache: asAnswer(modo),
      promos_galicia_meta: () =>
        jsonResponse(
          meta === undefined
            ? {
                last_sync_at: "2026-10-30T12:00:00Z",
                total: typeof catalog === "function" ? 0 : catalog.length,
                ubicaciones: LOCATIONS,
              }
            : meta,
        ),
    },
    functions: { "promos-galicia": edge ?? (() => jsonResponse({ data: {} })) },
  };
  const harness = createAppHarness(answers);
  harness.storeSession();
  const screen = await render(harness.wrap(<InsideOnly />));
  await expect.element(screen.getByText("Buscador de Promociones")).toBeVisible();
  return { screen, harness };
}

type Screen = Awaited<ReturnType<typeof open>>["screen"];
type Harness = Awaited<ReturnType<typeof open>>["harness"];

const bodies = (harness: Harness) =>
  harness.network.to("/functions/v1/promos-galicia").map(({ body }) => body);

const notice = (screen: Screen) => screen.getByRole("status");

async function waitForCatalog(screen: Screen) {
  await expect
    .element(screen.getByTestId("promotions-catalog-status"))
    .not.toHaveTextContent("Cargando estado del catálogo...");
}

async function validate(screen: Screen, pasted: readonly string[]) {
  await waitForCatalog(screen);
  await screen.getByTestId("promotions-brands").fill(pasted.join("\n"));
  await screen.getByTestId("promotions-validate").click();
}

async function chooseProvince(screen: Screen, province: string) {
  const select = screen.getByTestId("promotions-province");
  await vi.waitFor(() => {
    expect([...select.element().querySelectorAll("option")].map(({ value }) => value)).toContain(
      province,
    );
  });
  await select.selectOptions(province);
}

async function listActive(screen: Screen, province = "MENDOZA") {
  await waitForCatalog(screen);
  await screen.getByRole("tab", { name: "Activas" }).click();
  await chooseProvince(screen, province);
  await screen.getByTestId("promotions-list").click();
}

const tableRows = (screen: Screen) =>
  [...screen.getByTestId("promotions-results").element().querySelectorAll("tbody tr")].filter(
    (row) => row.querySelector('[data-part="promotion"]'),
  );

function textOf(row: Element | undefined, part: string): string {
  return row?.querySelector(`[data-part="${part}"]`)?.textContent.trim() ?? "";
}

function rowAt(screen: Screen, position: number): Element {
  const row = tableRows(screen)[position];
  if (!row) throw new Error(`There is no row ${String(position)}`);
  return row;
}

function idsAsked(body: unknown): number[] {
  const ids: unknown = typeof body === "object" && body !== null ? Reflect.get(body, "ids") : [];
  return Array.isArray(ids) ? ids.filter((id) => typeof id === "number") : [];
}

function fileAddress(input: RequestInfo | URL): string {
  return input instanceof Request ? input.url : input.toString();
}

const titles = (screen: Screen) => tableRows(screen).map((row) => textOf(row, "title"));

beforeEach(async () => {
  localStorage.clear();
  // A computer: on a phone the heads of the table hide.
  await page.viewport(1366, 800);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("choosing brands for a flyer", () => {
  it("the first column is of the one that is choosing; what cannot be chosen keeps its tick", async () => {
    const harness = createAppHarness({
      tables: {
        promos_galicia_cache: () =>
          jsonResponse([promotion("Alfa"), promotion("Sin Logo", { imagen: "" })]),
        promos_modo_cache: () => jsonResponse([]),
        promos_galicia_meta: () =>
          jsonResponse({ last_sync_at: null, total: 2, ubicaciones: LOCATIONS }),
      },
    });
    harness.storeSession();
    const screen = await render(
      harness.wrap(
        <PromotionPickingContext.Provider value={PICKING}>
          <InsideOnly />
        </PromotionPickingContext.Provider>,
      ),
    );

    await validate(screen, ["Alfa", "Sin Logo"]);

    await expect.element(screen.getByRole("button", { name: "Agregar Alfa" })).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "Excluir del reporte" }).elements()).toHaveLength(
      1,
    );
    await expect
      .element(screen.getByRole("button", { name: "Agregar Alfa" }))
      .toHaveAttribute("data-status", "VIGENTE");
  });
});

describe("the contexts of the screen", () => {
  it("need their provider", async () => {
    await expect(render(<ReadsState />)).rejects.toThrow(/PromotionsProvider/);
    await expect(render(<ReadsActions />)).rejects.toThrow(/PromotionsProvider/);
  });
});

describe("Buscar", () => {
  it("says what is happening with each pasted brand", async () => {
    const { screen } = await open({
      catalog: [
        promotion("SushiClub"),
        promotion("Vencida SA", { fecha_hasta: "2020-01-01" }),
        promotion("Este Mes", { fecha_hasta: new Date().toISOString().slice(0, 10) }),
      ],
    });

    await validate(screen, ["Sushi Club", "Vencida SA", "Este Mes", "No Existe"]);

    await vi.waitFor(() => {
      expect(tableRows(screen)).toHaveLength(4);
    });
    const rows = tableRows(screen);
    expect(rows.map((row) => textOf(row, "brand"))).toEqual([
      "Sushi Club",
      "Vencida SA",
      "Este Mes",
      "No Existe",
    ]);
    expect(rows.map((row) => textOf(row, "status"))).toEqual([
      "Vigente",
      "Vencida",
      "Vence este mes",
      "No encontrada",
    ]);
    await expect
      .element(notice(screen))
      .toMatchTextContent(/1 sin coincidencia: No Existe\. Si es una promo nueva de hoy/);
    const counters = screen.getByTestId("status-counter");
    expect(counters.elements().map(({ textContent }) => textContent)).toEqual([
      "No encontrada: 1",
      "Vencida: 1",
      "Vence este mes: 1",
      "Revisar: 0",
      "Vigente: 1",
    ]);
  });

  it("asks for at least one brand", async () => {
    const { screen } = await open({ catalog: [promotion("Alfa")] });
    await validate(screen, ["  "]);
    await expect.element(notice(screen)).toHaveTextContent("Pegá al menos una marca");
  });

  it("brings the other promotions of the brand, the best first, and one row per brand joins them", async () => {
    const { screen, harness } = await open({
      catalog: [
        promotion("Coto", { fecha_hasta: "2099-01-01", beneficio: "25% de ahorro" }),
        promotion("Coto", { fecha_hasta: "2099-06-01", beneficio: "12 cuotas" }),
        promotion("Farmacity"),
      ],
      edge: () => jsonResponse({ data: {} }),
    });

    await validate(screen, ["Coto", "Farmacity"]);
    await vi.waitFor(() => {
      expect(tableRows(screen).map((row) => textOf(row, "benefit"))).toEqual([
        "12 cuotas",
        "25% de ahorro",
        "10% de ahorro",
      ]);
    });
    await vi.waitFor(() => {
      expect(bodies(harness)).toHaveLength(1);
    });
    expect(bodies(harness)[0]).toMatchObject({ action: "detalle" });

    await screen.getByRole("checkbox", { name: "Una sola fila por marca" }).click();

    await vi.waitFor(() => {
      expect(tableRows(screen).map((row) => textOf(row, "brand"))).toEqual(["Coto", "Farmacity"]);
    });
    await expect.element(screen.getByText("+1", { exact: true })).toBeVisible();
    expect(screen.getByText("+1").element().getAttribute("title")).toMatch(
      /Esta marca tiene 2 promociones vigentes/,
    );
    await expect.element(screen.getByText("Mostrando 2 de 3")).toBeVisible();
  });

  it("a row to review offers the candidates; choosing brings that brand, none takes it away", async () => {
    const { screen, harness } = await open({
      catalog: [
        promotion("Ambigua Sur", { beneficio: "10% sur" }),
        promotion("Ambigua Norte", { beneficio: "20% norte" }),
        promotion("Ambigua Norte", { beneficio: "30% norte" }),
      ],
      edge: ({ body }) =>
        jsonResponse({
          data: Object.fromEntries(idsAsked(body).map((id) => [id, "2026-01-02"])),
        }),
    });

    await validate(screen, ["Ambigua"]);

    const match = screen.getByRole("combobox", { name: "Coincidencia de Ambigua" });
    await expect.element(match).toBeVisible();
    await expect.element(notice(screen)).toMatchTextContent(/1 para revisar: Ambigua → ¿/);
    expect(textOf(rowAt(screen, 0), "status")).toBe("Revisar");

    await match.selectOptions("Ambigua Norte");
    await vi.waitFor(() => {
      expect(
        tableRows(screen)
          .map((row) => textOf(row, "benefit"))
          .toSorted(),
      ).toEqual(["20% norte", "30% norte"]);
    });
    await expect.element(screen.getByText("02/01/2026").first()).toBeVisible();
    await expect.element(match).not.toBeInTheDocument();
    expect(bodies(harness).length).toBeGreaterThan(0);
  });

  it("choosing none leaves it as not found, with what to choose from", async () => {
    const { screen } = await open({
      catalog: [promotion("Ambigua Sur"), promotion("Ambigua Norte")],
    });
    await validate(screen, ["Ambigua"]);
    const match = screen.getByRole("combobox", { name: "Coincidencia de Ambigua" });

    await match.selectOptions("-1");

    await vi.waitFor(() => {
      expect(textOf(rowAt(screen, 0), "status")).toBe("No encontrada");
    });
    await expect.element(match).toBeVisible();
    expect(screen.getByTestId("promotions-results").element().querySelector("img")).toBeNull();
  });

  it("another province changes the verdict without searching again", async () => {
    const { screen } = await open({
      catalog: [promotion("Alfa"), promotion("Beta", { provincias: [] })],
    });
    await validate(screen, ["Alfa", "Beta"]);
    await chooseProvince(screen, "NEUQUEN");

    await vi.waitFor(() => {
      expect(tableRows(screen).map((row) => textOf(row, "status"))).toEqual([
        "Fuera de la provincia",
        "Vigente",
      ]);
    });
    await expect
      .element(screen.getByRole("button", { name: "Fuera de la provincia: 1" }))
      .toBeVisible();
  });

  it("validates a month, not today", async () => {
    const { screen } = await open({
      catalog: [promotion("Alfa", { fecha_hasta: "2020-03-31" })],
    });
    await validate(screen, ["Alfa"]);
    await vi.waitFor(() => {
      expect(textOf(rowAt(screen, 0), "status")).toBe("Vencida");
    });
    const month = screen.getByLabelText("Mes a validar");

    await month.fill("2020-03");
    await screen.getByTestId("promotions-validate").click();
    await vi.waitFor(() => {
      expect(textOf(rowAt(screen, 0), "status")).toBe("Vence este mes");
    });

    await month.fill("");
    await screen.getByTestId("promotions-validate").click();
    await vi.waitFor(() => {
      expect(textOf(rowAt(screen, 0), "status")).toBe("Vencida");
    });
  });
});

describe("the catalog", () => {
  it("says how old it is, and how much comes from MODO", async () => {
    const { screen } = await open({
      catalog: [promotion("Alfa")],
      modo: [
        {
          id: "a",
          titulo: "Solo Modo",
          beneficio: "5%",
          fecha_hasta: "2099-01-01",
          provincias: [],
        },
      ],
    });
    await expect
      .element(screen.getByTestId("promotions-catalog-status"))
      .toMatchTextContent(
        /Catálogo actualizado: .* 1 promociones de Galicia y 1 de MODO que no están en Galicia\. Se actualiza solo/,
      );
  });

  it("says when it was never updated, and asks for it by itself, once", async () => {
    const { screen, harness } = await open({
      catalog: [],
      meta: null,
      edge: () => jsonResponse({ data: { total: 0 } }),
    });
    await vi.waitFor(() => {
      expect(bodies(harness)).toEqual([{ action: "sync" }]);
    });
    await expect
      .element(screen.getByTestId("promotions-catalog-status"))
      .toHaveTextContent("Catálogo todavía no sincronizado. Se va a actualizar solo.");
    await vi.waitFor(() => {
      expect(harness.network.to("/rest/v1/promos_galicia_cache").length).toBeGreaterThan(1);
    });
    expect(bodies(harness)).toHaveLength(1);

    await validate(screen, ["Alfa"]);
    await expect
      .element(notice(screen))
      .toMatchTextContent(/El catálogo de promociones está vacío/);
  });

  it("the update by itself that fails speaks only if there is nothing to look at", async () => {
    const { screen } = await open({
      catalog: [],
      meta: null,
      edge: () => jsonResponse({ error: "se cortó" }, 500),
    });
    await expect
      .element(notice(screen))
      .toMatchTextContent(/No se pudo actualizar el catálogo de promociones: se cortó/);
  });

  it("the button says what it does, and what Galicia answered", async () => {
    let reply = { body: { error: "Galicia respondió 403" } as object, status: 403 };
    const { screen } = await open({
      catalog: [promotion("Alfa")],
      edge: () => jsonResponse(reply.body, reply.status),
    });
    await waitForCatalog(screen);
    const update = screen.getByTestId("promotions-update-catalog");

    await update.click();
    await expect.element(notice(screen)).toMatchTextContent(/Galicia no dejó actualizar/);

    reply = { body: { error: "se cortó" }, status: 500 };
    await update.click();
    await expect.element(notice(screen)).toMatchTextContent(/No se pudo actualizar.*se cortó/);

    reply = { body: { data: { total: 7 } }, status: 200 };
    await update.click();
    await expect.element(notice(screen)).toHaveTextContent("Catálogo actualizado: 7 promociones");
    await expect.element(update).toBeEnabled();
  });

  it("while it updates, the button says so and cannot be pressed", async () => {
    const answer = deferred<Response>();
    const { screen } = await open({
      catalog: [promotion("Alfa")],
      edge: () => answer.promise,
    });
    await waitForCatalog(screen);
    const update = screen.getByTestId("promotions-update-catalog");
    await update.click();
    await expect.element(update).toHaveTextContent("Actualizando catálogo…");
    await expect.element(update).toBeDisabled();
    answer.resolve(jsonResponse({ data: { total: 1 } }));
    await expect.element(update).toHaveTextContent("Actualizar catálogo ahora");
  });

  it("a catalog that cannot be read says so: it is not empty (invariant 24)", async () => {
    const { screen, harness } = await open({
      catalog: () => jsonResponse({ message: "No hay permiso" }, 403),
      meta: null,
    });
    await expect
      .element(notice(screen))
      .toHaveTextContent("No se pudo leer el catálogo de promociones: No hay permiso");
    expect(bodies(harness)).toEqual([]);

    await validate(screen, ["Alfa"]);
    await vi.waitFor(() => {
      expect(harness.network.to("/rest/v1/promos_galicia_cache").length).toBeGreaterThan(1);
    });
    await expect.element(screen.getByTestId("promotions-validate")).toBeEnabled();
    await expect
      .element(notice(screen))
      .toHaveTextContent("No se pudo leer el catálogo de promociones: No hay permiso");
    await expect.element(screen.getByText(/Pegá las marcas a la izquierda/)).toBeVisible();

    await screen.getByRole("tab", { name: "Activas" }).click();
    await expect.element(screen.getByTestId("promotions-province")).toBeEnabled();
  });

  it("a catalog that is less than the base says it says incomplete", async () => {
    const { screen } = await open({
      catalog: [promotion("Alfa")],
      meta: { last_sync_at: null, total: 3, ubicaciones: null },
    });
    await expect.element(notice(screen)).toMatchTextContent(/llegó incompleto \(1 de 3\)/);
  });

  it("while a first catalog updates, it asks to come back in a moment", async () => {
    const answer = deferred<Response>();
    const { screen } = await open({
      catalog: [],
      meta: null,
      edge: () => answer.promise,
    });
    await expect
      .element(screen.getByTestId("promotions-update-catalog"))
      .toHaveTextContent("Actualizando catálogo…");

    await screen.getByTestId("promotions-brands").fill("Alfa");
    await screen.getByTestId("promotions-validate").click();

    await expect
      .element(notice(screen))
      .toMatchTextContent(/sincronizando por primera vez; volvé a tocar Validar/);

    await screen.getByRole("tab", { name: "Activas" }).click();
    const province = screen.getByTestId("promotions-province");
    expect(province.element()).toBeTruthy();
    answer.resolve(jsonResponse({ data: { total: 0 } }));
  });

  it("validating while it comes waits for it, and cannot be asked twice", async () => {
    const held = deferred<Response>();
    const { screen } = await open({
      catalog: () => held.promise,
      meta: { last_sync_at: null, total: 1, ubicaciones: LOCATIONS },
    });
    await screen.getByTestId("promotions-brands").fill("Alfa");
    const button = screen.getByTestId("promotions-validate");
    await button.click();
    await expect.element(button).toHaveTextContent("Cargando catálogo...");
    await expect.element(button).toBeDisabled();

    held.resolve(jsonResponse([promotion("Alfa")]));

    await vi.waitFor(() => {
      expect(titles(screen)).toEqual(["Alfa"]);
    });
    await expect.element(button).toHaveTextContent("Validar vigencia");
  });

  it("without geography, the province cannot be chosen, and it says why", async () => {
    const { screen } = await open({
      catalog: [promotion("Alfa", { provincias: null })],
      meta: { last_sync_at: null, total: 1, ubicaciones: null },
    });
    await waitForCatalog(screen);
    const province = screen.getByTestId("promotions-province");
    await expect.element(province).toBeDisabled();
    await expect
      .element(province)
      .toMatchTextContent(/Actualizá el catálogo para filtrar por provincia/);
  });

  it("without a master list, the provinces come from the promotions", async () => {
    const { screen } = await open({
      catalog: [promotion("Alfa", { provincias: ["SALTA"] })],
      meta: { last_sync_at: null, total: 1, ubicaciones: null },
    });
    await chooseProvince(screen, "SALTA");
    await expect.element(screen.getByTestId("promotions-province")).toHaveValue("SALTA");
  });
});

describe("Activas", () => {
  it("asks for a province first, and shows what is in it", async () => {
    const { screen } = await open({
      catalog: [
        promotion("Zeta"),
        promotion("Alfa"),
        promotion("Otra", { provincias: ["NEUQUEN"] }),
        promotion("Internet", { provincias: [] }),
      ],
    });
    await waitForCatalog(screen);
    await screen.getByRole("tab", { name: "Activas" }).click();
    await expect.element(screen.getByText(/Elegí una provincia a la izquierda/)).toBeVisible();
    await screen.getByTestId("promotions-list").click();
    await expect
      .element(notice(screen))
      .toHaveTextContent("Elegí una provincia para ver sus promociones");

    await chooseProvince(screen, "MENDOZA");
    await screen.getByTestId("promotions-list").click();

    await vi.waitFor(() => {
      expect(titles(screen)).toEqual(["Alfa", "Internet", "Zeta"]);
    });
    await expect.element(screen.getByText("Online", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("Como vienen")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Marca \(flyer\)/ }).elements()).toHaveLength(
      0,
    );
  });

  it("says when nothing is left", async () => {
    const { screen } = await open({ catalog: [promotion("Otra", { provincias: ["NEUQUEN"] })] });
    await listActive(screen, "MENDOZA");
    await expect
      .element(notice(screen))
      .toHaveTextContent("No hay promociones vigentes con esos filtros.");
  });

  it("the locality is asked to Galicia, and lists what it says", async () => {
    const here = promotion("Aqui");
    const there = promotion("Alla");
    const { screen, harness } = await open({
      catalog: [here, there],
      edge: () => jsonResponse({ data: { ids: [here.id] } }),
    });
    await listActive(screen);
    await vi.waitFor(() => {
      expect(titles(screen)).toEqual(["Alla", "Aqui"]);
    });
    const locality = screen.getByTestId("promotions-locality");
    await expect.element(locality).toMatchTextContent(/Todas las localidades/);

    await locality.selectOptions("LUJAN");

    await vi.waitFor(() => {
      expect(titles(screen)).toEqual(["Aqui"]);
    });
    expect(bodies(harness)).toContainEqual({
      action: "ubicacion",
      provincia: "MENDOZA",
      localidad: "LUJAN",
    });
  });

  it("if Galicia does not answer for the locality, it shows the province and says so", async () => {
    const { screen } = await open({
      catalog: [promotion("Alfa")],
      edge: () => jsonResponse({ error: "se cortó" }, 500),
    });
    await listActive(screen);
    await vi.waitFor(() => {
      expect(titles(screen)).toEqual(["Alfa"]);
    });
    const locality = screen.getByTestId("promotions-locality");

    await locality.selectOptions("LUJAN");

    await expect.element(notice(screen)).toMatchTextContent(/No se pudo filtrar por localidad/);
    await expect.element(locality).toHaveValue("");
    expect(titles(screen)).toEqual(["Alfa"]);
  });

  it("an answer for another locality does not count", async () => {
    const answers: ((reply: Response) => void)[] = [];
    const lujan = promotion("Lujan");
    const godoy = promotion("Godoy");
    const { screen } = await open({
      catalog: [lujan, godoy],
      edge: () =>
        new Promise((resolve) => {
          answers.push(resolve);
        }),
    });
    await listActive(screen);
    await vi.waitFor(() => {
      expect(titles(screen)).toHaveLength(2);
    });
    const locality = screen.getByTestId("promotions-locality");
    await locality.selectOptions("LUJAN");
    await vi.waitFor(() => {
      expect(answers).toHaveLength(1);
    });
    await locality.selectOptions("GODOY CRUZ");
    await vi.waitFor(() => {
      expect(answers).toHaveLength(2);
    });

    answers[0]?.(jsonResponse({ data: { ids: [lujan.id] } }));
    answers[1]?.(jsonResponse({ data: { ids: [godoy.id] } }));
    await vi.waitFor(() => {
      expect(answers.length).toBeGreaterThanOrEqual(3);
    });
    for (const finish of answers.slice(2)) finish(jsonResponse({ data: { ids: [godoy.id] } }));

    await vi.waitFor(() => {
      expect(titles(screen)).toEqual(["Godoy"]);
    });
  });

  it("the category filters what is asked, and the list keeps following", async () => {
    const { screen } = await open({
      catalog: [promotion("Alfa"), promotion("Super", { subtitulo: "Supermercados" })],
    });
    await listActive(screen);
    await vi.waitFor(() => {
      expect(titles(screen)).toHaveLength(2);
    });
    const category = screen.getByRole("combobox").filter({ hasText: "Todos los rubros" });

    await category.selectOptions("Supermercados");

    await vi.waitFor(() => {
      expect(titles(screen)).toEqual(["Super"]);
    });
  });

  it("another province makes the list again; none says to choose one", async () => {
    const { screen } = await open({
      catalog: [promotion("Alfa"), promotion("Beta", { provincias: ["NEUQUEN"] })],
    });
    await listActive(screen);
    await vi.waitFor(() => {
      expect(titles(screen)).toEqual(["Alfa"]);
    });

    await chooseProvince(screen, "NEUQUEN");
    await vi.waitFor(() => {
      expect(titles(screen)).toEqual(["Beta"]);
    });

    await chooseProvince(screen, "");
    await expect
      .element(notice(screen))
      .toHaveTextContent("Elegí una provincia para ver sus promociones");
    expect(titles(screen)).toEqual(["Beta"]);
  });

  it("the locality says why it cannot be chosen", async () => {
    const { screen } = await open({ catalog: [promotion("Alfa")] });
    await waitForCatalog(screen);
    await screen.getByRole("tab", { name: "Activas" }).click();
    const locality = screen.getByTestId("promotions-locality");
    await expect.element(locality).toMatchTextContent(/Elegí una provincia primero/);
    await expect.element(locality).toBeDisabled();

    await chooseProvince(screen, "MENDOZA");
    await expect.element(locality).toBeEnabled();

    const province = screen.getByTestId("promotions-province");
    await province.click();
    document
      .querySelector('[data-value="NEUQUEN"]')
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true }));
    await expect.element(locality).toMatchTextContent(/Con varias provincias, sin localidad/);
    await expect.element(locality).toBeDisabled();
  });

  it("the date of start is asked for what is showing, in batches of 80", async () => {
    const catalog = Array.from({ length: 90 }, (_, at) => promotion(`Marca ${String(at + 100)}`));
    const { screen, harness } = await open({
      catalog,
      edge: ({ body }) =>
        jsonResponse({
          data: Object.fromEntries(idsAsked(body).map((id) => [id, "2026-05-06"])),
        }),
    });
    await listActive(screen);
    const fill = screen.getByRole("button", { name: /Completar fechas "Desde" \(90\)/ });

    await fill.click();

    await vi.waitFor(() => {
      expect(bodies(harness)).toHaveLength(2);
    });
    await expect.element(fill).not.toBeInTheDocument();
    await expect.element(screen.getByText("06/05/2026").first()).toBeVisible();
  });

  it("many dates of start need a yes first, and too many are refused", async () => {
    const catalog = Array.from({ length: 200 }, (_, at) => promotion(`Marca ${String(at + 1000)}`));
    const { screen, harness } = await open({ catalog });
    await listActive(screen);
    await screen.getByRole("button", { name: /Completar fechas/ }).click();
    const question = screen.getByRole("alertdialog", { name: "¿Traemos las fechas de inicio?" });
    await expect.element(question).toMatchTextContent(/consultarle a Galicia 200 promociones/);
    await screen.getByRole("button", { name: "Cancelar" }).click();
    expect(bodies(harness)).toEqual([]);

    await screen.getByRole("button", { name: /Completar fechas/ }).click();
    await screen.getByRole("button", { name: "Confirmar" }).click();
    await vi.waitFor(() => {
      expect(bodies(harness)).toHaveLength(3);
    });
  });

  it("over the limit it asks to filter", async () => {
    const catalog = Array.from({ length: 401 }, (_, at) => promotion(`Marca ${String(at + 1000)}`));
    const { screen } = await open({ catalog });
    await listActive(screen);
    await screen.getByRole("button", { name: /Completar fechas/ }).click();
    await expect.element(notice(screen)).toMatchTextContent(/Son 401 promociones.*máximo 400/);
  });

  it("a date that cannot be asked says so", async () => {
    const { screen } = await open({
      catalog: [promotion("Alfa")],
      edge: () => jsonResponse({ error: "se cortó" }, 500),
    });
    await listActive(screen);
    await screen.getByRole("button", { name: /Completar fechas/ }).click();
    await expect.element(notice(screen)).toMatchTextContent(/No se pudo traer la fecha "Desde"/);
  });
});

describe("Activas with a catalog that is not there", () => {
  it("empty, it says to update it", async () => {
    const { screen } = await open({
      catalog: [],
      meta: { last_sync_at: "2026-10-30T12:00:00Z", total: 0, ubicaciones: LOCATIONS },
      edge: () => jsonResponse({ data: { total: 0 } }),
    });
    await listActive(screen);
    await expect
      .element(notice(screen))
      .toMatchTextContent(
        /El catálogo de promociones está vacío\. Tocá "Actualizar catálogo ahora"\./,
      );
  });

  it("updating for the first time, it asks to come back in a moment", async () => {
    const answer = deferred<Response>();
    const { screen } = await open({
      catalog: [],
      meta: { last_sync_at: null, total: 0, ubicaciones: LOCATIONS },
      edge: () => answer.promise,
    });
    await listActive(screen);
    await expect
      .element(notice(screen))
      .toMatchTextContent(/sincronizando por primera vez; probá de nuevo/);
    answer.resolve(jsonResponse({ data: { total: 0 } }));
  });

  it("coming, it waits for it and lists", async () => {
    let answers = 0;
    const held = deferred<Response>();
    const { screen } = await open({
      catalog: () => {
        answers += 1;
        return answers === 1 ? jsonResponse([]) : held.promise;
      },
      meta: { last_sync_at: "2026-10-30T12:00:00Z", total: 0, ubicaciones: LOCATIONS },
      edge: () => jsonResponse({ data: { total: 0 } }),
    });
    await listActive(screen);
    const list = screen.getByTestId("promotions-list");
    await expect.element(list).toHaveTextContent("Cargando catálogo...");
    await expect.element(list).toBeDisabled();

    held.resolve(jsonResponse([promotion("Alfa")]));

    await vi.waitFor(() => {
      expect(titles(screen)).toEqual(["Alfa"]);
    });
    await expect.element(list).toHaveTextContent("Ver promociones");
  });

  it("that cannot be read, it says only that", async () => {
    const { screen } = await open({
      catalog: () => jsonResponse({ message: "No hay permiso" }, 403),
      meta: { last_sync_at: null, total: 0, ubicaciones: LOCATIONS },
    });
    await listActive(screen);
    await expect.element(screen.getByTestId("promotions-list")).toBeEnabled();
    await expect
      .element(notice(screen))
      .toHaveTextContent("No se pudo leer el catálogo de promociones: No hay permiso");
  });
});

function catalogOfBrands(): Promotion[] {
  return [
    promotion("Adidas", { fecha_hasta: "2099-01-01" }),
    promotion("Adidas MDQ", { fecha_hasta: "2099-06-01" }),
    promotion("Internet", { provincias: [], primera_vez: new Date().toISOString() }),
    promotion("Coto", { subtitulo: "Supermercados", beneficio: "25% de ahorro", dias: "Martes" }),
    promotion("Coto", {
      subtitulo: "Supermercados",
      beneficio: "12 cuotas",
      dias: "Todos los días",
    }),
    promotion("Sin Logo", { imagen: "" }),
  ];
}

describe("the ticks", () => {
  it("online, new, % and one per brand filter what can be seen; clearing takes them off", async () => {
    const { screen } = await open({ catalog: catalogOfBrands() });
    await listActive(screen);
    await vi.waitFor(() => {
      expect(titles(screen)).toHaveLength(6);
    });

    await screen.getByRole("checkbox", { name: "Ocultar las de compra online" }).click();
    expect(titles(screen)).not.toContain("Internet");
    await screen.getByRole("button", { name: /Limpiar filtros/ }).click();
    await expect
      .element(screen.getByRole("checkbox", { name: "Ocultar las de compra online" }))
      .not.toBeChecked();
    expect(titles(screen)).toHaveLength(6);

    await screen.getByRole("checkbox", { name: /Sólo las nuevas/ }).click();
    expect(titles(screen)).toEqual(["Internet"]);
    expect(screen.getByText("Nueva", { exact: true }).element().getAttribute("title")).toMatch(
      /Apareció en el catálogo de Galicia el/,
    );
    await screen.getByRole("checkbox", { name: /Sólo las nuevas/ }).click();

    await screen.getByRole("checkbox", { name: /Sólo súper con %/ }).click();
    expect(tableRows(screen).map((row) => textOf(row, "benefit"))).toEqual(["25% de ahorro"]);
    expect(screen.getByTestId("percent-dot").elements()).toHaveLength(1);
    expect(textOf(rowAt(screen, 0), "days")).toBe("Martes");
    await screen.getByRole("checkbox", { name: /Sólo súper con %/ }).click();

    await screen.getByRole("checkbox", { name: "Una sola fila por marca" }).click();
    expect(titles(screen).filter((title) => title.startsWith("Adidas"))).toEqual(["Adidas MDQ"]);
    expect(titles(screen).filter((title) => title === "Coto")).toHaveLength(1);
    expect(screen.getByText("+1").first().element().getAttribute("title")).toMatch(
      /Se juntaron: Adidas, Adidas MDQ/,
    );
  });

  it("the tick of one row per brand and of the % follow on the other tab", async () => {
    const { screen } = await open({ catalog: catalogOfBrands() });
    await waitForCatalog(screen);
    await screen.getByRole("checkbox", { name: "Una sola fila por marca" }).click();
    await screen.getByRole("checkbox", { name: /Sólo súper con %/ }).click();

    await screen.getByRole("tab", { name: "Activas" }).click();

    await expect
      .element(screen.getByRole("checkbox", { name: "Una sola fila por marca" }))
      .toBeChecked();
    await expect.element(screen.getByRole("checkbox", { name: /Sólo súper con %/ })).toBeChecked();
  });

  it("the table of the other tab goes away, not what was pasted", async () => {
    const { screen } = await open({ catalog: catalogOfBrands() });
    await validate(screen, ["Coto"]);
    await vi.waitFor(() => {
      expect(tableRows(screen).length).toBeGreaterThan(0);
    });
    await screen.getByTestId("promotions-results-search").fill("coto");

    await screen.getByRole("tab", { name: "Activas" }).click();
    expect(tableRows(screen)).toEqual([]);
    await screen.getByRole("tab", { name: "Buscar" }).click();
    await expect.element(screen.getByTestId("promotions-brands")).toHaveValue("Coto");
    expect(
      screen.getByTestId("promotions-results").element().querySelector('input[type="search"]'),
    ).toBeNull();
  });
});

function catalogOfTable(): Promotion[] {
  return [
    promotion("Vigente Uno", {
      subtitulo: "Hogar",
      fecha_hasta: "2099-01-01",
      provincias: ["MENDOZA", "NEUQUEN", "CORDOBA"],
    }),
    promotion("Pasada Dos", { subtitulo: "Viajes", fecha_hasta: "2020-01-01", imagen: "" }),
    promotion("Tercera", { subtitulo: "Hogar", fecha_hasta: "2098-01-01", provincias: null }),
  ];
}

async function searched() {
  const opened = await open({ catalog: catalogOfTable() });
  await validate(opened.screen, ["Vigente Uno", "Pasada Dos", "Tercera", "No Existe"]);
  await vi.waitFor(() => {
    expect(tableRows(opened.screen)).toHaveLength(4);
  });
  return opened.screen;
}

function brands(screen: Screen): string[] {
  return tableRows(screen).map((row) => textOf(row, "brand"));
}

describe("the table", () => {
  it("each column filters, the ones with text and the ones with a list", async () => {
    const screen = await searched();
    const count = screen.getByText("Mostrando", { exact: false });

    await screen.getByRole("combobox", { name: "Filtrar por estado" }).selectOptions("VENCIDA");
    expect(brands(screen)).toEqual(["Pasada Dos"]);
    await expect.element(count).toHaveTextContent("Mostrando 1 de 4");
    await screen.getByRole("combobox", { name: "Filtrar por estado" }).selectOptions("");

    await screen.getByRole("textbox", { name: "Filtrar por marca" }).fill("uno");
    expect(brands(screen)).toEqual(["Vigente Uno"]);
    await screen.getByRole("textbox", { name: "Filtrar por marca" }).fill("");

    await screen.getByRole("textbox", { name: "Filtrar por promoción" }).fill("tercera");
    expect(brands(screen)).toEqual(["Tercera"]);
    await screen.getByRole("textbox", { name: "Filtrar por promoción" }).fill("");

    await screen.getByRole("combobox", { name: "Filtrar por categoría" }).selectOptions("Viajes");
    expect(brands(screen)).toEqual(["Pasada Dos"]);
    await screen.getByRole("combobox", { name: "Filtrar por categoría" }).selectOptions("");

    await screen.getByRole("textbox", { name: "Filtrar por dónde" }).fill("neuquen");
    expect(brands(screen)).toEqual(["Vigente Uno"]);
    await screen.getByRole("textbox", { name: "Filtrar por dónde" }).fill("");

    await screen.getByRole("textbox", { name: "Filtrar por hasta" }).fill("2020");
    expect(brands(screen)).toEqual(["Pasada Dos"]);
    await screen.getByRole("textbox", { name: "Filtrar por hasta" }).fill("");

    await screen.getByRole("textbox", { name: "Filtrar por desde" }).fill("zzz");
    await expect.element(screen.getByText("Ninguna fila coincide con el filtro.")).toBeVisible();
    await screen.getByRole("textbox", { name: "Filtrar por desde" }).fill("");

    await screen.getByRole("combobox", { name: "Filtrar por logo" }).selectOptions("con");
    expect(brands(screen)).toEqual(["Vigente Uno", "Tercera"]);
    await screen.getByRole("combobox", { name: "Filtrar por logo" }).selectOptions("sin");
    expect(brands(screen)).toEqual(["Pasada Dos", "No Existe"]);
  });

  it("the search box looks at several columns and at the status", async () => {
    const screen = await searched();
    const search = screen.getByTestId("promotions-results-search");
    await search.fill("viajes");
    expect(brands(screen)).toEqual(["Pasada Dos"]);
    await search.fill("no encontrada");
    expect(brands(screen)).toEqual(["No Existe"]);
    await search.fill("nueva");
    expect(brands(screen)).toEqual([]);
  });

  it("a counter filters by its status, and pressed again it stops", async () => {
    const screen = await searched();
    const expired = screen.getByRole("button", { name: "Vencida: 1" });
    await expired.click();
    expect(brands(screen)).toEqual(["Pasada Dos"]);
    await expect.element(expired).toHaveAttribute("aria-pressed", "true");
    await expired.click();
    expect(brands(screen)).toHaveLength(4);
  });

  it("each press on a head goes on: up, down, and back to the order of the list", async () => {
    const screen = await searched();
    const status = screen.getByRole("button", { name: /^Estado/ });
    await status.click();
    expect(brands(screen)).toEqual(["No Existe", "Pasada Dos", "Vigente Uno", "Tercera"]);
    await status.click();
    expect(brands(screen).slice(0, 2)).toEqual(["Vigente Uno", "Tercera"]);
    await status.click();
    expect(brands(screen)).toEqual(["Vigente Uno", "Pasada Dos", "Tercera", "No Existe"]);
  });

  it("every column can be ordered, and what is empty goes last", async () => {
    const screen = await searched();
    await screen.getByRole("button", { name: /^Hasta/ }).click();
    expect(brands(screen).at(-1)).toBe("No Existe");
    await screen.getByRole("button", { name: /^Logo/ }).click();
    expect(brands(screen).slice(0, 2)).toEqual(["Vigente Uno", "Tercera"]);
    await screen.getByRole("button", { name: /^Marca/ }).click();
    expect(brands(screen)[0]).toBe("No Existe");
    await screen.getByRole("button", { name: /^Coincidencia/ }).click();
    expect(brands(screen).at(-1)).toBe("No Existe");
    await screen.getByRole("button", { name: /^Categoría/ }).click();
    expect(brands(screen).at(-1)).toBe("No Existe");
    await screen.getByRole("button", { name: /^Dónde/ }).click();
    expect(brands(screen).at(-1)).toBe("No Existe");
    await screen.getByRole("button", { name: /^Desde/ }).click();
    expect(brands(screen)).toHaveLength(4);
  });

  it("the control of the order says the same, and orders too", async () => {
    const screen = await searched();
    const order = screen.getByRole("combobox", { name: "Ordenar por" });
    await expect.element(order).toHaveValue("");
    await order.selectOptions("brand:desc");
    expect(brands(screen)[0]).toBe("Vigente Uno");
    await screen.getByRole("button", { name: /^Estado/ }).click();
    await expect.element(order).toHaveValue("status");
    await order.selectOptions("");
    expect(brands(screen)[0]).toBe("Vigente Uno");
  });

  it("a row ticked out fades, and it does not count", async () => {
    const screen = await searched();
    await screen.getByRole("checkbox", { name: "Excluir del reporte" }).first().click();
    await expect.element(screen.getByRole("button", { name: "Vigente: 1" })).toBeVisible();
    await expect
      .element(screen.getByTestId("promotions-download"))
      .toHaveTextContent("⬇ Descargar Excel (3)");
  });

  it('"Dónde" goes short, with the whole list on hover', async () => {
    const screen = await searched();
    const first = rowAt(screen, 0);
    const third = rowAt(screen, 2);
    const fourth = rowAt(screen, 3);
    expect(textOf(first, "where")).toBe("Cordoba, Mendoza y 1 más");
    expect(textOf(rowAt(screen, 1), "where")).toBe("Mendoza");
    expect(first.querySelector('[data-part="where"] span')?.getAttribute("title")).toBe(
      "Cordoba, Mendoza, Neuquen",
    );
    expect(textOf(third, "where")).toBe("-");
    expect(textOf(fourth, "where")).toBe("-");
  });

  it("a logo that does not load says so, and the row stays", async () => {
    const screen = await searched();
    const logo = screen.getByTestId("promotions-results").element().querySelector("img");
    if (!logo) throw new Error("No logo");
    logo.dispatchEvent(new Event("error"));
    await expect.element(screen.getByTitle("No se pudo cargar el logo")).toBeInTheDocument();
    await expect.element(screen.getByTitle("Sin coincidencia").first()).toBeInTheDocument();
  });
});

describe("in the whole country", () => {
  it('"Dónde" says so instead of the list', async () => {
    const { screen } = await open({
      catalog: [promotion("Alfa", { provincias: ["MENDOZA", "NEUQUEN", "CORDOBA", "SALTA"] })],
    });
    await validate(screen, ["Alfa"]);
    await vi.waitFor(() => {
      expect(textOf(rowAt(screen, 0), "where")).toBe("Todo el país");
    });
  });
});

describe("MODO", () => {
  const ROW = {
    id: "a",
    slug: "solo-modo",
    titulo: "Solo Modo",
    subtitulo: "Combustible",
    imagen: "modo/1.png",
    beneficio: "5% de reintegro",
    aclaracion: "  Sólo  con aceite ",
    solo_galicia: true,
    fecha_hasta: "2099-01-01",
    provincias: null,
    primera_vez: new Date().toISOString(),
  };

  it("joins, with its tag, its link, its note and its logo from the bucket", async () => {
    const { screen } = await open({ catalog: [promotion("Alfa")], modo: [ROW] });
    await validate(screen, ["Solo Modo"]);
    await vi.waitFor(() => {
      expect(titles(screen)).toEqual(["Solo Modo"]);
    });
    const row = rowAt(screen, 0);
    expect(textOf(row, "modo")).toBe("MODO");
    expect(row.querySelector('[data-part="modo"]')?.getAttribute("title")).toMatch(
      /exclusiva de Galicia/,
    );
    expect(textOf(row, "note")).toBe("Sólo con aceite");
    expect(textOf(row, "where")).toBe("Sin dato");
    expect(row.querySelector("a")?.getAttribute("href")).toBe(
      "https://www.modo.com.ar/promos/solo-modo",
    );
    expect(textOf(row, "link")).toBe("Ver en MODO");
    expect(row.querySelector("img")?.getAttribute("src")).toMatch(/\/flyers\/modo\/1\.png$/);
    expect(screen.getByText("Nueva").element().getAttribute("title")).toMatch(
      /Apareció en MODO el/,
    );
  });

  it("with the tick off it goes out, the table is made again and it is remembered", async () => {
    const { screen } = await open({
      catalog: [promotion("Alfa")],
      modo: [{ ...ROW, solo_galicia: false }],
    });
    await validate(screen, ["Solo Modo"]);
    await vi.waitFor(() => {
      expect(titles(screen)).toEqual(["Solo Modo"]);
    });
    expect(
      tableRows(screen)[0]?.querySelector('[data-part="modo"]')?.getAttribute("title"),
    ).toMatch(/que vale con Galicia \(y otros bancos\)/);
    const tick = screen.getByRole("checkbox", { name: "Incluir MODO" });

    await tick.click();

    expect(textOf(rowAt(screen, 0), "status")).toBe("No encontrada");
    expect(localStorage.getItem("fg_promos_modo")).toBe("0");

    await tick.click();
    expect(titles(screen)).toEqual(["Solo Modo"]);
  });

  it("on Activas the tick makes the list again too", async () => {
    const { screen } = await open({
      catalog: [promotion("Alfa")],
      modo: [{ ...ROW, provincias: ["MENDOZA"], localidades: [] }],
    });
    await listActive(screen);
    await vi.waitFor(() => {
      expect(titles(screen)).toEqual(["Alfa", "Solo Modo"]);
    });
    const tick = screen.getByRole("checkbox", { name: "Incluir MODO" });
    await tick.click();
    expect(titles(screen)).toEqual(["Alfa"]);
  });

  it("if another screen changes it, the table follows", async () => {
    const harness = createAppHarness({
      tables: {
        promos_galicia_cache: () => jsonResponse([promotion("Alfa")]),
        promos_modo_cache: () => jsonResponse([ROW]),
        promos_galicia_meta: () =>
          jsonResponse({ last_sync_at: null, total: 1, ubicaciones: LOCATIONS }),
      },
    });
    harness.storeSession();
    const screen = await render(
      harness.wrap(
        <>
          <Outside />
          <InsideOnly />
        </>,
      ),
    );
    await validate(screen, ["Solo Modo"]);
    await vi.waitFor(() => {
      expect(titles(screen)).toEqual(["Solo Modo"]);
    });

    await screen.getByRole("button", { name: "Desde otra pantalla" }).click();

    await vi.waitFor(() => {
      expect(textOf(rowAt(screen, 0), "status")).toBe("No encontrada");
    });
  });

  it("a promotion of Galicia links to its page", async () => {
    const { screen } = await open({ catalog: [promotion("Cafe &amp; Te")] });
    await validate(screen, ["Cafe & Te"]);
    await vi.waitFor(() => {
      expect(textOf(rowAt(screen, 0), "link")).toBe("Ver");
    });
    expect(titles(screen)).toEqual(["Cafe & Te"]);
  });

  it("without a link it shows a dash", async () => {
    const { screen } = await open({ modo: [{ ...ROW, slug: "" }], catalog: [promotion("Alfa")] });
    await validate(screen, ["Solo Modo"]);
    await vi.waitFor(() => {
      expect(titles(screen)).toEqual(["Solo Modo"]);
    });
    expect(tableRows(screen)[0]?.querySelector("a")).toBeNull();
  });
});

describe("Ctrl+Enter", () => {
  it("does what the tab is for", async () => {
    const { screen } = await open({ catalog: [promotion("Alfa")] });
    await waitForCatalog(screen);
    await screen.getByTestId("promotions-brands").fill("Alfa");
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }),
    );
    await vi.waitFor(() => {
      expect(titles(screen)).toEqual(["Alfa"]);
    });

    await screen.getByRole("tab", { name: "Activas" }).click();
    await chooseProvince(screen, "MENDOZA");
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }),
    );
    await vi.waitFor(() => {
      expect(titles(screen)).toEqual(["Alfa"]);
    });
  });
});

describe("the Excel", () => {
  it("goes with what is showing: its button says how many, and what it is doing", async () => {
    const saved: Blob[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      if (blob instanceof Blob) saved.push(blob);
      return "blob:invented";
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const realFetch = globalThis.fetch.bind(globalThis);
    const logo = deferred<Response>();
    vi.spyOn(globalThis, "fetch").mockImplementation((address, init) =>
      fileAddress(address).endsWith("logo.png") ? logo.promise : realFetch(address, init),
    );
    const { screen } = await open({ catalog: [promotion("Alfa"), promotion("Beta")] });
    await validate(screen, ["Alfa", "Beta"]);
    const download = screen.getByTestId("promotions-download");
    await expect.element(download).toHaveTextContent("⬇ Descargar Excel (2)");
    await screen.getByRole("checkbox", { name: "Excluir del reporte" }).first().click();
    await expect.element(download).toHaveTextContent("⬇ Descargar Excel (1)");

    await download.click();

    await expect.element(download).toHaveTextContent("Generando...");
    await expect.element(download).toBeDisabled();
    logo.resolve(new Response(null, { status: 404 }));
    await expect.element(download).toHaveTextContent("⬇ Descargar Excel (1)");
    expect(saved).toHaveLength(1);
  });
});

describe("what a test can read", () => {
  it("is there while the screen is, and goes away with it", async () => {
    const { screen } = await open({ catalog: [promotion("Alfa")] });
    await waitForCatalog(screen);
    const probes = window["__flyerProbe"];
    expect(probes?.promotions?.()).toHaveProperty("catalog");
    await screen.unmount();
    expect(probes?.promotions).toBeUndefined();
  });
});

describe("watching the brands found", () => {
  it("is only for the administrator", async () => {
    const { screen } = await open({ catalog: [promotion("Alfa")] });
    await validate(screen, ["Alfa"]);
    await vi.waitFor(() => {
      expect(titles(screen)).toEqual(["Alfa"]);
    });
    await expect.element(screen.getByText("Vigilar estas marcas en")).not.toBeInTheDocument();
  });

  it("asks first, tells what stays out and saves on the flyer chosen", async () => {
    const { screen, harness } = await open({
      profile: ADMIN,
      files: {
        "_opciones.json": {
          opts: [
            { n: 1, nombre: "Combustible" },
            { n: 9, nombre: "Súper" },
          ],
        },
      },
      catalog: [promotion("Alfa")],
    });
    await validate(screen, [
      "Alfa",
      "Marca Uno",
      "Marca Dos",
      "Marca Tres",
      "Marca Cuatro",
      "Marca Cinco",
      "Marca Seis",
    ]);
    const option = screen.getByLabelText("Vigilar estas marcas en");
    await expect.element(option).toBeVisible();
    await vi.waitFor(() => {
      expect(option.element().querySelectorAll("option").length).toBeGreaterThan(1);
    });
    await option.selectOptions("9");
    await screen.getByRole("button", { name: "Guardar" }).click();
    const question = screen.getByRole("alertdialog");
    await expect.element(question).toMatchTextContent(/¿Vigilar 1 marcas en «Súper»\?/);
    await expect.element(question).toMatchTextContent(/Quedan afuera 6 .*Marca Uno.*…/);

    await screen.getByRole("button", { name: "Cancelar" }).click();
    expect(harness.network.to("/storage/v1/object/flyers/", "POST")).toEqual([]);

    await screen.getByRole("button", { name: "Guardar" }).click();
    await screen.getByRole("button", { name: "Vigilar" }).click();

    await expect
      .element(notice(screen))
      .toMatchTextContent(/Listo: se vigilan 1 marcas de «Súper»/);
    expect(harness.network.to("/storage/v1/object/flyers/_vigilar.json").length).toBeGreaterThan(0);
  });

  it("without anything found it asks to review", async () => {
    const { screen } = await open({ profile: ADMIN, catalog: [promotion("Alfa")] });
    await validate(screen, ["Nada Parecido"]);
    await screen.getByRole("button", { name: "Guardar" }).click();
    await expect
      .element(notice(screen))
      .toMatchTextContent(/No hay marcas encontradas para vigilar/);
  });

  it("if the list cannot be read it does not write over it", async () => {
    const { screen, harness } = await open({
      profile: ADMIN,
      droppedFiles: ["_vigilar.json"],
      catalog: [promotion("Alfa")],
    });
    await validate(screen, ["Alfa"]);
    await screen.getByRole("button", { name: "Guardar" }).click();
    await screen.getByRole("button", { name: "Vigilar" }).click();
    await expect
      .element(notice(screen))
      .toMatchTextContent(/No se pudo guardar: No se pudo leer la lista/);
    expect(harness.network.to("/storage/v1/object/flyers/_vigilar.json", "POST")).toEqual([]);
  });
});
