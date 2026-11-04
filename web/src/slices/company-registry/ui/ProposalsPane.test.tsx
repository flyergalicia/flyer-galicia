import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ADVISOR } from "@/shared/lib/testing/app-harness.tsx";
import {
  INVENTED_USER,
  jsonResponse,
  type RecordedRequest,
} from "@/shared/supabase/testing/recording-fetch.ts";
import { Inside } from "../testing/Inside.tsx";
import { databaseError, type RegistryCloud, registryHarness } from "../testing/registry-cloud.ts";
import { ProposalsPane } from "./ProposalsPane.tsx";

const OFFICER = { nombre: "Ana", celular: "", email: "" };
const PROPOSAL = {
  id: "p1",
  empresa: "ACME SA",
  estado: "pendiente",
  origen: "hunter",
  creada_por: "otro",
  creada_por_nombre: "Hunter Uno",
  dueno_id: INVENTED_USER.id,
  created_at: "2020-10-20T10:00:00Z",
  asesores_antes: [OFFICER],
  asesores: [{ nombre: "Beto", celular: "", email: "" }],
};
const FROM_SUBSTITUTE = {
  ...PROPOSAL,
  id: "p2",
  empresa: "DELTA SA",
  origen: "suplente",
  creada_por_nombre: "Sol Suplente",
  config_antes: "BAU",
  config: "",
  asesores: [OFFICER],
};

function open(cloud: RegistryCloud = {}) {
  const harness = registryHarness({ faculties: ["padron_buscar"], ...cloud });
  void render(
    harness.wrap(
      <Inside>
        <ProposalsPane isActive />
      </Inside>,
    ),
  );
  return harness;
}

const cards = () => page.getByTestId("proposal-card");
const notice = () => page.getByRole("status");

function bodyOf(harness: ReturnType<typeof open>, name: string): unknown {
  return harness.network.to(`/rest/v1/rpc/${name}`)[0]?.body;
}

const select = () => page.getByTestId("substitute-select");

function profiles(substitute: string | null, patch?: () => Response) {
  return {
    tables: {
      profiles: ({ method, query }: RecordedRequest) => {
        if (method === "PATCH") return patch?.() ?? new Response(null, { status: 204 });
        return jsonResponse(
          query.get("select") === "suplente_id" ? { suplente_id: substitute } : ADVISOR,
        );
      },
    },
  };
}

describe("Cambios pendientes", () => {
  it("nothing to decide says so", async () => {
    open({ proposals: [] });

    await expect.element(page.getByText("No tenés cambios para revisar.")).toBeVisible();
  });

  it("whose change it is, and what it changes", async () => {
    open({ proposals: [PROPOSAL] });

    await expect.element(cards()).toMatchTextContent(/ACME SA/);
    await expect.element(cards()).toMatchTextContent(/Propuesto por Hunter Uno · 20\/10\/2020/);
    await expect.element(cards()).toMatchTextContent(/Oficial: Ana · nombre Ana → Beto/);
    await expect.element(cards()).toMatchTextContent(/Pendiente de aprobación/);
    await expect.element(cards().getByRole("button", { name: "Repreguntar" })).toBeVisible();
  });

  it("the request of a substitute says so, shows the cashback, and has no Repreguntar", async () => {
    open({ proposals: [FROM_SUBSTITUTE] });

    await expect.element(cards()).toMatchTextContent(/Pedido por Sol Suplente, como suplente/);
    await expect.element(cards()).toMatchTextContent(/Cashback: BAU → Sin cashback/);
    expect(cards().getByRole("button", { name: "Repreguntar" }).elements()).toHaveLength(0);
  });

  it("one's own does not come, unless the company is one's own too", async () => {
    open({
      proposals: [
        {
          ...PROPOSAL,
          id: "a",
          empresa: "PROPIA MIA",
          creada_por: INVENTED_USER.id,
          dueno_id: "otro",
        },
        { ...PROPOSAL, id: "b", empresa: "SIMULADA", creada_por: INVENTED_USER.id },
      ],
    });

    await expect.element(page.getByText("SIMULADA")).toBeVisible();
    await expect.element(page.getByText("PROPIA MIA")).not.toBeInTheDocument();
  });

  it("what waits for the hunter says so, and cannot be asked again", async () => {
    open({
      proposals: [{ ...PROPOSAL, estado: "consulta" }],
      messages: [
        {
          id: "m1",
          propuesta_id: "p1",
          rol: "oficial",
          tipo: "consulta",
          autor_nombre: "Olga",
          texto: "¿Seguro?",
          created_at: "2020-10-20T10:00:00Z",
        },
        {
          id: "m2",
          propuesta_id: "p1",
          rol: "hunter",
          tipo: "respuesta",
          autor_nombre: "",
          texto: "<b>Sí</b>",
          created_at: "2020-10-21T10:00:00Z",
        },
        {
          id: "m3",
          propuesta_id: "p1",
          rol: "oficial",
          tipo: "nota",
          autor_nombre: "",
          texto: " ",
          created_at: "",
        },
      ],
    });

    await expect.element(cards()).toMatchTextContent(/Esperando respuesta del hunter/);
    await expect.element(cards()).toMatchTextContent(/Olga · Consulta · 20\/10\/2020/);
    await expect.element(cards()).toMatchTextContent(/Hunter · Respuesta · 21\/10\/2020/);
    await expect.element(page.getByText("<b>Sí</b>")).toBeVisible();
    expect(cards().getByRole("button", { name: "Repreguntar" }).elements()).toHaveLength(0);
  });

  it("a proposal with nothing different says so", async () => {
    open({ proposals: [{ ...PROPOSAL, asesores: PROPOSAL.asesores_antes }] });

    await expect.element(cards()).toMatchTextContent(/Sin cambios en los oficiales\./);
  });

  it("approving with a comment goes to the base, and the list follows", async () => {
    let list = [PROPOSAL];
    const harness = open({ proposals: () => jsonResponse(list) });
    await expect.element(cards()).toBeVisible();

    await cards().getByRole("button", { name: "Aprobar" }).click();
    await cards().getByRole("textbox").fill(" Gracias ");
    list = [];
    await page.getByTestId("proposal-confirm").click();

    await expect.element(notice()).toHaveTextContent("Cambio aplicado");
    expect(bodyOf(harness, "padron_propuesta_aprobar")).toEqual({
      p_id: "p1",
      p_comentario: "Gracias",
    });
    await expect.element(page.getByText("No tenés cambios para revisar.")).toBeVisible();
  });

  it("without a comment, approving and rejecting send nothing", async () => {
    const harness = open({ proposals: [PROPOSAL] });
    await expect.element(cards()).toBeVisible();

    await cards().getByRole("button", { name: "Rechazar" }).click();
    await page.getByTestId("proposal-confirm").click();

    await expect.element(notice()).toHaveTextContent("Propuesta rechazada");
    expect(bodyOf(harness, "padron_propuesta_rechazar")).toEqual({ p_id: "p1", p_motivo: null });
  });

  it("asking back needs the question", async () => {
    const harness = open({ proposals: [PROPOSAL] });
    await expect.element(cards()).toBeVisible();

    await cards().getByRole("button", { name: "Repreguntar" }).click();
    await page.getByTestId("proposal-confirm").click();
    await expect.element(notice()).toHaveTextContent("Escribí la consulta.");
    expect(harness.network.to("/rest/v1/rpc/padron_propuesta_consultar")).toHaveLength(0);

    await cards().getByRole("textbox").fill("¿Confirmaste?");
    await page.getByTestId("proposal-confirm").click();
    await expect.element(notice()).toHaveTextContent("Consulta enviada al hunter");
    expect(bodyOf(harness, "padron_propuesta_consultar")).toEqual({
      p_id: "p1",
      p_texto: "¿Confirmaste?",
    });
  });

  it("the box opens and closes in place, and what was written stays out of the other", async () => {
    open({ proposals: [PROPOSAL] });
    await expect.element(cards()).toBeVisible();
    const box = cards().getByRole("textbox");

    await cards().getByRole("button", { name: "Aprobar" }).click();
    await expect.element(box).toHaveFocus();
    await box.fill("Algo");
    await cards().getByRole("button", { name: "Rechazar" }).click();
    await expect.element(box).toHaveValue("");

    await cards().getByRole("button", { name: "Rechazar" }).click();
    expect(box.elements()).toHaveLength(0);

    await cards().getByRole("button", { name: "Aprobar" }).click();
    await cards().getByRole("button", { name: "Cancelar" }).click();
    expect(box.elements()).toHaveLength(0);
  });

  it("what the base refuses is said, and the proposal stays", async () => {
    open({
      proposals: [PROPOSAL],
      functions_: { padron_propuesta_aprobar: () => databaseError("no sos el dueño") },
    });
    await expect.element(cards()).toBeVisible();

    await cards().getByRole("button", { name: "Aprobar" }).click();
    await page.getByTestId("proposal-confirm").click();

    await expect.element(notice()).toHaveTextContent("No se pudo: no sos el dueño");
    await expect.element(cards()).toBeVisible();
  });

  it("a conversation that cannot be read does not take the card away", async () => {
    open({
      proposals: [PROPOSAL],
      tables: { padron_propuesta_mensajes: () => databaseError("falla") },
    });

    await expect.element(cards()).toMatchTextContent(/ACME SA/);
  });
});

describe("Mi suplente", () => {
  const COLLEAGUES = [
    { id: "c1", nombre: "Sol Ruiz" },
    { id: "c2", nombre: "Luis Gomez" },
    { algo: "que no sirve" },
  ];

  it("offers the colleagues, with the one chosen", async () => {
    open({ colleagues: COLLEAGUES, ...profiles("c2") });

    await expect.element(select()).toHaveValue("c2");
    await expect.element(select().getByRole("option", { name: "Sol Ruiz" })).toBeInTheDocument();
    await expect.element(select().getByRole("option", { name: "Ninguno" })).toBeInTheDocument();
    expect(select().getByRole("option").elements()).toHaveLength(3);
  });

  it("choosing one saves it, and taking it out too", async () => {
    const harness = open({ colleagues: COLLEAGUES, ...profiles(null) });
    await expect.element(select().getByRole("option", { name: "Sol Ruiz" })).toBeInTheDocument();

    await select().selectOptions("c1");
    await expect.element(notice()).toHaveTextContent("Suplente guardado");
    expect(harness.network.to("/rest/v1/profiles", "PATCH").at(-1)?.body).toEqual({
      suplente_id: "c1",
    });

    await select().selectOptions("");
    await expect.element(notice()).toHaveTextContent("Suplente quitado");
    expect(harness.network.to("/rest/v1/profiles", "PATCH").at(-1)?.body).toEqual({
      suplente_id: null,
    });
  });

  it("if it cannot be saved it says so", async () => {
    open({
      colleagues: COLLEAGUES,
      ...profiles(null, () => jsonResponse({ message: "sin permiso", code: "42501" }, 403)),
    });
    await expect.element(select().getByRole("option", { name: "Sol Ruiz" })).toBeInTheDocument();

    await select().selectOptions("c1");

    await expect.element(notice()).toHaveTextContent("No se pudo guardar: sin permiso");
  });

  it("without an answer about colleagues there is only Ninguno", async () => {
    open({ functions_: { colegas_para_suplente: () => databaseError("falla") } });

    await vi.waitFor(() => {
      expect(select().getByRole("option").elements()).toHaveLength(1);
    });
  });
});
