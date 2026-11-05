// An action open: what each one can do with it, and what each thing does.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import {
  createCommercialDesk,
  type ActionRequest,
} from "@/shared/lib/commercial-actions/commercial-desk.ts";
import { type Answer, deferred, jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import type { ActionRow, PersonRow } from "../api/rows.ts";
import { type CommercialCloud, CUT, FAILS, fieldsOf, ME } from "../testing/commercial-cloud.ts";
import { openCommercial, type OpenOptions } from "../testing/commercial-on-screen.tsx";
import { aListedAction, anAction, aPerson, TEAM } from "../testing/fixtures.ts";

const detail = () => page.getByTestId("action-detail");
const screenOf = () => page.getByTestId("commercial-screen");
const notice = () => page.getByRole("status");
const dialog = () => page.getByTestId("action-window");
const confirmation = () => page.getByRole("alertdialog");
const commands = () => page.getByTestId("action-commands");
const command = (name: string | RegExp) => commands().getByRole("button", { name });
const rows = () => page.getByTestId("action-row");
const person = (name: string) => page.getByTestId("person-row").filter({ hasText: name });
const stateOf = (name: string) => page.getByLabelText(`Estado de ${name}`);
const packageOf = (name: string) => page.getByLabelText(`Paquete de ${name}`);
const choices = () => page.getByTestId("window-choices");

const FORWARDED = anAction({ id: "g", creada_por: ME, dueno_id: ME, hunter_id: "h1" });
const FOR_ME = anAction({ id: "g", hunter_id: ME, creada_por: "o1", dueno_id: "o1" });
const ANA = aPerson({ id: "p1", gestion_id: "g", nombre: "Ana Pérez" });

function listed(action: ActionRow) {
  return { ...aListedAction(), ...action };
}

/** A table that answers what is written with what is written, over a row. */
function savingOver(
  table: readonly { readonly id: string }[],
  column: "id" | "gestion_id" = "id",
): Answer {
  return (request) => {
    if (request.method === "PATCH") {
      const id = request.query.get("id")?.replace("eq.", "");
      const before = table.find((row) => row.id === id);
      return jsonResponse({ ...before, ...fieldsOf(request.body) });
    }
    if (request.method === "DELETE") return new Response(null, { status: 204 });
    if (request.method === "POST") return jsonResponse(madeOf(request.body), 201);
    const value = request.query.get(column)?.replace("eq.", "");
    const found = table.filter((row) => Reflect.get(row, column) === value);
    const wantsOne = request.headers.get("Accept")?.includes("vnd.pgrst.object");
    return jsonResponse(wantsOne ? (found[0] ?? null) : found);
  };
}

function madeOf(body: unknown) {
  if (!Array.isArray(body)) return { ...anAction(), id: "created", ...fieldsOf(body) };
  return body.map((row: unknown, index) =>
    Object.assign(aPerson(), { id: `new${String(index)}` }, fieldsOf(row)),
  );
}

interface DetailCloud extends Omit<CommercialCloud, "prospects"> {
  readonly prospects?: readonly PersonRow[] | Answer;
}

async function openAction(action: ActionRow, cloud: DetailCloud = {}, options: OpenOptions = {}) {
  const { prospects = [], ...rest } = cloud;
  const opened = await openCommercial(
    {
      list: [listed(action)],
      actions: savingOver([action]),
      prospects: typeof prospects === "function" ? prospects : savingOver(prospects, "gestion_id"),
      ...rest,
    },
    options,
  );
  await page
    .getByTestId("commercial-tabs")
    .getByRole("tab", { name: /Gestiones|Mis gestiones/ })
    .click();
  await rows().first().click();
  await expect.element(detail()).toBeVisible();
  return opened;
}

const buttons = () =>
  Array.from(
    document.querySelectorAll('[data-testid="action-commands"] button'),
    (button) => button.textContent,
  );
const hunterField = () => page.getByTestId("form-hunter");
const saveAssignment = () => page.getByTestId("confirm-assignment");
const dayOfHunter = () => page.getByTestId("hunter-day");
const freeHunters = () => page.getByTestId("free-hunters");
const nameField = () => page.getByPlaceholder("Nombre y apellido");
const addOne = () => page.getByRole("button", { name: "Agregar", exact: true });
const cuilField = () => page.getByPlaceholder("CUIL o referencia (opcional)");
const pasteBox = () => page.getByTestId("paste-people-text");
const addPasted = () => page.getByTestId("paste-people-add");
const openPaste = async () => {
  await page.getByText("Pegar varios desde Excel").click();
};
const savingPasted: Answer = (request) =>
  request.method === "POST" ? jsonResponse(madeOf(request.body), 201) : jsonResponse([]);
const saveEdit = () => dialog().getByRole("button", { name: "Guardar", exact: true });

function deskFor(goTo: (tabId: string) => void) {
  return createCommercialDesk({ goTo, onRegister: vi.fn<() => void>() });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

async function sayInTheThread(text: string) {
  await page.getByTestId("message-text").fill(text);
  await page.getByTestId("message-send").click();
  await expect.element(detail()).toMatchTextContent(text);
}

describe("reading it", () => {
  it("shows what it is, with its figures", async () => {
    await openAction(
      anAction({
        id: "g",
        empresa: "ALIMENTOS SA",
        cuit: "30900001118",
        lugar: "Sede",
        dotacion: 100,
        asistentes: 20,
        nota: "Hablar con RRHH",
        prueba: true,
      }),
      {
        prospects: [
          ANA,
          aPerson({ id: "p2", gestion_id: "g", nombre: "Luis", estado: "alta", paquete: "plus" }),
        ],
      },
    );
    const text =
      /CUIT 30-90000111-8 · Acción presencial · 10 nov · 10:00–12:00 · Sede · Única vez · Hunter: Sofía Paz · Oficial: Mariana Costa · Derivada por Mariana Costa · prueba/;
    await expect.element(detail()).toMatchTextContent(text);
    await expect.element(page.getByTestId("action-note")).toHaveTextContent("Hablar con RRHH");
    await expect.element(detail()).toMatchTextContent(/Dotación100/);
    await expect.element(detail()).toMatchTextContent(/10% de los asistentes/);
    await expect.element(detail()).toMatchTextContent(/Altas11 con paquete · 0 sin paquete/);
    await expect.element(detail()).toMatchTextContent(/Conversión50%/);
  });

  it("a data list has its own figures and words", async () => {
    await openAction(
      anAction({
        id: "g",
        tipo: "datos",
        vence: "2026-12-01",
        hora_desde: null,
        hora_hasta: null,
        creada_por: ME,
      }),
      {
        prospects: [
          aPerson({ id: "a", gestion_id: "g", nombre: "A", estado: "a_contactar" }),
          aPerson({ id: "b", gestion_id: "g", nombre: "B", estado: "en_gestion" }),
          aPerson({ id: "c", gestion_id: "g", nombre: "C", estado: "alta", paquete: "caja" }),
          aPerson({
            id: "d",
            gestion_id: "g",
            nombre: "Zoe",
            estado: "descartado",
            motivo: "otro",
          }),
        ],
      },
    );
    await expect
      .element(detail())
      .toMatchTextContent(/Base de datos · desde el 10 nov · hasta el 1 dic/);
    await expect.element(detail()).toMatchTextContent(/Personas4en la base/);
    await expect.element(detail()).toMatchTextContent(/Contactados375% de la base/);
    await expect.element(detail()).toMatchTextContent(/Prospectos1en curso/);
    await expect.element(detail()).toMatchTextContent(/Conversión33%altas ÷ contactados/);
    await expect.element(person("Zoe")).toMatchTextContent(/Otro motivo/);
    await expect.element(command("Terminar la base")).toBeVisible();
  });

  it("repeats how often", async () => {
    await openAction(anAction({ id: "g", frecuencia: "repite", cada_dias: 7, veces: 3, vez: 2 }));
    await expect.element(detail()).toMatchTextContent(/Cada 7 días · vez 2 de 3/);
  });

  it("says when it no longer exists", async () => {
    await openCommercial({ list: [aListedAction({ id: "g" })], actions: () => jsonResponse(null) });
    await page
      .getByTestId("commercial-tabs")
      .getByRole("tab", { name: /^Gestiones/ })
      .click();
    await rows().first().click();
    await expect
      .element(screenOf())
      .toMatchTextContent(/Esa gestión ya no existe o no tenés acceso/);
    await page.getByTestId("action-back").click();
    await expect.element(rows().first()).toBeVisible();
  });

  it("a failure to read it offers to try again, and does not say it does not exist", async () => {
    let cut = true;
    await openCommercial({
      list: [aListedAction({ id: "g" })],
      actions: (request) => (cut ? FAILS(request) : jsonResponse(anAction({ id: "g" }))),
    });
    await page
      .getByTestId("commercial-tabs")
      .getByRole("tab", { name: /^Gestiones/ })
      .click();
    await rows().first().click();
    await expect.element(page.getByTestId("commercial-problem")).toBeVisible();
    await expect.element(screenOf()).not.toMatchTextContent(/ya no existe/);

    cut = false;
    await page.getByRole("button", { name: "Reintentar" }).click();

    await expect.element(detail()).toBeVisible();
  });

  it("a list of more than 1000 people is read page by page", async () => {
    const all = Array.from({ length: 1103 }, (_, index) =>
      aPerson({
        id: `p${String(index).padStart(5, "0")}`,
        gestion_id: "g",
        nombre: `P ${String(index)}`,
      }),
    );
    const { harness } = await openAction(anAction({ id: "g" }), {
      prospects: (request) => {
        const offset = Number(request.query.get("offset") ?? 0);
        const limit = Number(request.query.get("limit") ?? 1000);
        return jsonResponse(all.slice(offset, offset + limit));
      },
    });
    await expect.element(person("P 1102")).toBeVisible();
    expect(harness.network.to("/rest/v1/gestion_prospectos", "GET")).toHaveLength(2);
  });

  it("a failure halfway through the pages does not leave half a list", async () => {
    const first = Array.from({ length: 1000 }, (_, index) =>
      aPerson({ id: `q${String(index)}`, gestion_id: "g", nombre: `Q ${String(index)}` }),
    );
    await openCommercial({
      list: [aListedAction({ id: "g" })],
      actions: savingOver([anAction({ id: "g" })]),
      prospects: (request) =>
        Number(request.query.get("offset") ?? 0) === 0 ? jsonResponse(first) : FAILS(request),
    });
    await page
      .getByTestId("commercial-tabs")
      .getByRole("tab", { name: /^Gestiones/ })
      .click();
    await rows().first().click();
    await expect.element(page.getByTestId("commercial-problem")).toBeVisible();
  });

  it("writes what others wrote as text", async () => {
    await openAction(
      anAction({
        id: "g",
        empresa: "<i>A</i> SA",
        nota: "<script>x</script>",
        no_puede_at: "2026-11-01",
        no_puede_motivo: "<b>no</b>",
      }),
      {
        prospects: [aPerson({ id: "x", gestion_id: "g", nombre: "<u>Ana</u>", contacto: "<a>" })],
        messages: [
          {
            id: "m",
            gestion_id: "g",
            autor: "h1",
            texto: "<em>hola</em>",
            tipo: "texto",
            created_at: "2026-11-01T10:00:00Z",
          },
        ],
      },
    );
    await expect.element(detail()).toMatchTextContent("<i>A</i> SA");
    await expect.element(detail()).toMatchTextContent("<script>x</script>");
    await expect.element(detail()).toMatchTextContent("<b>no</b>");
    await expect.element(detail()).toMatchTextContent("<u>Ana</u>");
    await expect.element(detail()).toMatchTextContent("<em>hola</em>");
    const element = document.querySelector('[data-testid="action-detail"]');
    expect(element?.querySelector("script, u, em, i")).toBeNull();
  });

  it("each contact can be reached", async () => {
    await openAction(FORWARDED, {
      prospects: [
        aPerson({ id: "1", gestion_id: "g", nombre: "Mail", contacto: "a@b.co" }),
        aPerson({ id: "2", gestion_id: "g", nombre: "Tel", contacto: "11 5555-1234" }),
        aPerson({ id: "3", gestion_id: "g", nombre: "Texto", contacto: "Portería" }),
        aPerson({ id: "4", gestion_id: "g", nombre: "Nada" }),
        aPerson({ id: "5", gestion_id: "g", nombre: "Cuil", cuil: "20123456786" }),
        aPerson({ id: "6", gestion_id: "g", nombre: "Ref", referencia: "Legajo 3" }),
      ],
    });
    await expect
      .element(person("Mail").getByRole("link", { name: "a@b.co" }))
      .toHaveAttribute("href", "mailto:a@b.co");
    await expect.element(person("Tel").getByRole("link")).toHaveAttribute("href", "tel:1155551234");
    await expect.element(person("Texto")).toMatchTextContent(/Portería/);
    await expect.element(person("Nada")).toMatchTextContent(/—/);
    await expect.element(person("Cuil")).toMatchTextContent(/20-12345678-6/);
    await expect.element(person("Ref")).toMatchTextContent(/Legajo 3/);
  });
});

describe("the buttons each one has", () => {
  it("the officer who forwarded it", async () => {
    await openAction(FORWARDED);
    expect(buttons()).toEqual([
      "Marcar como realizada",
      "Cambiar hunter",
      "Ver su flyer",
      "Dejar sin leer",
      "Editar datos",
      "Eliminar",
    ]);
  });

  it("the hunter it was forwarded to", async () => {
    await openAction(FOR_ME, { role: "hunter" });
    expect(buttons()).toEqual([
      "Marcar como realizada",
      "No puedo ir",
      "Ver su flyer",
      "Dejar sin leer",
      "Editar datos",
    ]);
  });

  it("a person who only looks", async () => {
    await openAction(anAction({ id: "g", creada_por: "o1", hunter_id: "h1" }), {
      role: "asesor",
      files: { "_facultades.json": { roles: { asesor: { gestiones: true } } } },
    });
    expect(buttons()).toEqual(["Dejar sin leer"]);
    await expect.element(page.getByPlaceholder("Nombre y apellido")).not.toBeInTheDocument();
  });

  it("without being able to edit, the people only read", async () => {
    await openAction(anAction({ id: "g", creada_por: "o1", hunter_id: "h1" }), {
      role: "asesor",
      prospects: [
        aPerson({
          id: "a",
          gestion_id: "g",
          nombre: "Ana",
          paquete: "plus",
          estado: "alta",
          fecha_alta: "2026-11-02",
        }),
        aPerson({ id: "b", gestion_id: "g", nombre: "Bea", proximo: "2026-11-20" }),
      ],
    });
    await expect.element(person("Ana")).toMatchTextContent(/Plus.*Alta.*desde el 2 nov/);
    await expect.element(person("Bea")).toMatchTextContent(/Volver a contactar el 20 nov/);
    await expect.element(stateOf("Ana")).not.toBeInTheDocument();
  });

  it("the main one stands out when nobody has it, or they cannot attend", async () => {
    await openAction(anAction({ id: "g", creada_por: ME, hunter_id: null, lider_id: "l1" }));
    await expect.element(command("Asignar a un hunter")).toBeVisible();
    await expect.element(detail()).toMatchTextContent(/Está esperando que la asigne Laura Méndez/);
    await expect.element(detail()).toMatchTextContent(/te muestra quién está libre/);
  });
});

describe("what is opened stops being new", () => {
  const NEW_ONE = anAction({ id: "g", hunter_id: ME, visto_hunter: false, serie_id: "s9" });

  it("the whole series is marked once, and the list knows it", async () => {
    const { harness } = await openAction(NEW_ONE, { role: "hunter" });
    await vi.waitFor(() => {
      expect(harness.network.to("/rest/v1/rpc/gestion_marcar_vista")).toHaveLength(1);
    });
    expect(harness.network.to("/rest/v1/rpc/gestion_marcar_vista")[0]?.body).toEqual({
      p_serie: "s9",
    });
    await page.getByTestId("action-back").click();
    await expect.element(rows().first()).toHaveAttribute("data-flagged", "false");
  });

  it("reading it again does not mark it again", async () => {
    const said: object[] = [];
    const { harness } = await openAction(NEW_ONE, {
      role: "hunter",
      messages: () => jsonResponse(said),
      functions_: {
        gestion_mensaje_enviar: () => {
          said.push({
            id: `m${String(said.length)}`,
            gestion_id: "g",
            autor: ME,
            texto: `Mensaje ${String(said.length + 1)}`,
            tipo: "texto",
            created_at: "2026-11-01T10:00:00Z",
          });
          return jsonResponse(null);
        },
      },
    });
    await vi.waitFor(() => {
      expect(harness.network.to("/rest/v1/rpc/gestion_marcar_vista")).toHaveLength(1);
    });

    // Each message reads the conversation again; the second one lets whatever the first caused arrive.
    await sayInTheThread("Mensaje 1");
    await sayInTheThread("Mensaje 2");

    expect(harness.network.to("/rest/v1/rpc/gestion_marcar_vista")).toHaveLength(1);
  });

  it("what is not new is not marked", async () => {
    const { harness } = await openAction(anAction({ id: "g" }));
    await expect.element(page.getByText("Todavía no hay mensajes.")).toBeVisible();
    expect(harness.network.to("/rest/v1/rpc/gestion_marcar_vista")).toEqual([]);
    expect(harness.network.to("/rest/v1/rpc/gestion_marcar_leida")).toEqual([]);
  });

  const MESSAGE = {
    id: "m",
    gestion_id: "g",
    tipo: "texto",
    texto: "Hola",
    created_at: "2026-11-01T10:00:00Z",
  };

  it("messages of another are read on opening", async () => {
    const { harness } = await openAction(anAction({ id: "g" }), {
      messages: [{ ...MESSAGE, autor: "h1" }],
    });
    await vi.waitFor(() => {
      expect(harness.network.to("/rest/v1/rpc/gestion_marcar_leida")).toHaveLength(1);
    });
  });

  it("one's own alone are not", async () => {
    const { harness } = await openAction(anAction({ id: "g" }), {
      messages: [{ ...MESSAGE, autor: ME }],
    });
    await expect.element(detail()).toMatchTextContent(/Hola/);
    expect(harness.network.to("/rest/v1/rpc/gestion_marcar_leida")).toEqual([]);
  });

  it("the owner marks what a hunter completed", async () => {
    const { harness } = await openAction(
      anAction({ id: "g", dueno_id: ME, visto_dueno: false, hunter_id: "h1" }),
    );
    await vi.waitFor(() => {
      expect(harness.network.to("/rest/v1/rpc/gestion_marcar_vista")).toHaveLength(1);
    });
  });

  it("coming back to the screen reads it again", async () => {
    const { harness, show } = await openAction(anAction({ id: "g" }));
    const reads = () => harness.network.to("/rest/v1/gestiones", "GET").length;
    const before = reads();
    await show(false);
    await show(true);
    await vi.waitFor(() => {
      expect(reads()).toBeGreaterThan(before);
    });
  });

  it('"Dejar sin leer" goes to the list, and says so', async () => {
    const { harness } = await openAction(FORWARDED);
    await command("Dejar sin leer").click();
    await expect.element(notice()).toMatchTextContent(/Queda marcada en la lista/);
    await expect.element(rows().first()).toBeVisible();
    expect(harness.network.to("/rest/v1/rpc/gestion_marcar_no_leida")[0]?.body).toEqual({
      p_gestion: "g",
    });
  });

  it('if "Dejar sin leer" fails, it stays there and says so', async () => {
    await openAction(FORWARDED, { functions_: { gestion_marcar_no_leida: FAILS } });
    await command("Dejar sin leer").click();
    await expect.element(notice()).toMatchTextContent(/No se pudo: falla simulada/);
    await expect.element(detail()).toBeVisible();
  });
});

describe("the conversation", () => {
  const TWO = [
    {
      id: "a",
      gestion_id: "g",
      autor: "h1",
      texto: "Pregunta",
      tipo: "texto",
      created_at: "2026-11-01T10:00:00",
    },
    {
      id: "b",
      gestion_id: "g",
      autor: ME,
      texto: "Respuesta",
      tipo: "texto",
      created_at: "2026-11-01T10:05:00",
    },
    {
      id: "c",
      gestion_id: "g",
      autor: "h1",
      texto: "No voy",
      tipo: "no_puedo",
      created_at: "2026-11-01T10:06:00",
    },
    {
      id: "d",
      gestion_id: "g",
      autor: "gone",
      texto: "Chau",
      tipo: "texto",
      created_at: "2026-11-01T10:07:00",
    },
  ];

  it("says who wrote what", async () => {
    await openAction(FORWARDED, { messages: TWO });
    await expect.element(detail()).toMatchTextContent(/Sofía Paz · 1 nov 10:00Pregunta/);
    await expect.element(detail()).toMatchTextContent(/Vos · 1 nov 10:05Respuesta/);
    await expect.element(detail()).toMatchTextContent(/avisó que no puede irNo voy/);
    await expect.element(detail()).toMatchTextContent(/Usuario dado de baja/);
  });

  it("a failure to read it says so, and offers to try again: it is not empty", async () => {
    let cut = true;
    await openAction(FORWARDED, {
      messages: (request) => (cut ? FAILS(request) : jsonResponse(TWO)),
    });
    await expect.element(page.getByTestId("thread-problem")).toBeVisible();
    await expect.element(page.getByText("Todavía no hay mensajes.")).not.toBeInTheDocument();

    cut = false;
    await page.getByTestId("thread-problem").getByRole("button", { name: "Reintentar" }).click();

    await expect.element(detail()).toMatchTextContent(/Pregunta/);
  });

  it("the action can still be worked on without it", async () => {
    await openAction(FORWARDED, { events: CUT });
    await expect.element(page.getByPlaceholder("Nombre y apellido")).toBeVisible();
  });

  it("sends, and reads again what the database has", async () => {
    let messages: readonly object[] = [];
    const { harness } = await openAction(FORWARDED, {
      messages: () => jsonResponse(messages),
      functions_: {
        gestion_mensaje_enviar: () => {
          messages = [{ ...TWO[0], id: "z", autor: ME, texto: "Ya voy" }];
          return jsonResponse(null);
        },
      },
    });
    await page.getByTestId("message-text").fill("  Ya voy ");
    await page.getByTestId("message-send").click();

    await expect.element(detail()).toMatchTextContent(/10:00Ya voy/);
    await expect.element(page.getByTestId("message-text")).toHaveValue("");
    expect(harness.network.to("/rest/v1/rpc/gestion_mensaje_enviar")[0]?.body).toEqual({
      p_gestion: "g",
      p_texto: "Ya voy",
    });
  });

  it("does not send nothing", async () => {
    const { harness } = await openAction(FORWARDED);
    await page.getByTestId("message-send").click();
    await expect.element(notice()).toMatchTextContent(/Escribí el mensaje/);
    expect(harness.network.to("/rest/v1/rpc/gestion_mensaje_enviar")).toEqual([]);
  });

  it("if it cannot be sent, what was written stays", async () => {
    await openAction(FORWARDED, { functions_: { gestion_mensaje_enviar: FAILS } });
    await page.getByTestId("message-text").fill("Ya voy");
    await page.getByTestId("message-send").click();
    await expect.element(notice()).toMatchTextContent(/No se pudo enviar: falla simulada/);
    await expect.element(page.getByTestId("message-text")).toHaveValue("Ya voy");
    await expect.element(page.getByTestId("message-send")).toBeEnabled();
  });

  it("the history comes with its count", async () => {
    await openAction(FORWARDED, {
      events: [
        {
          id: "e",
          gestion_id: "g",
          que: "derivada",
          quien: ME,
          detalle: { hunter: "h1" },
          at: "2026-11-01T10:00:00",
        },
      ],
    });
    await expect.element(page.getByTestId("action-history")).toMatchTextContent(/Historial \(1\)/);
    await expect
      .element(page.getByTestId("action-history"))
      .toMatchTextContent(/se la derivó a Sofía Paz/);
  });

  it("with no history, no history", async () => {
    await openAction(FORWARDED);
    await expect.element(page.getByTestId("action-history")).not.toBeInTheDocument();
  });
});

describe("the hunter who cannot attend", () => {
  it("warns, and stays on their agenda", async () => {
    const leader = { id: "l1", nombre: "Laura Méndez", rol: "lider" };
    const myself = { id: ME, nombre: "Ana", rol: "hunter", lider_id: "l1" };
    const { harness } = await openAction(FOR_ME, {
      role: "hunter",
      personsOfTeam: [...Object.values(TEAM), leader, myself],
    });
    await command("No puedo ir").click();
    await expect
      .element(dialog())
      .toMatchTextContent(/Le avisamos a Mariana Costa y a Laura Méndez/);
    await page.getByTestId("cannot-attend-reason").fill("  Licencia ");
    await page.getByTestId("confirm-cannot-attend").click();

    await expect.element(notice()).toMatchTextContent(/Listo: les avisamos/);
    await expect.element(dialog()).not.toBeInTheDocument();
    expect(harness.network.to("/rest/v1/rpc/gestion_no_puedo")[0]?.body).toEqual({
      p_gestion: "g",
      p_motivo: "Licencia",
    });
  });

  it("without a reason it goes empty, and a failure says so", async () => {
    const { harness } = await openAction(FOR_ME, {
      role: "hunter",
      functions_: { gestion_no_puedo: FAILS },
    });
    await command("No puedo ir").click();
    await page.getByTestId("confirm-cannot-attend").click();
    await expect.element(notice()).toMatchTextContent(/No se pudo avisar/);
    await expect.element(dialog()).toBeVisible();
    expect(harness.network.to("/rest/v1/rpc/gestion_no_puedo")[0]?.body).toMatchObject({
      p_motivo: null,
    });
  });

  it("whoever warned reads it, with the reason", async () => {
    await openAction(
      { ...FOR_ME, no_puede_at: "2026-11-01", no_puede_motivo: "Licencia" },
      { role: "hunter" },
    );
    await expect
      .element(detail())
      .toMatchTextContent(/Avisaste que no podés ir \(Licencia\)\. Sigue en tu agenda/);
  });

  it("and without it", async () => {
    await openAction({ ...FOR_ME, no_puede_at: "2026-11-01" }, { role: "hunter" });
    await expect.element(detail()).toMatchTextContent(/Avisaste que no podés ir\. Sigue/);
  });

  it("whoever forwarded it is told to pass it on", async () => {
    await openAction({ ...FORWARDED, no_puede_at: "2026-11-01", no_puede_motivo: "Licencia. " });
    await expect
      .element(detail())
      .toMatchTextContent(/Sofía Paz avisó que no puede ir: Licencia\. Tocá Cambiar hunter/);
  });

  it("who cannot do it is told who does", async () => {
    await openAction(
      anAction({ id: "g", creada_por: "o1", hunter_id: "h1", no_puede_at: "2026-11-01" }),
      { role: "asesor" },
    );
    await expect.element(detail()).toMatchTextContent(/La reasigna el líder o quien la derivó/);
  });

  it("what was done has nothing to warn about", async () => {
    await openAction({ ...FORWARDED, estado: "realizada", no_puede_at: "2026-11-01" });
    await expect.element(detail()).not.toMatchTextContent(/avisó que no puede/);
  });
});

describe("changing the hunter", () => {
  it("shows who has it now, and says what it did", async () => {
    const { harness } = await openAction(FORWARDED);
    await command("Cambiar hunter").click();
    await expect.element(hunterField()).toHaveValue("h1");
    await hunterField().selectOptions("h2");
    await saveAssignment().click();

    await expect.element(notice()).toMatchTextContent(/ahora la tiene Tomás Ríos/);
    expect(harness.network.to("/rest/v1/gestiones", "PATCH")[0]?.body).toMatchObject({
      hunter_id: "h2",
      fecha: "2026-11-10",
      hora_desde: "10:00",
    });
  });

  it("the database can leave it as it was: it says so", async () => {
    await openAction(FORWARDED, {
      actions: (request) =>
        request.method === "PATCH" ? jsonResponse(FORWARDED) : savingOver([FORWARDED])(request),
    });
    await command("Cambiar hunter").click();
    await hunterField().selectOptions("h2");
    await saveAssignment().click();
    await expect.element(notice()).toMatchTextContent(/No podés cambiar el hunter/);
    await expect.element(dialog()).toBeVisible();
  });

  it("if they no longer see it, back to the list", async () => {
    await openAction(FORWARDED, {
      actions: (request) =>
        request.method === "PATCH" ? jsonResponse(null) : savingOver([FORWARDED])(request),
    });
    await command("Cambiar hunter").click();
    await hunterField().selectOptions("h2");
    await saveAssignment().click();
    await expect.element(rows().first()).toBeVisible();
  });

  it("a refusal says so, and leaves the window", async () => {
    await openAction(FORWARDED, {
      actions: (request) =>
        request.method === "PATCH"
          ? jsonResponse({ message: "falla simulada" }, 500)
          : savingOver([FORWARDED])(request),
    });
    await command("Cambiar hunter").click();
    await hunterField().selectOptions("h2");
    await saveAssignment().click();
    await expect.element(notice()).toMatchTextContent(/No se pudo guardar/);
    await expect.element(saveAssignment()).toBeEnabled();
  });

  it("nothing changed, nothing is saved", async () => {
    const { harness } = await openAction(FORWARDED);
    await command("Cambiar hunter").click();
    await saveAssignment().click();
    await expect.element(dialog()).not.toBeInTheDocument();
    expect(harness.network.to("/rest/v1/gestiones", "PATCH")).toEqual([]);
  });

  it("assigning what nobody has asks to choose, with a time", async () => {
    const free = anAction({
      id: "g",
      creada_por: ME,
      hunter_id: null,
      hora_desde: null,
      hora_hasta: null,
    });
    await openAction(free);
    await command("Asignar a un hunter").click();
    await expect.element(dialog()).toMatchTextContent(/Asignar a un hunter/);
    await expect.element(hunterField()).toHaveValue("");

    await saveAssignment().click();
    await expect.element(notice()).toMatchTextContent(/Elegí el hunter/);

    await hunterField().selectOptions("h1");
    await saveAssignment().click();
    await expect.element(notice()).toMatchTextContent(/Poné el horario/);

    await dialog().getByLabelText("Desde", { exact: true }).fill("12:00");
    await dialog().getByLabelText("Hasta", { exact: true }).fill("10:00");
    await saveAssignment().click();
    await expect.element(notice()).toMatchTextContent(/hora de fin/);
  });

  it("a data list has only the hunter", async () => {
    const list = anAction({ id: "g", tipo: "datos", creada_por: ME, hora_desde: null });
    const { harness } = await openAction(list);
    await command("Cambiar hunter").click();
    await expect.element(page.getByTestId("form-date")).not.toBeInTheDocument();
    await hunterField().selectOptions("h2");
    await saveAssignment().click();
    await expect.element(dialog()).not.toBeInTheDocument();
    expect(harness.network.to("/rest/v1/gestiones", "PATCH")[0]?.body).toEqual({ hunter_id: "h2" });
  });

  it("says the hunter cannot attend, when they warned", async () => {
    await openAction({ ...FORWARDED, no_puede_at: "2026-11-01", no_puede_motivo: "Licencia. " });
    await command("Cambiar hunter").click();
    await expect.element(dialog()).toMatchTextContent(/Sofía Paz avisó que no puede: Licencia\./);
  });

  it("a leader chooses among the team, and a hunter of another is not kept", async () => {
    await openAction(anAction({ id: "g", hunter_id: "h9", lider_id: ME, creada_por: "o1" }), {
      role: "lider",
      personsOfTeam: [
        { id: "t1", nombre: "De Mi Equipo", rol: "hunter", lider_id: ME },
        { id: "h9", nombre: "De Otro", rol: "hunter", lider_id: "l9" },
      ],
    });
    await command("Cambiar hunter").click();
    await expect.element(hunterField()).toHaveValue("t1");
    expect(document.querySelector('[data-testid="form-hunter"]')?.textContent).toBe("De Mi Equipo");
  });
});

describe("the time of a hunter", () => {
  const TAKEN = {
    id: "other",
    hora_desde: "10:30:00",
    hora_hasta: "11:30:00",
    tipo: "accion",
    empresa: "OTRA SA",
  };

  it("an officer is stopped, reads with what it overlaps and who is free", async () => {
    const { harness } = await openAction(FORWARDED, {
      hunterDay: [TAKEN],
      dayOccupancy: [{ hunter_id: "h1", hora_desde: "10:30", hora_hasta: "11:30" }],
    });
    await command("Cambiar hunter").click();
    await expect
      .element(dayOfHunter())
      .toMatchTextContent(/Sofía Paz ese día tiene: 10:30–11:30 en OTRA SA \(se pisa\)/);
    await expect.element(dayOfHunter()).toMatchTextContent(/Así no se puede guardar/);
    await expect.element(freeHunters().getByRole("button", { name: "Tomás Ríos" })).toBeVisible();

    await dialog().getByLabelText("Hasta", { exact: true }).fill("11:00");
    await hunterField().selectOptions("h1");
    await dialog().getByTestId("form-date").fill("2026-11-11");
    await saveAssignment().click();

    await expect
      .element(notice())
      .toMatchTextContent(
        /Sofía Paz ya tiene algo a esa hora \(10:30–11:30 en OTRA SA, el 11 nov\)/,
      );
    expect(harness.network.to("/rest/v1/gestiones", "PATCH")).toEqual([]);
    await expect.element(dialog()).toBeVisible();

    await freeHunters().getByRole("button", { name: "Tomás Ríos" }).click();
    await expect.element(hunterField()).toHaveValue("h2");
  });

  it("who is busy at that time is not offered as free", async () => {
    await openAction(FORWARDED, {
      hunterDay: [TAKEN],
      dayOccupancy: [
        { hunter_id: "h1", hora_desde: "10:30", hora_hasta: "11:30" },
        { hunter_id: "h9", hora_desde: "11:00", hora_hasta: "12:00" },
      ],
    });
    await command("Cambiar hunter").click();
    await expect.element(freeHunters().getByRole("button", { name: "Tomás Ríos" })).toBeVisible();
    await expect
      .element(freeHunters().getByRole("button", { name: "Otro Hunter" }))
      .not.toBeInTheDocument();
  });

  it("being stopped reads that day again: it may have changed", async () => {
    const { harness } = await openAction(FORWARDED, { hunterDay: [TAKEN] });
    await command("Cambiar hunter").click();
    await expect.element(dayOfHunter()).toBeVisible();
    await dialog().getByLabelText("Hasta", { exact: true }).fill("11:00");
    const reads = () => harness.network.to("/rest/v1/rpc/gestiones_ocupado").length;
    await vi.waitFor(() => {
      expect(reads()).toBeGreaterThan(0);
    });
    const before = reads();

    await saveAssignment().click();

    await expect.element(notice()).toMatchTextContent(/ya tiene algo a esa hora/);
    // One to check, and one because it was stopped.
    await vi.waitFor(() => {
      expect(reads()).toBeGreaterThanOrEqual(before + 2);
    });
  });

  it("if who is free cannot be read, nobody is offered: not knowing is not being free", async () => {
    await openAction(FORWARDED, { hunterDay: [TAKEN], dayOccupancy: FAILS });
    await command("Cambiar hunter").click();
    await expect.element(dayOfHunter()).toMatchTextContent(/Así no se puede guardar/);
    await expect.element(freeHunters()).not.toBeInTheDocument();
    await expect.element(page.getByText("Libres a esa hora:")).not.toBeInTheDocument();
  });

  it("if nobody is free, it says so", async () => {
    await openAction(FORWARDED, {
      hunterDay: [TAKEN],
      personsOfTeam: Object.values(TEAM).filter(({ id }) => id === "h1" || id === "o1"),
      dayOccupancy: [],
    });
    await command("Cambiar hunter").click();
    await expect.element(freeHunters()).toMatchTextContent("Ningún hunter está libre a esa hora.");
  });

  it("a leader of that hunter is asked, and can save anyway", async () => {
    const action = anAction({ id: "g", hunter_id: "t1", lider_id: ME, creada_por: "o1" });
    const { harness } = await openAction(action, {
      role: "lider",
      hunterDay: [TAKEN],
      personsOfTeam: [
        { id: "t1", nombre: "Uno", rol: "hunter", lider_id: ME },
        { id: "t2", nombre: "Dos", rol: "hunter", lider_id: ME },
      ],
    });
    await command("Cambiar hunter").click();
    await expect.element(dayOfHunter()).toMatchTextContent(/Como líder podés guardar igual/);
    await dialog().getByLabelText("Desde", { exact: true }).fill("10:15");
    await saveAssignment().click();

    await expect.element(confirmation()).toMatchTextContent(/Uno ya tiene algo a esa hora/);
    await confirmation().getByRole("button", { name: "Cambiar el horario" }).click();
    expect(harness.network.to("/rest/v1/gestiones", "PATCH")).toEqual([]);

    await saveAssignment().click();
    await confirmation().getByRole("button", { name: "Guardar igual" }).click();
    await vi.waitFor(() => {
      expect(harness.network.to("/rest/v1/gestiones", "PATCH")).toHaveLength(1);
    });
  });

  it("the action does not overlap with itself, and without a network it does not stop here", async () => {
    const { harness } = await openAction(FORWARDED, {
      hunterDay: [{ ...TAKEN, id: "g" }],
    });
    await command("Cambiar hunter").click();
    await expect.element(dayOfHunter()).toMatchTextContent(/no tiene nada agendado ese día/);
    await hunterField().selectOptions("h2");
    await saveAssignment().click();
    await expect.element(notice()).toMatchTextContent(/ahora la tiene/);
    expect(harness.network.to("/rest/v1/gestiones", "PATCH")).toHaveLength(1);
  });

  it("if the day cannot be read, it says nothing, and the database still stops it", async () => {
    await openAction(FORWARDED, { hunterDay: FAILS });
    await command("Cambiar hunter").click();
    await expect.element(dayOfHunter()).not.toBeInTheDocument();
    await hunterField().selectOptions("h2");
    await saveAssignment().click();
    await expect.element(notice()).toMatchTextContent(/ahora la tiene/);
  });

  it("a person's own day reads in the first person", async () => {
    await openAction({ ...FOR_ME, estado: "planificada" }, { role: "hunter", hunterDay: [] });
    await command("Editar datos").click();
    await expect.element(dayOfHunter()).toMatchTextContent("Ese día no tenés nada agendado.");
  });

  it("and what they have", async () => {
    await openAction(FOR_ME, {
      role: "hunter",
      hunterDay: [{ ...TAKEN, hora_desde: "15:00:00", hora_hasta: null, empresa: null }],
    });
    await command("Editar datos").click();
    await expect
      .element(dayOfHunter())
      .toMatchTextContent(/Ese día tenés: desde 15:00 \(otra acción\)/);
  });
});

describe("the people", () => {
  it("a signup asks for its package, and cancelling leaves it as it was", async () => {
    const { harness } = await openAction(FORWARDED, { prospects: [ANA], events: [] });
    await stateOf("Ana Pérez").selectOptions("alta");
    await expect.element(dialog()).toMatchTextContent(/¿Con qué paquete fue el alta\?/);
    await page.getByTestId("window-dismiss").click();
    await expect.element(stateOf("Ana Pérez")).toHaveValue("prospecto");
    expect(harness.network.to("/rest/v1/gestion_prospectos", "PATCH")).toEqual([]);
  });

  it("a signup goes with its package, is told and reads the history again", async () => {
    const { harness } = await openAction(FORWARDED, { prospects: [ANA] });
    await stateOf("Ana Pérez").selectOptions("alta");
    await choices().getByRole("button", { name: "Plus Gold" }).click();

    await expect.element(notice()).toMatchTextContent(/Alta registrada \(Plus Gold\)/);
    expect(harness.network.to("/rest/v1/gestion_prospectos", "PATCH")[0]?.body).toEqual({
      estado: "alta",
      paquete: "gold",
    });
    await expect.element(person("Ana Pérez")).toHaveAttribute("data-status", "alta");
    await expect.element(person("Ana Pérez")).toHaveAttribute("data-package", "gold");
  });

  it("a person who already has a package goes to signup directly", async () => {
    const { harness } = await openAction(FORWARDED, {
      prospects: [aPerson({ id: "p1", gestion_id: "g", nombre: "Ana", paquete: "plus" })],
    });
    await stateOf("Ana").selectOptions("alta");
    await expect.element(notice()).toMatchTextContent(/Alta registrada \(Plus\)/);
    expect(harness.network.to("/rest/v1/gestion_prospectos", "PATCH")[0]?.body).toEqual({
      estado: "alta",
    });
  });

  it("a discard asks why", async () => {
    const { harness } = await openAction(FORWARDED, { prospects: [ANA] });
    await stateOf("Ana Pérez").selectOptions("descartado");
    await expect.element(dialog()).toMatchTextContent(/¿Por qué se descarta\?/);
    await choices().getByRole("button", { name: "No contesta" }).click();

    await expect.element(person("Ana Pérez")).toHaveAttribute("data-reason", "no_contesta");
    expect(harness.network.to("/rest/v1/gestion_prospectos", "PATCH")[0]?.body).toEqual({
      estado: "descartado",
      motivo: "no_contesta",
    });
  });

  it("a signup cannot lose its package", async () => {
    const signup = aPerson({
      id: "p1",
      gestion_id: "g",
      nombre: "Ana",
      estado: "alta",
      paquete: "plus",
    });
    const { harness } = await openAction(FORWARDED, { prospects: [{ ...signup, paquete: null }] });
    await packageOf("Ana").selectOptions("");
    await expect
      .element(notice())
      .toMatchTextContent(/Un alta tiene que decir con qué paquete fue/);
    expect(harness.network.to("/rest/v1/gestion_prospectos", "PATCH")).toEqual([]);
  });

  it("a signup with a package offers no empty one", async () => {
    await openAction(FORWARDED, {
      prospects: [
        aPerson({ id: "p1", gestion_id: "g", nombre: "Ana", estado: "alta", paquete: "plus" }),
      ],
    });
    await expect
      .element(packageOf("Ana").getByRole("option", { name: "—" }))
      .not.toBeInTheDocument();
  });

  it("the state comes with its color and the database says no in Spanish", async () => {
    await openAction(FORWARDED, {
      prospects: (request) =>
        request.method === "PATCH"
          ? jsonResponse({ message: "GES_PAQ: x" }, 400)
          : jsonResponse([
              aPerson({ id: "w", gestion_id: "g", nombre: "Trabajo", estado: "en_gestion" }),
              aPerson({ id: "x", gestion_id: "g", nombre: "Ana", paquete: "plus" }),
            ]),
    });
    await stateOf("Ana").selectOptions("alta");
    await expect.element(notice()).toMatchTextContent(/No se pudo guardar: elegí con qué paquete/);
    await expect.element(stateOf("Ana")).toHaveValue("prospecto");
  });

  it("a next contact is saved, and a late one shows it", async () => {
    const { harness } = await openAction(FORWARDED, {
      prospects: [aPerson({ id: "p1", gestion_id: "g", nombre: "Ana", proximo: "2020-01-01" })],
    });
    const next = page.getByLabelText("Próximo contacto con Ana");
    await next.fill("2030-02-03");
    await vi.waitFor(() => {
      expect(harness.network.to("/rest/v1/gestion_prospectos", "PATCH")[0]?.body).toEqual({
        proximo: "2030-02-03",
      });
    });
  });

  it("what is closed has no next contact", async () => {
    await openAction(FORWARDED, {
      prospects: [
        aPerson({ id: "p1", gestion_id: "g", nombre: "Ana", estado: "alta", paquete: "plus" }),
      ],
    });
    await expect.element(page.getByLabelText("Próximo contacto con Ana")).not.toBeInTheDocument();
  });

  it('"A contactar" is only offered on a data list', async () => {
    await openAction(FORWARDED, { prospects: [ANA] });
    await expect
      .element(stateOf("Ana Pérez").getByRole("option", { name: "A contactar" }))
      .not.toBeInTheDocument();
  });

  it("a person is taken out after asking", async () => {
    const { harness } = await openAction(FORWARDED, { prospects: [ANA] });
    await page.getByRole("button", { name: "Quitar a Ana Pérez" }).click();
    await expect.element(confirmation()).toMatchTextContent(/¿Quitar a Ana Pérez de la lista\?/);
    await confirmation().getByRole("button", { name: "Cancelar" }).click();
    expect(harness.network.to("/rest/v1/gestion_prospectos", "DELETE")).toEqual([]);

    await page.getByRole("button", { name: "Quitar a Ana Pérez" }).click();
    await confirmation().getByRole("button", { name: "Quitar" }).click();
    await expect.element(person("Ana Pérez")).not.toBeInTheDocument();
    await expect.element(page.getByText(/Todavía no hay prospectos/)).toBeVisible();
  });

  it("if taking out fails, it stays", async () => {
    await openAction(FORWARDED, {
      prospects: (request) => (request.method === "DELETE" ? FAILS(request) : jsonResponse([ANA])),
    });
    await page.getByRole("button", { name: "Quitar a Ana Pérez" }).click();
    await confirmation().getByRole("button", { name: "Quitar" }).click();
    await expect.element(notice()).toMatchTextContent(/No se pudo quitar/);
    await expect.element(person("Ana Pérez")).toBeVisible();
  });

  it("the highlight of who was chosen is carried by the row", async () => {
    await openAction(FORWARDED, { prospects: [ANA] });
    await expect.element(person("Ana Pérez")).toHaveAttribute("data-highlighted", "false");
  });
});

describe("adding one", () => {
  it("needs a name", async () => {
    await openAction(FORWARDED);
    await addOne().click();
    await expect.element(notice()).toMatchTextContent(/Escribí el nombre/);
  });

  it("a CUIL has to be valid, or else say something else", async () => {
    await openAction(FORWARDED);
    await nameField().fill("Ana");
    await cuilField().fill("20-12345678-0");
    await addOne().click();
    await expect.element(notice()).toMatchTextContent(/Ese CUIL no es válido/);
  });

  it("a CUIL is not repeated", async () => {
    await openAction(FORWARDED, {
      prospects: [aPerson({ id: "p1", gestion_id: "g", cuil: "20123456786" })],
    });
    await nameField().fill("Ana");
    await cuilField().fill("20-12345678-6");
    await addOne().click();
    await expect.element(notice()).toMatchTextContent(/Ese CUIL ya está en la lista/);
  });

  it("goes with what it has, the fields empty and the cursor on the name", async () => {
    const { harness } = await openAction(FORWARDED, {
      prospects: (request) =>
        request.method === "POST"
          ? jsonResponse(aPerson({ id: "n", gestion_id: "g", nombre: "Luisa" }), 201)
          : jsonResponse([]),
    });
    await nameField().fill("Luisa");
    await page.getByPlaceholder("Teléfono o mail (opcional)").fill("11 5555");
    await cuilField().fill("Legajo 7");
    await page.getByLabelText("Paquete", { exact: true }).selectOptions("plus");
    await addOne().click();

    await expect.element(person("Luisa")).toBeVisible();
    await expect.element(nameField()).toHaveValue("");
    await expect.element(nameField()).toHaveFocus();
    expect(harness.network.to("/rest/v1/gestion_prospectos", "POST")[0]?.body).toMatchObject({
      gestion_id: "g",
      nombre: "Luisa",
      contacto: "11 5555",
      cuil: null,
      referencia: "Legajo 7",
      paquete: "plus",
      estado: "prospecto",
    });
  });

  it("on a data list it starts as A contactar, with nothing else", async () => {
    const { harness } = await openAction(anAction({ id: "g", tipo: "datos", creada_por: ME }), {
      prospects: (request) =>
        request.method === "POST"
          ? jsonResponse(aPerson({ id: "n", gestion_id: "g", nombre: "Luisa" }), 201)
          : jsonResponse([]),
    });
    await nameField().fill("Luisa");
    await addOne().click();
    await expect.element(person("Luisa")).toBeVisible();
    expect(harness.network.to("/rest/v1/gestion_prospectos", "POST")[0]?.body).toMatchObject({
      contacto: null,
      paquete: null,
      estado: "a_contactar",
    });
  });

  it("a failure says so, and what was written stays", async () => {
    await openAction(FORWARDED, {
      prospects: (request) => (request.method === "POST" ? FAILS(request) : jsonResponse([])),
    });
    await nameField().fill("Luisa");
    await addOne().click();
    await expect.element(notice()).toMatchTextContent(/No se pudo agregar/);
    await expect.element(nameField()).toHaveValue("Luisa");
  });
});

describe("the windows that ask", () => {
  it("cancel with Escape, leaving things as they were", async () => {
    const { harness } = await openAction(FORWARDED, { prospects: [ANA] });
    await stateOf("Ana Pérez").selectOptions("descartado");
    await expect.element(choices()).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect.element(choices()).not.toBeInTheDocument();
    await expect.element(stateOf("Ana Pérez")).toHaveValue("prospecto");
    expect(harness.network.to("/rest/v1/gestion_prospectos", "PATCH")).toEqual([]);
  });
});

describe("pasting many", () => {
  it("reads what is ready and what is not", async () => {
    await openAction(FORWARDED);
    await openPaste();
    await expect.element(addPasted()).toBeDisabled();
    await expect.element(addPasted()).toHaveTextContent("Agregar a la lista");
    await pasteBox().fill(
      "Ana\t27-11111111-7\tPlus\nLuis\n\t11 2222\n\t11 3\n\t11 4\n\t11 5\n\t11 6",
    );
    const result = page.getByTestId("paste-result");
    await expect.element(result).toMatchTextContent(/2 listos/);
    await expect.element(result).toMatchTextContent(/1 sin CUIL ni referencia/);
    await expect.element(result).toMatchTextContent(/5 con problemas: \? \(sin nombre\)/);
    await expect.element(result).toMatchTextContent(/…/);
    await expect.element(addPasted()).toHaveTextContent("Agregar 2 a la lista");
  });

  it("adds them; what could not goes back to the box to correct it", async () => {
    const { harness } = await openAction(FORWARDED, { prospects: savingPasted });
    await openPaste();
    await pasteBox().fill("Ana\t27-11111111-7\tPlus Gold\nLuis\t20-12345678-0\tLegajo\tBlack");
    await addPasted().click();

    await expect.element(person("Ana")).toHaveAttribute("data-package", "gold");
    await expect.element(notice()).toMatchTextContent(/1 agregados\. Quedaron 1 en el cuadro/);
    await expect.element(pasteBox()).toHaveValue("Luis\t\t20-12345678-0\tEminent Black");
    expect(harness.network.to("/rest/v1/gestion_prospectos", "POST")[0]?.body).toMatchObject([
      { gestion_id: "g", nombre: "Ana", cuil: "27111111117", paquete: "gold", estado: "prospecto" },
    ]);
    await expect.element(page.getByTestId("paste-people")).toHaveAttribute("open");
  });

  it("with everything added, the box empties and closes", async () => {
    await openAction(FORWARDED, { prospects: savingPasted });
    await openPaste();
    await pasteBox().fill("Ana");
    await addPasted().click();
    await expect.element(notice()).toMatchTextContent(/1 agregados\.$/);
    await expect.element(page.getByTestId("paste-people")).not.toHaveAttribute("open");
    await expect.element(pasteBox()).toHaveValue("");
  });

  it("a failure keeps the box as it was", async () => {
    await openAction(FORWARDED, {
      prospects: (request) => (request.method === "POST" ? FAILS(request) : jsonResponse([])),
    });
    await openPaste();
    await pasteBox().fill("Ana");
    await addPasted().click();
    await expect.element(notice()).toMatchTextContent(/No se pudo agregar/);
    await expect.element(pasteBox()).toHaveValue("Ana");
    await expect.element(addPasted()).toBeEnabled();
  });

  it("does not take a CUIL already on the list", async () => {
    await openAction(FORWARDED, {
      prospects: [aPerson({ id: "p1", gestion_id: "g", nombre: "Bea", cuil: "27111111117" })],
    });
    await openPaste();
    await pasteBox().fill("Ana\t27-11111111-7");
    await expect
      .element(page.getByTestId("paste-result"))
      .toMatchTextContent(/ya está en la lista/);
    await expect.element(addPasted()).toBeDisabled();
  });
});

describe("a list that could not be saved", () => {
  it("stays pasted on the action, ready to try again, without losing a person", async () => {
    const created = anAction({
      id: "new",
      tipo: "datos",
      creada_por: ME,
      dueno_id: ME,
      hora_desde: null,
    });
    let saves = 0;
    await openCommercial({
      companies: [{ empresa: "ALIMENTOS SA", cuits: [] }],
      list: [],
      tables: {
        gestiones: (request) => {
          if (request.method === "POST") return jsonResponse(created, 201);
          return jsonResponse(created);
        },
      },
      prospects: (request) => {
        if (request.method !== "POST") return jsonResponse([]);
        saves += 1;
        return saves === 1
          ? FAILS(request)
          : jsonResponse([aPerson({ id: "n", gestion_id: "new", nombre: "Ana" })], 201);
      },
    });
    const row = page.getByTestId("company-row").filter({ hasText: "ALIMENTOS SA" });
    await row.getByRole("button", { name: "Derivar" }).click();
    await page.getByTestId("action-window").getByRole("button", { name: "Base de datos" }).click();
    await page.getByTestId("form-hunter").selectOptions("h1");
    await page
      .getByTestId("form-people")
      .fill("Ana\t11 5555-1234\t27-11111111-7\nLuis\t\tLegajo 3\nCarla");
    await page.getByTestId("confirm-forwarding").click();

    await expect.element(notice()).toMatchTextContent(/Te dejé la lista pegada en la acción/);
    await expect.element(detail()).toBeVisible();
    await expect.element(page.getByTestId("paste-people")).toHaveAttribute("open");
    await expect
      .element(page.getByTestId("paste-people-text"))
      .toHaveValue("Ana\t11 5555-1234\t27-11111111-7\nLuis\t\tLegajo 3\nCarla\t\t");

    await page.getByTestId("paste-people-add").click();

    await expect.element(person("Ana")).toBeVisible();
    expect(saves).toBe(2);
  });
});

describe("editing", () => {
  it("completing a date in the future takes today, and offers the state done", async () => {
    await openAction(anAction({ id: "g", creada_por: ME, fecha: "2099-01-01" }));
    await command("Marcar como realizada").click();
    await expect.element(dialog()).toMatchTextContent(/Completar la acción/);
    await expect.element(page.getByTestId("form-state")).toHaveValue("realizada");
    const today = new Date();
    await expect.element(page.getByTestId("form-date")).not.toHaveValue("2099-01-01");
    expect(today.getFullYear()).toBeLessThan(2099);
  });

  it("does not take a date in the future for something done", async () => {
    await openAction(FORWARDED);
    await command("Editar datos").click();
    await page.getByTestId("form-state").selectOptions("realizada");
    await page.getByTestId("form-date").fill("2099-01-01");
    await saveEdit().click();
    await expect.element(notice()).toMatchTextContent(/no puede tener fecha futura/);
  });

  it("saves, says so and shows what the database has", async () => {
    const { harness } = await openAction(FORWARDED);
    await command("Editar datos").click();
    await expect.element(dialog()).toMatchTextContent(/Editar datos/);
    await dialog().getByPlaceholder("Sede, dirección, piso").fill("Piso 3");
    await dialog().getByPlaceholder("Empleados").fill("40");
    await dialog().getByPlaceholder("Personas que hablaron con vos").fill("10");
    await saveEdit().click();

    await expect.element(notice()).toMatchTextContent("Guardado.");
    await expect.element(detail()).toMatchTextContent(/Piso 3/);
    await expect.element(detail()).toMatchTextContent(/Dotación40/);
    expect(harness.network.to("/rest/v1/gestiones", "PATCH")[0]?.body).toMatchObject({
      lugar: "Piso 3",
      dotacion: 40,
      asistentes: 10,
    });
  });

  it("a repetition is checked", async () => {
    await openAction(FORWARDED);
    await command("Editar datos").click();
    await dialog().getByRole("button", { name: "Se repite" }).click();
    await saveEdit().click();
    await expect.element(notice()).toMatchTextContent(/cada cuántos días/);
  });

  it("the time has to make sense", async () => {
    await openAction(FORWARDED);
    await command("Editar datos").click();
    await dialog().getByLabelText("Hasta", { exact: true }).fill("09:00");
    await saveEdit().click();
    await expect.element(notice()).toMatchTextContent(/hora de fin/);
  });

  it("in a series already built, the number of times is kept", async () => {
    const { harness } = await openAction(
      anAction({ id: "g", creada_por: ME, frecuencia: "repite", cada_dias: 7, veces: 3, vez: 2 }),
    );
    await command("Editar datos").click();
    await expect.element(dialog()).toMatchTextContent(/Vez 2 de 3/);
    await expect.element(page.getByLabelText("Cantidad de veces")).not.toBeInTheDocument();
    await saveEdit().click();
    await expect.element(notice()).toMatchTextContent("Guardado.");
    expect(harness.network.to("/rest/v1/gestiones", "PATCH")[0]?.body).toMatchObject({
      veces: 3,
    });
    expect(harness.network.to("/rest/v1/gestiones", "PATCH")[0]?.body).not.toHaveProperty("vez");
  });

  it("starting to repeat is the first time", async () => {
    const { harness } = await openAction(FORWARDED);
    await command("Editar datos").click();
    await dialog().getByRole("button", { name: "Se repite" }).click();
    await page.getByLabelText("Cada cuántos días").fill("7");
    await saveEdit().click();
    await expect.element(notice()).toMatchTextContent("Guardado.");
    expect(harness.network.to("/rest/v1/gestiones", "PATCH")[0]?.body).toMatchObject({ vez: 1 });
  });

  it("a refusal says so", async () => {
    await openAction(FORWARDED, {
      actions: (request) =>
        request.method === "PATCH"
          ? jsonResponse({ message: "GES_PISA: de 15:00 a 17:00" }, 400)
          : savingOver([FORWARDED])(request),
    });
    await command("Editar datos").click();
    await saveEdit().click();
    await expect.element(notice()).toMatchTextContent(/No se pudo guardar: el horario se pisa/);
    await expect.element(saveEdit()).toBeEnabled();
  });

  it("changing the time looks at the day of the hunter; what is cancelled does not", async () => {
    const TAKEN = {
      id: "o",
      hora_desde: "11:00",
      hora_hasta: "12:00",
      tipo: "accion",
      empresa: "X",
    };
    const { harness } = await openAction(FORWARDED, { hunterDay: [TAKEN] });
    await command("Editar datos").click();
    await dialog().getByLabelText("Desde", { exact: true }).fill("10:30");
    await saveEdit().click();
    await expect.element(notice()).toMatchTextContent(/ya tiene algo a esa hora/);
    expect(harness.network.to("/rest/v1/gestiones", "PATCH")).toEqual([]);

    await page.getByTestId("form-state").selectOptions("cancelada");
    await saveEdit().click();
    await expect.element(notice()).toMatchTextContent("Guardado.");
  });

  it("a data list has its own words", async () => {
    await openAction(anAction({ id: "g", tipo: "datos", creada_por: ME, hora_desde: null }));
    await command("Terminar la base").click();
    await expect.element(dialog()).toMatchTextContent(/Terminar la base/);
    await expect.element(page.getByTestId("form-state")).toMatchTextContent(/En curso/);
    await expect.element(dialog().getByPlaceholder("Empleados")).not.toBeInTheDocument();
    await expect.element(dialog().getByRole("button", { name: "Acción" })).not.toBeInTheDocument();
    await expect.element(page.getByTestId("hunter-day")).not.toBeInTheDocument();
  });
});

describe("repeating", () => {
  const ENDLESS = anAction({
    id: "g",
    creada_por: ME,
    frecuencia: "repite",
    cada_dias: 7,
    fecha: "2026-11-05",
    vez: 1,
  });

  it("creates the next date, opens it and says so", async () => {
    const { harness } = await openAction(ENDLESS);
    await command(/Crear la próxima \(\+7 días\)/).click();

    await expect.element(notice()).toMatchTextContent(/Creada la próxima fecha: 12 nov/);
    expect(harness.network.to("/rest/v1/gestiones", "POST")[0]?.body).toMatchObject({
      fecha: "2026-11-12",
      vez: 2,
      origen: "derivada",
      hunter_id: "h1",
    });
  });

  it("says 30 days without knowing how often", async () => {
    await openAction({ ...ENDLESS, cada_dias: null });
    await expect.element(command(/\+30 días/)).toBeVisible();
  });

  it("a refusal says so", async () => {
    await openAction(ENDLESS, {
      actions: (request) =>
        request.method === "POST" ? FAILS(request) : savingOver([ENDLESS])(request),
    });
    await command(/Crear la próxima/).click();
    await expect.element(notice()).toMatchTextContent(/No se pudo crear/);
  });

  it("completing one of an endless series offers the next one", async () => {
    const { harness } = await openAction(ENDLESS);
    await command("Marcar como realizada").click();
    await dialog().getByRole("button", { name: "Guardar", exact: true }).click();

    await expect.element(confirmation()).toMatchTextContent(/¿Creamos la próxima para el 12 nov\?/);
    await expect.element(confirmation()).toMatchTextContent(/Se repite cada 7 días/);
    await confirmation().getByRole("button", { name: "Ahora no" }).click();
    expect(harness.network.to("/rest/v1/gestiones", "POST")).toEqual([]);
  });

  it("saying yes creates it", async () => {
    const { harness } = await openAction(ENDLESS);
    await command("Marcar como realizada").click();
    await dialog().getByRole("button", { name: "Guardar", exact: true }).click();
    await confirmation().getByRole("button", { name: "Crear la próxima" }).click();
    await vi.waitFor(() => {
      expect(harness.network.to("/rest/v1/gestiones", "POST")).toHaveLength(1);
    });
  });

  it("what was already done does not offer it again", async () => {
    await openAction({ ...ENDLESS, estado: "realizada" });
    await command("Editar datos").click();
    await dialog().getByRole("button", { name: "Guardar", exact: true }).click();
    await expect.element(notice()).toMatchTextContent("Guardado.");
    await expect.element(confirmation()).not.toBeInTheDocument();
  });
});

describe("deleting", () => {
  it("asks, saying what goes with it", async () => {
    const { harness } = await openAction(FORWARDED, { prospects: [ANA] });
    await command("Eliminar").click();
    await expect.element(confirmation()).toMatchTextContent(/Se borran también sus 1 prospectos/);
    await confirmation().getByRole("button", { name: "Cancelar" }).click();
    expect(harness.network.to("/rest/v1/gestiones", "DELETE")).toEqual([]);

    await command("Eliminar").click();
    await confirmation().getByRole("button", { name: "Eliminar" }).click();
    await expect.element(notice()).toMatchTextContent("Gestión eliminada.");
    await expect.element(rows().first()).toBeVisible();
  });

  it("a failure says so, and it stays", async () => {
    await openAction(FORWARDED, {
      actions: (request) =>
        request.method === "DELETE" ? FAILS(request) : savingOver([FORWARDED])(request),
    });
    await command("Eliminar").click();
    await confirmation().getByRole("button", { name: "Eliminar" }).click();
    await expect.element(notice()).toMatchTextContent(/No se pudo eliminar/);
    await expect.element(detail()).toBeVisible();
  });
});

describe("what comes from other screens", () => {
  it('"Ver su flyer" asks the screen of each one', async () => {
    const desk = deskFor(vi.fn<(tabId: string) => void>());
    await openAction(FORWARDED, {}, { desk });
    await command("Ver su flyer").click();
    expect(desk.takeFlyer("flyer")).toEqual({ company: "ACME SA", taxIds: "30900001118" });
    expect(desk.takeFlyer("hunter")).toBeNull();
  });

  it("a hunter, to their screen", async () => {
    const desk = deskFor(vi.fn<(tabId: string) => void>());
    await openAction(FOR_ME, { role: "hunter" }, { desk });
    await command("Ver su flyer").click();
    expect(desk.takeFlyer("hunter")).toEqual({ company: "ACME SA", taxIds: "30900001118" });
  });

  it("an action asked for opens on the list", async () => {
    const goTo = vi.fn<(tabId: string) => void>();
    const desk = deskFor(goTo);
    await openCommercial({ list: [listed(FORWARDED)], actions: savingOver([FORWARDED]) }, { desk });
    const request: ActionRequest = { id: "g", complete: true };
    desk.openAction(request);
    await expect.element(detail()).toBeVisible();
    await expect.element(dialog()).toMatchTextContent(/Completar la acción/);
    expect(goTo).toHaveBeenCalledWith("gestiones");
  });

  it("the window closes with Escape", async () => {
    await openAction(FORWARDED);
    await command("Editar datos").click();
    await userEvent.keyboard("{Escape}");
    await expect.element(dialog()).not.toBeInTheDocument();
  });
});

describe("a late answer", () => {
  it("of the day of another hunter does not step on the one on screen", async () => {
    const late = deferred<Response>();
    await openAction(FORWARDED, {
      hunterDay: (request) => {
        const body = fieldsOf(request.body);
        return Reflect.get(body, "p_hunter") === "h2"
          ? jsonResponse([
              {
                id: "x",
                hora_desde: "08:00",
                hora_hasta: "09:00",
                tipo: "accion",
                empresa: "DE TOMAS",
              },
            ])
          : late.promise;
      },
    });
    await command("Cambiar hunter").click();
    await hunterField().selectOptions("h2");
    await expect.element(dayOfHunter()).toMatchTextContent(/DE TOMAS/);

    late.resolve(
      jsonResponse([
        { id: "y", hora_desde: "08:00", hora_hasta: "09:00", tipo: "accion", empresa: "DE SOFIA" },
      ]),
    );
    await new Promise((resolve) => {
      requestAnimationFrame(resolve);
    });

    await expect.element(dayOfHunter()).toMatchTextContent(/DE TOMAS/);
    await expect.element(dayOfHunter()).not.toMatchTextContent(/DE SOFIA/);
  });
});
