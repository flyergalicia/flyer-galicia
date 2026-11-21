// Admin → Uso: the numbers of a period, by flyer, profile, week and person, and Estudio.
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { FIRST_PLACE, goToSheet, rememberPlace } from "../model/panel.ts";
import { openPanel, type PanelOptions } from "../testing/panel-cloud.ts";

const DAY_MS = 86_400_000;
const panel = () => page.getByTestId("admin-panel");
const body = () => panel().getByTestId("usage-body");
const section = (title: string) => body().getByTestId("usage-section").filter({ hasText: title });

function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

function log(days: number, fields: Record<string, unknown> = {}) {
  return {
    user_id: "u1",
    is_bulk: false,
    bulk_count: 0,
    flyer_type: JSON.stringify({ opcion: 9 }),
    created_at: daysAgo(days),
    ...fields,
  };
}

const PEOPLE = [
  { id: "u1", full_name: "Asesor Prueba", email_asesor: "a@b", role: "asesor" },
  { id: "u2", full_name: "Hunter Prueba", email_asesor: "h@b", role: "hunter" },
];

async function openUsage(options: PanelOptions) {
  rememberPlace(goToSheet(FIRST_PLACE, "uso"));
  return openPanel({ accounts: PEOPLE, ...options });
}

afterEach(() => {
  rememberPlace(FIRST_PLACE);
});

describe("Uso", () => {
  it("counts by flyer, by profile, week by week and the ten that downloaded the most", async () => {
    const { harness } = await openUsage({
      flyerLogs: (request) => {
        const since = request.query.get("created_at")?.replace(/^gte\./, "") ?? "";
        const rows = [
          log(2),
          log(3),
          log(10, { is_bulk: true, bulk_count: 10 }),
          log(4, { user_id: "u2", flyer_type: JSON.stringify({ opcion: 1 }) }),
          log(60, { user_id: "u2" }),
        ];
        return new Response(JSON.stringify(rows.filter(({ created_at: at }) => at >= since)));
      },
      designs: [
        {
          estado: "publicado",
          created_at: daysAgo(2),
          pedido_at: daysAgo(2),
          revisado_at: daysAgo(1),
        },
      ],
    });
    await expect
      .element(body().getByTestId("usage-totals"))
      .toHaveTextContent(
        "13flyers bajados3 de a uno · 10 en tandas (Masivo y padrón)2usuarios que bajaron flyers6,5flyers por usuariopromedio del período",
      );
    await expect.element(section("Por flyer")).toMatchTextContent(/Combustible12Opción 11/);
    await expect.element(section("Por perfil")).toMatchTextContent(/Asesor12Hunter1/);
    await expect
      .element(section("Los 10 que más bajaron"))
      .toMatchTextContent(/Asesor Prueba12Hunter Prueba1/);
    await expect
      .element(section("Estudio en el período"))
      .toMatchTextContent(/1diseños guardados1pedidos de publicación1publicados/);
    const asked = harness.network.to("/rest/v1/flyer_disenos").at(-1)?.query;
    expect([asked?.get("tipo"), asked?.get("compartido_por")]).toEqual(["eq.diseno", "eq."]);

    await panel().getByRole("button", { name: "90 días" }).click();
    await expect
      .element(panel().getByRole("button", { name: "90 días" }))
      .toHaveAttribute("aria-pressed", "true");
    await expect
      .element(body().getByTestId("usage-totals"))
      .toMatchTextContent(/^14flyers bajados/);
  });

  it("with no flyers in the period says so, and still tells Estudio", async () => {
    await openUsage({ flyerLogs: [] });
    await expect.element(body()).toMatchTextContent(/No se bajaron flyers en este período\./);
    await expect.element(body().getByTestId("usage-totals")).toMatchTextContent(/^0flyers bajados/);
    await expect.element(section("Estudio en el período")).toBeVisible();
    await panel().getByRole("button", { name: "Este año" }).click();
    await expect
      .element(panel().getByRole("button", { name: "Este año" }))
      .toHaveAttribute("aria-pressed", "true");
  });

  it("without the profiles or the logs it does not count either", async () => {
    let fail = "/rest/v1/profiles";
    await openUsage({
      // A 500, not a 503: the database client retries a 503 three times (7 s), and this test fails
      // twice in a row, which left it a hair under its 15 s.
      intercept: ({ path, query }) =>
        path === fail &&
        (path !== "/rest/v1/profiles" || query.get("select") === "id,full_name,email_asesor,role")
          ? new Response(JSON.stringify({ message: "sin red" }), { status: 500 })
          : null,
    });
    await expect.element(body().getByTestId("read-problem")).toMatchTextContent(/sin red/);
    fail = "/rest/v1/flyer_logs";
    await body().getByRole("button", { name: "Reintentar" }).click();
    await expect.element(body().getByTestId("read-problem")).toMatchTextContent(/sin red/);
    fail = "";
    await body().getByRole("button", { name: "Reintentar" }).click();
    await expect.element(body()).toMatchTextContent(/No se bajaron flyers/);
  });

  it("a read that fails says so, never that nothing was downloaded", async () => {
    let fails = true;
    await openUsage({
      intercept: ({ path }) =>
        fails && path === "/rest/v1/flyer_disenos"
          ? new Response(JSON.stringify({ message: "sin red" }), { status: 503 })
          : null,
    });
    await expect
      .element(body().getByTestId("read-problem"))
      .toMatchTextContent(/No se pudieron leer los registros/);
    expect(body().element().textContent).not.toMatch(/No se bajaron flyers/);
    fails = false;
    await body().getByRole("button", { name: "Reintentar" }).click();
    await expect.element(body()).toMatchTextContent(/No se bajaron flyers/);
  });
});
