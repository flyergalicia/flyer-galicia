// "Pegar desde Excel": nothing is added until everything was reviewed against the database.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { usePermissions, useSession } from "@/shared/session/index.ts";
import { type Answer, deferred, jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import { addDays, today } from "../model/formatting.ts";
import { useWho } from "../model/use-who.ts";
import {
  type CommercialCloud,
  commercialHarness,
  CUT,
  fieldsOf,
  ME,
} from "../testing/commercial-cloud.ts";
import { TEAM } from "../testing/fixtures.ts";
import { AgendaPasteWindow } from "./AgendaPasteWindow.tsx";

const DAY = addDays(today(), 3);
const COMPANIES = "/rest/v1/rpc/gestiones_empresas";

const text = () => page.getByTestId("agenda-paste-text");
const preview = () => page.getByTestId("agenda-paste-preview");
const summary = () => page.getByTestId("agenda-paste-summary");
const add = () => page.getByTestId("agenda-paste-add");
const rows = () => page.getByTestId("agenda-paste-row");
const notice = () => page.getByRole("status");

function Stage({
  onClose,
  onAdded,
}: {
  readonly onClose: () => void;
  readonly onAdded: (date: string) => void;
}) {
  const session = useSession();
  const { loadStatus } = usePermissions();
  if (session.status !== "signed-in" || loadStatus === "loading") return null;
  return <WithWho onClose={onClose} onAdded={onAdded} />;
}

function WithWho({
  onClose,
  onAdded,
}: {
  readonly onClose: () => void;
  readonly onAdded: (date: string) => void;
}) {
  const who = useWho();
  if (Object.keys(who.people).length === 0) return null;
  return <AgendaPasteWindow who={who} onClose={onClose} onAdded={onAdded} />;
}

function ofMe(member: (typeof TEAM)[string]) {
  return member?.lider_id === "l1" ? { ...member, lider_id: ME } : member;
}

const KNOWN: Readonly<Record<string, readonly object[]>> = {
  "TEXTIL SA": [{ empresa: "TEXTIL SA", dueno_id: ME, cuits: [] }],
  "BETA SA": [{ empresa: "BETA SA", dueno_id: "o2", cuits: [] }],
};

const companies: Answer = ({ body }) =>
  jsonResponse(KNOWN[String(Reflect.get(fieldsOf(body), "p_q"))] ?? []);

const savedAll: Answer = ({ body }) =>
  jsonResponse(
    (Array.isArray(body) ? body : []).map((_, index) => ({ id: `n${String(index)}` })),
    201,
  );

async function open(cloud: CommercialCloud = {}) {
  const { functions_: others = {}, ...rest } = cloud;
  const harness = commercialHarness({
    hunterDay: [],
    actions: savedAll,
    ...rest,
    functions_: { gestiones_empresas: companies, ...others },
  });
  const onClose = vi.fn<() => void>();
  const onAdded = vi.fn<(date: string) => void>();
  await render(harness.wrap(<Stage onClose={onClose} onAdded={onAdded} />));
  await expect.element(text()).toBeVisible();
  const posted = () => harness.network.to("/rest/v1/gestiones", "POST").map(({ body }) => body);
  return { harness, onClose, onAdded, posted };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("pasting", () => {
  it("explains what goes where; to an officer, with no word about leaders", async () => {
    await open();
    await expect
      .element(page.getByTestId("action-window"))
      .toMatchTextContent("Las que se pisan con otra cosa del hunter no se agregan.");
    await expect.element(add()).toBeDisabled();
    await expect.element(add()).toMatchTextContent(/^Agregar a la agenda$/);
  });

  it("to a leader, it says what is theirs to decide", async () => {
    await open({ role: "lider", personsOfTeam: Object.values(TEAM) });
    await expect
      .element(page.getByTestId("action-window"))
      .toMatchTextContent("(como líder, las de tu equipo sí, con aviso)");
  });

  it("reviews each line and says what each has, and only what is ready is offered", async () => {
    await open();

    await text().fill(
      `${DAY}\t10 a 12\tTEXTIL SA\tSofía\tPiso 3\n${DAY}\t10 a 12\tINVENTADA SA\tSofía\nsin nada`,
    );

    await expect
      .element(summary())
      .toMatchTextContent(/^1 listas2 con problemas \(no se agregan\)$/);
    await vi.waitFor(() => {
      expect(rows().elements()).toHaveLength(3);
    });
    await expect
      .element(rows().first())
      .toMatchTextContent(/10:00–12:00TEXTIL SASofía PazPiso 3Lista$/);
    await expect.element(rows().nth(1)).toMatchTextContent(/la empresa no está en la base$/);
    await expect.element(rows().nth(2)).toMatchTextContent(/^——sin nada—sin fecha$/);
    await expect.element(add()).toMatchTextContent(/^Agregar 1 a la agenda$/);
    await expect.element(add()).toBeEnabled();
  });

  it("while it waits for the writing to stop, it cannot add", async () => {
    await open();
    await text().fill(`${DAY}\t10 a 12\tTEXTIL SA\tSofía`);
    await expect.element(add()).toBeEnabled();

    await text().fill(`${DAY}\t10 a 12\tTEXTIL SA\tSofía `);

    await expect.element(add()).toBeDisabled();
    await expect.element(add()).toBeEnabled();
  });

  it("a review that comes late says it is on its way", async () => {
    const slow = deferred<Response>();
    await open({ functions_: { gestiones_empresas: () => slow.promise } });
    await text().fill(`${DAY}\t10 a 12\tTEXTIL SA\tSofía`);
    await expect.element(preview()).toMatchTextContent(/^Revisando…$/);
    slow.resolve(jsonResponse(KNOWN["TEXTIL SA"]));
    await expect.element(summary()).toMatchTextContent(/^1 listas$/);
  });

  it("a review that arrives late does not paint over the one on its way", async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    await open({
      functions_: {
        gestiones_empresas: ({ body }) =>
          String(Reflect.get(fieldsOf(body), "p_q")) === "TEXTIL SA"
            ? first.promise
            : second.promise,
      },
    });
    await text().fill(`${DAY}\t10 a 12\tTEXTIL SA\tSofía`);
    await expect.element(preview()).toMatchTextContent(/^Revisando…$/);
    await text().fill(`${DAY}\t10 a 12\tBETA SA\tSofía`);
    await new Promise((resolve) => {
      setTimeout(resolve, 600);
    });

    first.resolve(jsonResponse(KNOWN["TEXTIL SA"]));
    await new Promise((resolve) => {
      setTimeout(resolve, 200);
    });
    await expect.element(preview()).toMatchTextContent(/^Revisando…$/);

    second.resolve(jsonResponse(KNOWN["BETA SA"]));
    await expect.element(rows().first()).toMatchTextContent(/BETA SA/);
    await vi.waitFor(() => {
      expect(rows().elements()).toHaveLength(1);
    });
  });

  it("a failure to review is not saying it is not there, and can be tried again", async () => {
    let online = false;
    await open({
      functions_: { gestiones_empresas: (request) => (online ? companies(request) : CUT(request)) },
    });
    await text().fill(`${DAY}\t10 a 12\tTEXTIL SA\tSofía`);

    await expect
      .element(rows().first())
      .toMatchTextContent(/No se pudo revisar la empresa\. Probá de nuevo$/);
    await expect.element(add()).toBeDisabled();

    online = true;
    await preview().getByRole("button", { name: "Probar de nuevo" }).click();
    await expect.element(rows().first()).toMatchTextContent(/Lista$/);
  });

  it("an answer with an error is not saying it is not there either", async () => {
    await open({ functions_: { gestiones_empresas: () => jsonResponse({ message: "x" }, 500) } });
    await text().fill(`${DAY}\t10 a 12\tTEXTIL SA\tSofía`);
    await expect.element(rows().first()).toMatchTextContent(/No se pudo revisar la empresa/);
  });

  it("what overlaps is warned to a leader, and added anyway", async () => {
    await open({
      role: "lider",
      personsOfTeam: Object.values(TEAM).map((member) => ofMe(member)),
      hunterDay: [
        { id: "x", hora_desde: "11:00:00", hora_hasta: "12:00:00", tipo: "accion", empresa: null },
      ],
    });
    await text().fill(`${DAY}\t10 a 12\tTEXTIL SA\tSofía`);

    await expect
      .element(summary())
      .toMatchTextContent(/^1 listas1 se pisan con otra \(se agregan igual\)$/);
    await expect
      .element(rows().first())
      .toMatchTextContent(/se pisa con 11:00–12:00 \(otra acción\)$/);
  });

  it("without a network to know what the hunter has, it does not stop it", async () => {
    await open({ hunterDay: CUT });
    await text().fill(`${DAY}\t10 a 12\tTEXTIL SA\tSofía`);
    await expect.element(rows().first()).toMatchTextContent(/Lista$/);
  });

  it("adds the ready ones together, and goes to the first date", async () => {
    const { posted, onClose, onAdded } = await open();
    const later = addDays(DAY, 1);
    await text().fill(`${later}\t10 a 12\tTEXTIL SA\tSofía\n${DAY}\t14 a 15\tBETA SA\tTomás Ríos`);
    await expect.element(add()).toMatchTextContent(/^Agregar 2 a la agenda$/);

    await add().click();

    await vi.waitFor(() => {
      expect(posted()).toHaveLength(1);
    });
    expect(posted()[0]).toEqual([
      expect.objectContaining({
        empresa: "TEXTIL SA",
        empresa_key: "textil sa",
        dueno_id: ME,
        hunter_id: "h1",
        fecha: later,
      }),
      expect.objectContaining({ empresa: "BETA SA", dueno_id: "o2", hunter_id: "h2", fecha: DAY }),
    ]);
    await expect.element(notice()).toMatchTextContent(/^2 posiciones agregadas a la agenda\.$/);
    expect.soft(onClose).toHaveBeenCalled();
    expect.soft(onAdded).toHaveBeenCalledWith(DAY);
  });

  it("one alone, in singular", async () => {
    await open({
      actions: () => jsonResponse([{ id: "n" }], 201),
    });
    await text().fill(`${DAY}\t10 a 12\tTEXTIL SA\tSofía`);
    await add().click();
    await expect.element(notice()).toMatchTextContent(/^1 posición agregada a la agenda\.$/);
  });

  it("what the database refuses says so, adds nothing and can be tried again", async () => {
    const { onClose } = await open({
      actions: () => jsonResponse({ message: "GES_PISA" }, 400),
    });
    await text().fill(`${DAY}\t10 a 12\tTEXTIL SA\tSofía`);
    await add().click();

    await expect.element(notice()).toMatchTextContent(/^No se pudo agregar: el horario se pisa/);
    expect(onClose).not.toHaveBeenCalled();
    await expect.element(add()).toBeEnabled();
    await expect.element(add()).toMatchTextContent(/^Agregar 1 a la agenda$/);
  });

  it("shows the first 60 lines", async () => {
    await open();
    await text().fill(
      Array.from({ length: 61 }, () => `${DAY}\t10 a 12\tINVENTADA SA\tSofía`).join("\n"),
    );
    await expect.element(preview()).toMatchTextContent(/Se muestran las primeras 60 de 61\.$/);
    await vi.waitFor(() => {
      expect(rows().elements()).toHaveLength(60);
    });
  });

  it("Cancelar adds nothing", async () => {
    const { onClose, posted } = await open();
    await page.getByTestId("window-dismiss").click();
    expect(onClose).toHaveBeenCalled();
    expect(posted()).toEqual([]);
  });

  it("clearing the text clears what it says", async () => {
    const { harness } = await open();
    await text().fill(`${DAY}\t10 a 12\tTEXTIL SA\tSofía`);
    await expect.element(summary()).toBeVisible();
    const asked = harness.network.to(COMPANIES).length;
    await text().fill("");
    await expect.element(summary()).not.toBeInTheDocument();
    expect(harness.network.to(COMPANIES)).toHaveLength(asked);
  });
});
