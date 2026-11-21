// Mis empresas and the window that forwards one of them.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import {
  type Answer,
  jsonResponse,
  type RecordedRequest,
} from "@/shared/supabase/testing/recording-fetch.ts";
import { dateLabel } from "../model/formatting.ts";
import { FAILS, fieldsOf, ME } from "../testing/commercial-cloud.ts";
import { openCommercial } from "../testing/commercial-on-screen.tsx";
import { aListedAction, anAction, TEAM } from "../testing/fixtures.ts";

const COMPANIES = [
  { empresa: "ALIMENTOS SA", cuits: ["30900001118"] },
  { empresa: "TEXTIL SA", cuits: [] },
];
const table = () => page.getByTestId("companies-table");
const row = (name: string) => page.getByTestId("company-row").filter({ hasText: name });
const notice = () => page.getByRole("status");
const dialog = () => page.getByTestId("action-window");
const confirm = () => page.getByTestId("confirm-forwarding");
const hunterField = () => page.getByTestId("form-hunter");
const pill = (name: string) => dialog().getByRole("button", { name, exact: true });
const desde = () => dialog().getByLabelText("Desde", { exact: true });
const hasta = () => dialog().getByLabelText("Hasta", { exact: true });

const LEADER = { id: "my-leader", nombre: "Líder Mía", rol: "lider" };

function saved(request: { readonly body: unknown }): Response {
  return jsonResponse(
    anAction({ id: "new", ...fieldsOf(request.body), estado: "planificada" }),
    201,
  );
}

function writes(recorded: readonly RecordedRequest[]) {
  return recorded.filter(({ method }) => method === "POST");
}

const refusal: Answer = (request) =>
  request.method === "POST"
    ? jsonResponse({ message: "GES_PISA: ya tiene algo de 15:00 a 17:00 ese día" }, 400)
    : jsonResponse([]);

async function openForward(cloud: Parameters<typeof openCommercial>[0] = {}) {
  const opened = await openCommercial({
    companies: COMPANIES,
    list: [],
    tables: {
      gestiones: (request) => (request.method === "POST" ? saved(request) : jsonResponse([])),
    },
    ...cloud,
  });
  await row("ALIMENTOS SA").getByRole("button", { name: "Derivar" }).click();
  await expect.element(confirm()).toBeVisible();
  return opened;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("Mis empresas", () => {
  it("adds up each company", async () => {
    await openCommercial({
      companies: COMPANIES,
      list: [
        aListedAction({
          empresa: "ALIMENTOS SA",
          dueno_id: ME,
          estado: "realizada",
          n_pros: 8,
          n_altas: 2,
          hunter_id: "h1",
        }),
        aListedAction({ empresa: "ALIMENTOS SA", dueno_id: ME, visto_dueno: false }),
        aListedAction({ empresa: "ALIMENTOS SA", dueno_id: ME }),
      ],
    });
    await expect.element(row("ALIMENTOS SA")).toMatchTextContent(/CUIT 30-90000111-8/);
    await expect.element(row("ALIMENTOS SA")).toMatchTextContent(/2 planificadas/);
    await expect.element(row("ALIMENTOS SA")).toMatchTextContent(/Novedad/);
    await expect.element(row("ALIMENTOS SA")).toMatchTextContent(/25%/);
    await expect.element(row("ALIMENTOS SA")).toMatchTextContent(/Sofía Paz/);
    await expect.element(row("TEXTIL SA")).toMatchTextContent(/—/);
    await expect.element(page.getByText("en tus empresas")).toBeVisible();
  });

  it("says one planned action in the singular", async () => {
    await openCommercial({
      companies: COMPANIES,
      list: [aListedAction({ empresa: "TEXTIL SA", dueno_id: ME })],
    });
    await expect.element(row("TEXTIL SA")).toMatchTextContent(/1 planificada$|1 planificada0/);
  });

  it("filters, says how many, and warns of no matches", async () => {
    await openCommercial({ companies: COMPANIES, list: [] });
    await expect.element(page.getByText("2 empresas", { exact: true })).toBeVisible();
    await page.getByPlaceholder("Buscar en tus empresas (nombre o CUIT)").fill("textil");
    await expect.element(page.getByText("1 de 2 empresas")).toBeVisible();
    await page.getByLabelText("Filtrar empresas").selectOptions("altas");
    await expect.element(table()).toMatchTextContent("Ninguna empresa coincide con ese filtro.");
  });

  it("without companies, says where they are loaded", async () => {
    await openCommercial({ companies: [], list: [] });
    await expect.element(page.getByText(/Todavía no tenés empresas cargadas/)).toBeVisible();
    await expect.element(page.getByText("Acciones realizadas")).toBeVisible();
  });

  it("a failure of the companies is not having none", async () => {
    let cut = true;
    await openCommercial({
      list: [],
      companies: (request) => (cut ? FAILS(request) : jsonResponse(COMPANIES)),
    });
    await expect.element(page.getByTestId("commercial-problem")).toBeVisible();
    await expect.element(page.getByText(/Todavía no tenés empresas/)).not.toBeInTheDocument();
    cut = false;
    await page.getByRole("button", { name: "Reintentar" }).click();
    await expect.element(row("TEXTIL SA")).toBeVisible();
  });

  it("a failure of the actions neither", async () => {
    let cut = true;
    await openCommercial({
      companies: COMPANIES,
      list: (request) => (cut ? FAILS(request) : jsonResponse([])),
    });
    await expect.element(page.getByTestId("commercial-problem")).toBeVisible();
    cut = false;
    await page.getByRole("button", { name: "Reintentar" }).click();
    await expect.element(row("TEXTIL SA")).toBeVisible();
  });

  it("writes what comes from others as text", async () => {
    await openCommercial({ companies: [{ empresa: "<b>ROTA</b> SA", cuits: [] }], list: [] });
    await expect.element(table()).toMatchTextContent("<b>ROTA</b> SA");
  });
});

describe("forwarding", () => {
  it("opens the window with the company, the four types and nobody chosen", async () => {
    await openForward();
    await expect.element(dialog()).toMatchTextContent(/Derivar a un hunter/);
    await expect.element(dialog()).toMatchTextContent(/ALIMENTOS SA CUIT 30-90000111-8/);
    await expect.element(pill("Base de datos")).toBeVisible();
    await expect.element(hunterField()).toHaveValue("");
    await expect.element(hunterField()).toMatchTextContent(/Elegí un hunter/);
  });

  it("closes with Cancelar and with Escape", async () => {
    await openForward();
    await page.getByTestId("window-dismiss").click();
    await expect.element(dialog()).not.toBeInTheDocument();
  });

  it("does not go without a hunter or a time", async () => {
    const { harness } = await openForward();

    await confirm().click();
    await expect.element(notice()).toMatchTextContent(/Elegí el hunter/);

    await hunterField().selectOptions("h1");
    await confirm().click();
    await expect.element(notice()).toMatchTextContent(/Poné el horario/);
    expect(writes(harness.network.to("/rest/v1/gestiones"))).toEqual([]);
  });

  it("the time has to make sense", async () => {
    await openForward();
    await hunterField().selectOptions("h1");
    await desde().fill("12:00");
    await hasta().fill("10:00");
    await confirm().click();
    await expect.element(notice()).toMatchTextContent(/hora de fin/);
  });

  it("Mañana and Tarde fill in the time", async () => {
    await openForward();
    await pill("Mañana").click();
    await expect.element(desde()).toHaveValue("09:00");
    await expect.element(hasta()).toHaveValue("13:00");
    await pill("Tarde").click();
    await expect.element(desde()).toHaveValue("14:00");
    await expect.element(hasta()).toHaveValue("18:00");
  });

  it("goes with the hunter and tells it", async () => {
    const { harness } = await openForward();
    await hunterField().selectOptions("h1");
    await pill("Tarde").click();
    await confirm().click();

    await expect.element(dialog()).not.toBeInTheDocument();
    await expect
      .element(notice())
      .toMatchTextContent(/Derivada a Sofía Paz\. Le aparece en su agenda/);
    expect(writes(harness.network.to("/rest/v1/gestiones"))[0]?.body).toMatchObject({
      empresa: "ALIMENTOS SA",
      origen: "derivada",
      hunter_id: "h1",
      estado: "planificada",
      hora_desde: "14:00",
    });
  });

  it("a refusal of the database leaves the window open, and tells it in Spanish", async () => {
    await openForward({ tables: { gestiones: refusal } });
    await hunterField().selectOptions("h1");
    await pill("Tarde").click();
    await confirm().click();

    await expect.element(notice()).toMatchTextContent(/se pisa con otra acción.*15:00 a 17:00/);
    await expect.element(dialog()).toBeVisible();
    await expect.element(confirm()).toBeEnabled();
  });

  it("leaving it to the leader needs no time, and carries the leader", async () => {
    const { harness } = await openForward({
      personsOfTeam: [...Object.values(TEAM), LEADER],
    });
    await hunterField().selectOptions("__lider");
    await expect.element(page.getByTestId("form-leader")).toBeVisible();
    await page.getByTestId("form-leader").selectOptions("l9");
    await confirm().click();

    await expect.element(notice()).toMatchTextContent(/Queda para que la asigne Otra Líder/);
    await expect.element(notice()).toMatchTextContent(/bandeja "Por asignar"/);
    expect(writes(harness.network.to("/rest/v1/gestiones"))[0]?.body).toMatchObject({
      hunter_id: null,
      lider_id: "l9",
    });
  });

  it("the leader shown is the one that goes, without touching the field", async () => {
    const { harness } = await openForward();
    await hunterField().selectOptions("__lider");
    await confirm().click();

    await expect.element(dialog()).not.toBeInTheDocument();
    expect(writes(harness.network.to("/rest/v1/gestiones"))[0]?.body).toMatchObject({
      lider_id: "l1",
    });
  });

  it("with nobody to choose, it says so", async () => {
    await openForward({ personsOfTeam: [] });
    await expect.element(hunterField()).toMatchTextContent(/No hay hunters activos/);
  });

  it("if they could not be read, it does not say there are none", async () => {
    await openForward({ functions_: { gestiones_personas: FAILS } });
    await expect.element(hunterField()).toMatchTextContent(/No se pudieron traer los hunters/);
    await expect.element(hunterField()).not.toMatchTextContent(/No hay hunters activos/);
  });

  it("carries what is written on the rest of the fields", async () => {
    const { harness } = await openForward();
    await hunterField().selectOptions("h1");
    await pill("Tarde").click();
    await pill("Virtual").click();
    await dialog().getByPlaceholder("Sede, dirección, piso").fill("Piso 2");
    await dialog().getByPlaceholder("Con quién hablar, qué flyer llevar").fill("Con RRHH");
    await confirm().click();

    await expect.element(dialog()).not.toBeInTheDocument();
    expect(writes(harness.network.to("/rest/v1/gestiones"))[0]?.body).toMatchObject({
      modalidad: "virtual",
      lugar: "Piso 2",
      nota: "Con RRHH",
    });
  });

  it("a hunter of test says so", async () => {
    await openForward();
    await expect.element(hunterField()).toMatchTextContent(/Otro Hunter \(prueba\)/);
  });
});

describe("a repetition", () => {
  it("shows its fields, its shortcuts and its help", async () => {
    await openForward();
    await pill("Se repite").click();
    await pill("15").click();
    await expect.element(page.getByLabelText("Cada cuántos días")).toHaveValue("15");
    await expect.element(dialog()).toMatchTextContent(/se crean todas las fechas/);
  });

  it("is checked before saving", async () => {
    await openForward();
    await hunterField().selectOptions("h1");
    await pill("Tarde").click();
    await pill("Se repite").click();
    await confirm().click();
    await expect.element(notice()).toMatchTextContent(/cada cuántos días/);

    await page.getByLabelText("Cada cuántos días").fill("7");
    await page.getByLabelText("Cantidad de veces").fill("99");
    await confirm().click();
    await expect.element(notice()).toMatchTextContent(/de 2 a 24/);
  });

  it("creates all the dates one by one, and says how many", async () => {
    const { harness } = await openForward();
    await hunterField().selectOptions("h1");
    await pill("Tarde").click();
    await pill("Se repite").click();
    await page.getByLabelText("Cada cuántos días").fill("7");
    await page.getByLabelText("Cantidad de veces").fill("3");
    await confirm().click();

    await expect.element(notice()).toMatchTextContent(/con las 3 fechas planificadas/);
    const posted = writes(harness.network.to("/rest/v1/gestiones"));
    expect.soft(posted).toHaveLength(3);
    expect.soft(posted[0]?.body).toMatchObject({ vez: 1, veces: 3 });
    expect.soft(posted[2]?.body).toMatchObject({ vez: 3 });
  });

  it("a date that clashes does not stop the others: it says which, and opens the action", async () => {
    let turn = 0;
    let clashDate = "";
    const clashing: Answer = (request) => {
      if (request.method !== "POST") return jsonResponse(anAction({ id: "new" }));
      turn += 1;
      if (turn === 2) {
        clashDate = String(Reflect.get(fieldsOf(request.body), "fecha"));
        return jsonResponse({ message: "GES_PISA: de 10:00 a 12:00" }, 400);
      }
      return saved(request);
    };
    await openForward({
      tables: { gestiones: clashing, gestion_prospectos: () => jsonResponse([]) },
    });
    await hunterField().selectOptions("h1");
    await pill("Tarde").click();
    await pill("Se repite").click();
    await page.getByLabelText("Cada cuántos días").fill("7");
    await page.getByLabelText("Cantidad de veces").fill("3");
    await confirm().click();

    await expect.element(notice()).toMatchTextContent(/Se crearon 2 de 3 fechas/);
    await expect.element(notice()).toMatchTextContent(/se pisa/);
    expect(turn).toBe(3);
    await expect.element(notice()).toMatchTextContent(`No se pudo: ${dateLabel(clashDate)} (`);
    await expect.element(page.getByTestId("action-detail")).toBeVisible();
  });
});

describe("a data list", () => {
  it("hides the time and shows the list, with a preview", async () => {
    await openForward();
    await pill("Base de datos").click();
    await expect.element(page.getByText("Horario")).not.toBeInTheDocument();
    await expect.element(page.getByText("¿Se repite?")).not.toBeInTheDocument();
    await expect.element(page.getByText(/Trabajarla hasta/)).toBeVisible();
    await page
      .getByTestId("form-people")
      .fill(
        "Ana Pérez\t11 5555-1234\nLuis\t27-11111111-7\nCarla\nDiego\nElena\nFede\nGala\n\t11 1",
      );
    const preview = page.getByTestId("form-people-preview");
    await expect.element(preview).toMatchTextContent(/7 personas listas/);
    await expect
      .element(preview)
      .toMatchTextContent(/1 con problemas \(no se agregan\): \? \(sin nombre\)/);
    await expect.element(preview).toMatchTextContent(/Y 1 más\./);
    await expect.element(preview).toMatchTextContent(/27-11111111-7/);
  });

  it("does not go without people, nor with a date that goes backwards", async () => {
    await openForward();
    await pill("Base de datos").click();
    await hunterField().selectOptions("h1");
    await confirm().click();
    await expect.element(notice()).toMatchTextContent(/Pegá al menos una persona/);

    await page.getByTestId("form-date").fill("2026-12-01");
    await dialog()
      .getByLabelText(/Trabajarla hasta/)
      .fill("2026-11-01");
    await confirm().click();
    await expect.element(notice()).toMatchTextContent(/tiene que ser después de/);
  });

  it("the note of a data list asks for what goes with it", async () => {
    await openForward();
    await pill("Base de datos").click();
    await expect
      .element(dialog().getByPlaceholder("Qué ofrecerles, con quién hablar en la empresa"))
      .toBeVisible();
  });

  it("saves the people as A contactar", async () => {
    const { harness } = await openForward({
      tables: {
        gestiones: (request) => (request.method === "POST" ? saved(request) : jsonResponse([])),
        gestion_prospectos: () => jsonResponse([{ id: "p" }], 201),
      },
    });
    await pill("Base de datos").click();
    await hunterField().selectOptions("h1");
    await page.getByTestId("form-people").fill("Ana Pérez\t11 5555-1234\tLegajo 3");
    await confirm().click();

    await expect.element(notice()).toMatchTextContent(/con 1 persona para contactar/);
    expect(harness.network.to("/rest/v1/gestion_prospectos", "POST")[0]?.body).toEqual([
      {
        gestion_id: "new",
        nombre: "Ana Pérez",
        contacto: "11 5555-1234",
        cuil: null,
        referencia: "Legajo 3",
        estado: "a_contactar",
      },
    ]);
  });

  it("says the people in the plural", async () => {
    await openForward({
      tables: {
        gestiones: (request) => (request.method === "POST" ? saved(request) : jsonResponse([])),
        gestion_prospectos: () => jsonResponse([{ id: "p" }], 201),
      },
    });
    await pill("Base de datos").click();
    await hunterField().selectOptions("h1");
    await page.getByTestId("form-people").fill("Ana\nLuis");
    await confirm().click();
    await expect.element(notice()).toMatchTextContent(/con 2 personas para contactar/);
  });
});
