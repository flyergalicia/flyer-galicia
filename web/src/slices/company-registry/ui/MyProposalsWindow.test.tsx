import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { Inside } from "@/shared/lib/testing/Inside.tsx";
import { databaseError, type RegistryCloud, registryHarness } from "../testing/registry-cloud.ts";
import { MyProposalsWindow } from "./MyProposalsWindow.tsx";

const BEFORE = [{ nombre: "Ana", celular: "", email: "" }];
const QUESTION = {
  id: "p1",
  dueno_id: "o1",
  empresa_key: "acme sa",
  empresa: "ACME SA",
  estado: "consulta",
  asesores_antes: BEFORE,
  asesores: [{ nombre: "Carla Nueva", celular: "11 7", email: "" }],
  created_at: "2020-10-20T10:00:00Z",
  resuelta_at: null,
};
const MESSAGE = {
  id: "m0",
  propuesta_id: "p1",
  rol: "oficial",
  tipo: "consulta",
  autor_nombre: "Olga",
  texto: "¿Confirmaste?",
  created_at: "2020-10-21T10:00:00Z",
};

function proposalIn(estado: string, position: number) {
  return {
    ...QUESTION,
    id: estado,
    empresa: estado.toUpperCase(),
    estado,
    created_at: `2020-10-2${String(position)}T10:00:00Z`,
  };
}

function open(cloud: RegistryCloud = {}) {
  const onClose = vi.fn<() => void>();
  const harness = registryHarness({
    role: "hunter",
    faculties: ["proponer_oficiales"],
    proposals: [QUESTION],
    messages: [MESSAGE],
    ...cloud,
  });
  void render(
    harness.wrap(
      <Inside>
        <MyProposalsWindow onClose={onClose} />
      </Inside>,
    ),
  );
  return { harness, onClose };
}

const cards = () => page.getByTestId("my-proposal-card");
const title = () => page.getByRole("heading", { level: 3 });
const send = () => page.getByRole("button", { name: "Responder y reenviar" });
const note = () => page.getByTestId("proposal-note");

afterEach(() => {
  localStorage.clear();
});

describe("Mis propuestas", () => {
  it("nothing proposed says so, and it closes with its button", async () => {
    const { onClose } = open({ proposals: [] });

    await expect.element(page.getByText("Todavía no propusiste ningún cambio.")).toBeVisible();
    await page.getByRole("button", { name: "Cerrar" }).click();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("first what waits for an answer, then what is open, then what is done", async () => {
    const proposals = ["aprobada", "rechazada", "pendiente", "consulta"].map(proposalIn);
    open({ proposals, messages: [] });

    await vi.waitFor(() => {
      expect(cards().elements()).toHaveLength(4);
    });
    const names = cards()
      .elements()
      .map((card) => card.querySelector('[data-part="company"]')?.textContent);
    expect(names).toEqual(["CONSULTA", "PENDIENTE", "RECHAZADA", "APROBADA"]);
    await expect.element(cards().nth(2)).toMatchTextContent(/Rechazado/);
    await expect.element(cards().nth(3)).toMatchTextContent(/Aprobado/);
  });

  it("only a question can be answered, with what was proposed and the conversation", async () => {
    open();

    await expect.element(cards()).toMatchTextContent(/El oficial te hizo una consulta/);
    await expect.element(cards()).toMatchTextContent(/¿Confirmaste\?/);

    await cards().getByRole("button", { name: "Responder" }).click();

    await expect.element(title()).toMatchTextContent(/Responder la consulta/);
    await expect.element(page.getByText("¿Confirmaste?")).toBeVisible();
    await expect.element(page.getByLabelText("Nombre del oficial 1")).toHaveValue("Carla Nueva");
  });

  it("a text alone is enough, and blanks are nothing", async () => {
    open({ proposals: [{ ...QUESTION, asesores: BEFORE }] });
    await cards().getByRole("button", { name: "Responder" }).click();

    await expect.element(send()).toBeDisabled();
    await expect.element(page.getByText("Todavía no cambiaste ningún oficial.")).toBeVisible();
    await note().fill("Lo reviso");
    await expect.element(send()).toBeEnabled();
    await note().fill("   ");
    await expect.element(send()).toBeDisabled();
  });

  it("the answer goes with the four places, and it closes", async () => {
    const { harness, onClose } = open();
    await cards().getByRole("button", { name: "Responder" }).click();

    await page.getByLabelText("Celular del oficial 1").fill("11 9");
    await note().fill("Sí, lo confirmé");
    await send().click();

    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("Respuesta enviada: vuelve a quedar pendiente de aprobación.");
    await vi.waitFor(() => {
      expect(onClose).toHaveBeenCalledOnce();
    });
    expect(harness.network.to("/rest/v1/rpc/padron_propuesta_responder")[0]?.body).toEqual({
      p_id: "p1",
      p_texto: "Sí, lo confirmé",
      p_asesores: [
        { nombre: "Carla Nueva", celular: "11 9", email: "" },
        { nombre: "", celular: "", email: "" },
        { nombre: "", celular: "", email: "" },
        { nombre: "", celular: "", email: "" },
      ],
    });
  });

  it("closes at once, and the list and the conversation are read again behind it", async () => {
    let isAnswered = false;
    const reads: { letThemArrive?: () => void } = {};
    const late = new Promise<void>((done) => {
      reads.letThemArrive = done;
    });
    const { harness, onClose } = open({
      intercept: async ({ path, method }) => {
        if (path === "/rest/v1/rpc/padron_propuesta_responder") isAnswered = true;
        else if (isAnswered && method === "GET") await late;
        return null;
      },
    });
    await cards().getByRole("button", { name: "Responder" }).click();
    await note().fill("Sí, lo confirmé");
    await send().click();

    await vi.waitFor(() => {
      expect(onClose).toHaveBeenCalledOnce();
    });
    reads.letThemArrive?.();
    await vi.waitFor(() => {
      expect(harness.network.to("/rest/v1/padron_propuestas", "GET").length).toBeGreaterThan(1);
    });
  });

  it("what cannot be sent says so, keeps the window and can be sent again", async () => {
    const { onClose } = open({
      functions_: { padron_propuesta_responder: () => databaseError("falla simulada") },
    });
    await cards().getByRole("button", { name: "Responder" }).click();
    await note().fill("Sí");

    await send().click();

    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("No se pudo enviar: falla simulada");
    expect(onClose).not.toHaveBeenCalled();
    await expect.element(send()).toBeEnabled();
  });

  it("what is seen stops counting as news", async () => {
    open({ proposals: [{ ...QUESTION, estado: "aprobada", resuelta_at: "2020-10-22T10:00:00Z" }] });

    await expect.element(cards()).toBeVisible();
    await vi.waitFor(() => {
      expect(Object.keys(localStorage).some((key) => key.startsWith("fg_hunprop_visto_"))).toBe(
        true,
      );
    });
  });
});
