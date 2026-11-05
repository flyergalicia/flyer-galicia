// "+ Asignar" and "+ Agendar": the same window, starting from a company of the database.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { usePermissions, useSession } from "@/shared/session/index.ts";
import { type Answer, deferred, jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import { addDays, today } from "../model/formatting.ts";
import type { PendingList } from "../model/use-action-saving.ts";
import { useWho } from "../model/use-who.ts";
import {
  type CommercialCloud,
  commercialHarness,
  FAILS,
  fieldsOf,
  ME,
} from "../testing/commercial-cloud.ts";
import { anAction, TEAM } from "../testing/fixtures.ts";
import { type ScheduleStart, ScheduleWindow } from "./ScheduleWindow.tsx";

const COMPANIES = "/rest/v1/rpc/gestiones_empresas";
const DAY = addDays(today(), 3);
const TEXTIL = { empresa: "TEXTIL SA", dueno_id: ME, cuits: ["30900005113"] };
const OTHER = { empresa: "TRANSPORTES SA", dueno_id: "o9", cuits: [] };

const dialog = () => page.getByTestId("action-window");
const confirm = () => page.getByTestId("confirm-agenda");
const search = () => page.getByTestId("form-company");
const results = () => page.getByTestId("form-company-results");
const notice = () => page.getByRole("status");
const desde = () => dialog().getByLabelText("Desde", { exact: true });
const hasta = () => dialog().getByLabelText("Hasta", { exact: true });
const pill = (name: string) => dialog().getByRole("button", { name, exact: true });

interface StageProps {
  readonly start: ScheduleStart;
  readonly onClose: () => void;
  readonly onSaved: (date: string | null) => void;
  readonly onOpenAction: (id: string, pending: PendingList | null) => void;
}

function Stage(props: StageProps) {
  const session = useSession();
  const { loadStatus } = usePermissions();
  if (session.status !== "signed-in" || loadStatus === "loading") return null;
  return <Who {...props} />;
}

function Who(props: StageProps) {
  const who = useWho();
  if (Object.keys(who.people).length === 0 && !who.peopleFailed) return null;
  return <ScheduleWindow who={who} myLeader={who.myLeader} {...props} />;
}

const companiesFound: Answer = ({ body }) => {
  const asked = String(Reflect.get(fieldsOf(body), "p_q")).toLowerCase();
  return jsonResponse(
    [TEXTIL, OTHER].filter(({ empresa }) => empresa.toLowerCase().includes(asked)),
  );
};

function saved(fields: object = {}): Answer {
  return (request) =>
    request.method === "POST"
      ? jsonResponse(anAction({ id: "new", ...fieldsOf(request.body), ...fields }), 201)
      : jsonResponse([]);
}

async function open(start: ScheduleStart = {}, cloud: CommercialCloud = {}) {
  const { functions_: others = {}, ...rest } = cloud;
  const harness = commercialHarness({
    actions: saved(),
    hunterDay: [],
    ...rest,
    functions_: { gestiones_empresas: companiesFound, ...others },
  });
  const onClose = vi.fn<() => void>();
  const onSaved = vi.fn<(date: string | null) => void>();
  const onOpenAction = vi.fn<(id: string, pending: PendingList | null) => void>();
  await render(
    harness.wrap(
      <Stage start={start} onClose={onClose} onSaved={onSaved} onOpenAction={onOpenAction} />,
    ),
  );
  await expect.element(confirm()).toBeVisible();
  const posted = () =>
    harness.network.to("/rest/v1/gestiones", "POST").map(({ body }) => fieldsOf(body));
  return { harness, onClose, onSaved, onOpenAction, posted };
}

async function chooseTextil() {
  await search().fill("TEXTIL");
  await results()
    .getByRole("button", { name: /TEXTIL SA/ })
    .click();
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("the company", () => {
  it("is searched from two letters, once the writing stops", async () => {
    const { harness } = await open();
    await search().fill("T");
    await new Promise((resolve) => {
      setTimeout(resolve, 400);
    });
    expect(harness.network.to(COMPANIES)).toEqual([]);

    await search().fill("TEX");
    await search().fill("TEXTIL");

    await expect.element(results()).toMatchTextContent("TEXTIL SA CUIT 30-90000511-3 · Vos");
    expect(harness.network.to(COMPANIES).map(({ body }) => body)).toEqual([
      { p_q: "TEXTIL", p_limit: 20 },
    ]);
  });

  it("chosen, says whose it is, with its name written and no new search", async () => {
    const { harness } = await open();
    await chooseTextil();
    await expect.element(search()).toHaveValue("TEXTIL SA");
    await new Promise((resolve) => {
      setTimeout(resolve, 400);
    });
    expect(harness.network.to(COMPANIES)).toHaveLength(1);
    await expect.element(results()).toMatchTextContent(/^Tu empresa · CUIT 30-90000511-3$/);

    await search().fill("TRANSPORTES");
    await results()
      .getByRole("button", { name: /TRANSPORTES SA/ })
      .click();
    await expect.element(results()).toMatchTextContent(/^Empresa de Usuario dado de baja$/);
  });

  it("with no match, it says so", async () => {
    await open();
    await search().fill("NADA");
    await expect.element(results()).toMatchTextContent("Ninguna empresa de la base coincide.");
  });

  it("with less than two letters, nothing shows", async () => {
    await open();
    await search().fill("TEXTIL");
    await expect.element(results()).toMatchTextContent("TEXTIL SA");
    await search().fill("T");
    await expect.element(results()).toMatchTextContent(/^$/);
  });

  it("a search that fails says so", async () => {
    await open(
      {},
      { functions_: { gestiones_empresas: () => jsonResponse({ message: "se cortó" }, 500) } },
    );
    await search().fill("TEXTIL");
    await expect.element(results()).toMatchTextContent("No se pudo buscar: se cortó");
  });

  it("an answer that arrives late does not replace the search of now", async () => {
    const late = deferred<Response>();
    await open(
      {},
      {
        functions_: {
          gestiones_empresas: ({ body }) =>
            String(Reflect.get(fieldsOf(body), "p_q")) === "TEXTIL"
              ? late.promise
              : jsonResponse([OTHER]),
        },
      },
    );
    await search().fill("TEXTIL");
    await new Promise((resolve) => {
      setTimeout(resolve, 400);
    });
    await search().fill("TRANSPORTES");
    await expect.element(results()).toMatchTextContent("TRANSPORTES SA");

    late.resolve(jsonResponse([TEXTIL]));
    await new Promise((resolve) => {
      setTimeout(resolve, 200);
    });
    await expect.element(results()).not.toMatchTextContent("TEXTIL SA");
  });

  it("without one nothing is saved", async () => {
    const { posted } = await open();
    await confirm().click();
    await expect.element(notice()).toMatchTextContent("Elegí la empresa de la lista.");
    expect(posted()).toEqual([]);
  });

  it("writing again lets go of the one chosen", async () => {
    const { posted } = await open();
    await chooseTextil();
    await search().fill("TEXTIL OTRA");
    await confirm().click();
    await expect.element(notice()).toMatchTextContent("Elegí la empresa de la lista.");
    expect(posted()).toEqual([]);
  });
});

describe("assigning", () => {
  it("opens with that hunter, that day and an hour from that time", async () => {
    await open({ hunter: "h2", date: DAY, time: "09:30" });

    await expect.element(dialog()).toMatchTextContent("Asignar a un hunter");
    await expect
      .element(dialog())
      .toMatchTextContent("Le aparece en su agenda y en la marca de su avatar.");
    await expect.element(page.getByTestId("form-hunter")).toHaveValue("h2");
    await expect.element(page.getByTestId("form-date")).toHaveValue(DAY);
    await expect.element(desde()).toHaveValue("09:30");
    await expect.element(hasta()).toHaveValue("10:30");
    await expect.element(pill("Posición comercial")).toHaveAttribute("aria-pressed", "true");
    await expect.element(pill("Base de datos")).toBeVisible();
    await expect
      .element(page.getByTestId("form-hunter").getByRole("option", { name: "Elegí un hunter" }))
      .not.toBeInTheDocument();
    await expect.element(dialog()).not.toMatchTextContent("Horario (opcional)");
  });

  it("with nobody chosen it asks for somebody, and the time", async () => {
    const { posted } = await open();
    await chooseTextil();

    await confirm().click();
    await expect
      .element(notice())
      .toMatchTextContent("Elegí el hunter (o que la asigne el líder).");

    await page.getByTestId("form-hunter").selectOptions("h1");
    await confirm().click();
    await expect.element(notice()).toMatchTextContent(/^Poné el horario/);
    expect(posted()).toEqual([]);
  });

  it("a hunter that is not of the team starts on the first one offered", async () => {
    await open(
      { hunter: "h9" },
      {
        role: "lider",
        personsOfTeam: Object.values({ ...TEAM, h1: { ...TEAM.h1, lider_id: ME } }),
      },
    );
    await expect.element(page.getByTestId("form-hunter")).toHaveValue("h1");
  });

  it("saves it with the officer of the company, forwarded and planned", async () => {
    const { posted, onClose, onSaved } = await open({ hunter: "h1", date: DAY, time: "10:00" });
    await chooseTextil();
    await dialog().getByPlaceholder("Sede, dirección, piso").fill("Planta");

    await confirm().click();

    await vi.waitFor(() => {
      expect(posted()).toHaveLength(1);
    });
    expect(posted()[0]).toMatchObject({
      empresa: "TEXTIL SA",
      empresa_key: "textil sa",
      dueno_id: ME,
      hunter_id: "h1",
      origen: "derivada",
      tipo: "posicion",
      estado: "planificada",
      fecha: DAY,
      hora_desde: "10:00",
      hora_hasta: "11:00",
      lugar: "Planta",
    });
    await expect
      .element(notice())
      .toMatchTextContent(
        "Asignada a Sofía Paz. Le aparece en su agenda y en la marca de su avatar.",
      );
    expect.soft(onClose).toHaveBeenCalled();
    expect.soft(onSaved).toHaveBeenCalledWith(DAY);
  });

  it("a company of another officer stays with that officer", async () => {
    const { posted } = await open({ hunter: "h1", date: DAY, time: "10:00" });
    await search().fill("TRANSPORTES");
    await results()
      .getByRole("button", { name: /TRANSPORTES SA/ })
      .click();

    await confirm().click();

    await vi.waitFor(() => {
      expect(posted()).toHaveLength(1);
    });
    expect(posted()[0]).toMatchObject({ empresa: "TRANSPORTES SA", dueno_id: "o9" });
  });

  it("left for the leader, it does not go to anybody's agenda", async () => {
    const leader = { id: "my-leader", nombre: "Líder Mía", rol: "lider" };
    const { posted, onSaved } = await open(
      { date: DAY },
      { personsOfTeam: [...Object.values(TEAM), leader] },
    );
    await chooseTextil();
    await page.getByTestId("form-hunter").selectOptions("__lider");

    await confirm().click();

    await vi.waitFor(() => {
      expect(posted()).toHaveLength(1);
    });
    expect.soft(posted()[0]).toMatchObject({ hunter_id: null });
    await expect.element(notice()).toMatchTextContent(/^Queda para que la asigne/);
    expect.soft(onSaved).toHaveBeenCalledWith(null);
  });

  it("a time that overlaps is not saved by an officer", async () => {
    const { posted } = await open(
      { hunter: "h1", date: DAY, time: "10:00" },
      {
        hunterDay: [
          {
            id: "x",
            hora_desde: "10:00:00",
            hora_hasta: "12:00:00",
            tipo: "accion",
            empresa: null,
          },
        ],
        dayOccupancy: [],
      },
    );
    await chooseTextil();

    await confirm().click();

    await expect.element(notice()).toMatchTextContent(/Sofía Paz ya tiene algo a esa hora/);
    expect(posted()).toEqual([]);
  });

  it("what the database refuses says so, and nothing closes", async () => {
    const { onClose } = await open(
      { hunter: "h1", date: DAY, time: "10:00" },
      { actions: () => jsonResponse({ message: "GES_PISA: de 10:00 a 12:00" }, 400) },
    );
    await chooseTextil();

    await confirm().click();

    await expect.element(notice()).toMatchTextContent(/^No se pudo guardar: el horario se pisa/);
    expect(onClose).not.toHaveBeenCalled();
    await expect.element(confirm()).toMatchTextContent("Asignar");
  });

  it("a series with its number of times creates the other dates, and says how many", async () => {
    const { posted } = await open(
      { hunter: "h1", date: DAY, time: "10:00" },
      { actions: saved({ frecuencia: "repite", veces: 3, cada_dias: 7 }) },
    );
    await chooseTextil();
    await pill("Se repite").click();
    await dialog().getByLabelText("Cada cuántos días").fill("7");
    await dialog().getByLabelText("Cantidad de veces").fill("3");

    await confirm().click();

    await vi.waitFor(() => {
      expect(posted()).toHaveLength(3);
    });
    expect(posted()[0]).toMatchObject({ vez: 1, frecuencia: "repite" });
    await expect
      .element(notice())
      .toMatchTextContent(/^Asignada a Sofía Paz, con las 3 fechas planificadas\./);
  });

  it("a date of the series that fails opens the action", async () => {
    let first = true;
    const { onOpenAction } = await open(
      { hunter: "h1", date: DAY, time: "10:00" },
      {
        actions: (request) => {
          if (request.method !== "POST") return jsonResponse([]);
          if (first) {
            first = false;
            return jsonResponse(
              anAction({
                id: "new",
                ...fieldsOf(request.body),
                frecuencia: "repite",
                veces: 2,
                cada_dias: 7,
              }),
              201,
            );
          }
          return jsonResponse({ message: "GES_PISA" }, 400);
        },
      },
    );
    await chooseTextil();
    await pill("Se repite").click();
    await dialog().getByLabelText("Cada cuántos días").fill("7");
    await dialog().getByLabelText("Cantidad de veces").fill("2");

    await confirm().click();

    await vi.waitFor(() => {
      expect(onOpenAction).toHaveBeenCalledWith("new", null);
    });
  });

  it("a data list needs its people, and if they cannot be saved the list stays pasted", async () => {
    const { onOpenAction } = await open(
      { hunter: "h1", date: DAY },
      { tables: { gestion_prospectos: FAILS } },
    );
    await chooseTextil();
    await pill("Base de datos").click();

    await confirm().click();
    await expect.element(notice()).toMatchTextContent("Pegá al menos una persona para contactar.");

    await page.getByTestId("form-people").fill("Ana Pérez\t11 5555-1234");
    await confirm().click();

    await vi.waitFor(() => {
      expect(onOpenAction).toHaveBeenCalledWith(
        "new",
        expect.objectContaining({ actionId: "new" }),
      );
    });
  });

  it("Cancelar closes it", async () => {
    const { onClose } = await open();
    await page.getByTestId("window-dismiss").click();
    expect(onClose).toHaveBeenCalled();
  });
});

describe("a hunter scheduling", () => {
  it("does it for themselves, as their own, with no field of hunters", async () => {
    const { posted, onSaved } = await open({ date: DAY, time: "10:00" }, { role: "hunter" });
    await expect.element(dialog()).toMatchTextContent(/^Agendar/);
    await expect.element(page.getByTestId("form-hunter")).not.toBeInTheDocument();
    await expect.element(dialog()).toMatchTextContent("Horario (opcional)");
    await chooseTextil();

    await confirm().click();

    await vi.waitFor(() => {
      expect(posted()).toHaveLength(1);
    });
    expect(posted()[0]).toMatchObject({
      hunter_id: ME,
      origen: "propia",
      dueno_id: ME,
      estado: "planificada",
    });
    await expect.element(notice()).toMatchTextContent(/^Agendada\.$/);
    expect(onSaved).toHaveBeenCalledWith(DAY);
  });

  it("can schedule without a time", async () => {
    const { posted } = await open({ date: DAY }, { role: "hunter" });
    await chooseTextil();
    await confirm().click();
    await vi.waitFor(() => {
      expect(posted()).toHaveLength(1);
    });
  });

  it("an end without a start is asked for", async () => {
    const { posted } = await open({ date: DAY }, { role: "hunter" });
    await chooseTextil();
    await hasta().fill("12:00");
    await confirm().click();
    await expect.element(notice()).toMatchTextContent(/^Poné también la hora de inicio/);
    expect(posted()).toEqual([]);
  });

  it("with the dates of a series", async () => {
    const { posted } = await open(
      { date: DAY, time: "10:00" },
      { role: "hunter", actions: saved({ frecuencia: "repite", veces: 2, cada_dias: 7 }) },
    );
    await chooseTextil();
    await pill("Se repite").click();
    await dialog().getByLabelText("Cada cuántos días").fill("7");
    await dialog().getByLabelText("Cantidad de veces").fill("2");
    await confirm().click();
    await vi.waitFor(() => {
      expect(posted()).toHaveLength(2);
    });
    await expect.element(notice()).toMatchTextContent(/^Agendada, con las 2 fechas\.$/);
  });

  it("their own data list, with the people pasted", async () => {
    const { posted, onSaved } = await open({ date: DAY }, { role: "hunter" });
    await chooseTextil();
    await pill("Base de datos").click();
    await page.getByTestId("form-people").fill("Ana Pérez\t11 5555-1234");
    await confirm().click();
    await vi.waitFor(() => {
      expect(onSaved).toHaveBeenCalledWith(null);
    });
    expect(posted()).toHaveLength(1);
  });
});
