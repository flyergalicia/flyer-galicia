// "Registrar gestión", from the screen of the Hunter.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { usePermissions, useSession } from "@/shared/session/index.ts";
import { type Answer, jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import {
  type CommercialCloud,
  commercialHarness,
  FAILS,
  fieldsOf,
  ME,
} from "../testing/commercial-cloud.ts";
import { anAction } from "../testing/fixtures.ts";
import { RegisterActionWindow, type RegisterActionWindowProps } from "./RegisterActionWindow.tsx";

const COMPANY = { empresa: "ALIMENTOS SA", cuits: ["30900001118"], user_id: "o1" };
const dialog = () => page.getByTestId("action-window");
const confirm = () => page.getByTestId("confirm-register");
const notice = () => page.getByRole("status");
const confirmation = () => page.getByRole("alertdialog");

function Stage(props: RegisterActionWindowProps) {
  const session = useSession();
  const { loadStatus } = usePermissions();
  if (session.status !== "signed-in" || loadStatus === "loading") return null;
  return <RegisterActionWindow {...props} />;
}

const created =
  (fields: object): Answer =>
  (request) => {
    if (request.method === "POST") {
      return jsonResponse(anAction({ id: "new", ...fieldsOf(request.body), ...fields }), 201);
    }
    return jsonResponse([]);
  };

async function open(cloud: CommercialCloud = {}, company = COMPANY) {
  const harness = commercialHarness({ role: "hunter", actions: created({}), ...cloud });
  const onClose = vi.fn<() => void>();
  const onOpenAction = vi.fn<(id: string, complete: boolean) => void>();
  await render(
    harness.wrap(<Stage company={company} onClose={onClose} onOpenAction={onOpenAction} />),
  );
  await expect.element(confirm()).toBeVisible();
  return { harness, onClose, onOpenAction };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("registering", () => {
  it("says the company and the officer who ceded it", async () => {
    await open();
    await expect.element(dialog()).toMatchTextContent(/ALIMENTOS SA CUIT 30-90000111-8/);
    await expect.element(dialog()).toMatchTextContent(/Cedida por Mariana Costa/);
    await expect.element(page.getByTestId("form-state")).toHaveValue("realizada");
    await expect
      .element(dialog().getByRole("button", { name: "Base de datos" }))
      .not.toBeInTheDocument();
  });

  it("saves it as the hunter's own, with the officer as owner, and opens it", async () => {
    const { harness, onOpenAction, onClose } = await open();
    await confirm().click();

    await expect
      .element(notice())
      .toHaveTextContent("Gestión guardada. Ahora cargá los prospectos.");
    expect(harness.network.to("/rest/v1/gestiones", "POST")[0]?.body).toMatchObject({
      empresa: "ALIMENTOS SA",
      dueno_id: "o1",
      origen: "propia",
      estado: "realizada",
    });
    expect(onOpenAction).toHaveBeenCalledWith("new", false);
    expect(onClose).toHaveBeenCalled();
  });

  it("a date in the future cannot be done", async () => {
    const { harness } = await open();
    await page.getByTestId("form-date").fill("2099-01-01");
    await confirm().click();
    await expect.element(notice()).toMatchTextContent(/no puede tener fecha futura/);
    expect(harness.network.to("/rest/v1/gestiones", "POST")).toEqual([]);
  });

  it("the rest is checked too", async () => {
    await open();
    await dialog().getByLabelText("Desde", { exact: true }).fill("12:00");
    await dialog().getByLabelText("Hasta", { exact: true }).fill("10:00");
    await confirm().click();
    await expect.element(notice()).toMatchTextContent(/hora de fin/);
  });

  it("stops if the hunter already has something then, about themselves", async () => {
    const { harness } = await open({
      hunterDay: [
        { id: "x", hora_desde: "10:00", hora_hasta: "12:00", tipo: "accion", empresa: "OTRA" },
      ],
    });
    await dialog().getByLabelText("Desde", { exact: true }).fill("11:00");
    await confirm().click();
    await expect.element(notice()).toMatchTextContent(/Ya tenés algo a esa hora/);
    await expect.element(notice()).not.toMatchTextContent(/elegí otro hunter/);
    expect(harness.network.to("/rest/v1/gestiones", "POST")).toEqual([]);
    await expect.element(confirm()).toBeEnabled();
    await expect.element(confirm()).toHaveTextContent("Guardar y cargar prospectos");
  });

  it("a refusal says so, and leaves the window", async () => {
    await open({
      actions: (request) => (request.method === "POST" ? FAILS(request) : jsonResponse([])),
    });
    await confirm().click();
    await expect.element(notice()).toMatchTextContent(/No se pudo guardar/);
    await expect.element(dialog()).toBeVisible();
  });

  it("with the number of times it plans the others", async () => {
    const { harness, onOpenAction, onClose } = await open({
      actions: created({
        frecuencia: "repite",
        veces: 2,
        cada_dias: 7,
        fecha: "2026-11-01",
        estado: "planificada",
      }),
    });
    await page.getByTestId("form-state").selectOptions("planificada");
    await dialog().getByRole("button", { name: "Se repite" }).click();
    await page.getByLabelText("Cada cuántos días").fill("7");
    await page.getByLabelText("Cantidad de veces").fill("2");
    await confirm().click();

    await expect.element(notice()).toMatchTextContent(/planificadas las otras 1 fechas/);
    expect(harness.network.to("/rest/v1/gestiones", "POST")).toHaveLength(2);
    expect(onOpenAction).toHaveBeenCalledWith("new", false);
    expect(onClose).toHaveBeenCalled();
  });

  it("an endless series offers the next date, and creates it", async () => {
    const { harness, onOpenAction, onClose } = await open({
      actions: created({
        frecuencia: "repite",
        veces: null,
        cada_dias: 7,
        fecha: "2026-11-01",
        estado: "realizada",
        creada_por: ME,
        hunter_id: ME,
      }),
    });
    await confirm().click();

    await expect.element(confirmation()).toMatchTextContent(/¿Creamos la próxima/);
    await confirmation().getByRole("button", { name: "Crear la próxima" }).click();

    await vi.waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    expect(harness.network.to("/rest/v1/gestiones", "POST")).toHaveLength(2);
    expect(onOpenAction).toHaveBeenCalledTimes(2);
  });

  it("offers to complete what was already planned for that company", async () => {
    const { onOpenAction, onClose, harness } = await open({
      actions: (request) =>
        request.method === "GET"
          ? jsonResponse([
              {
                id: "a",
                fecha: "2026-11-10",
                tipo: "accion",
                creada_por: "o1",
                origen: "derivada",
              },
              {
                id: "b",
                fecha: "2026-11-11",
                tipo: "accion",
                creada_por: "o1",
                origen: "derivada",
              },
            ])
          : jsonResponse(anAction(), 201),
    });
    await expect
      .element(dialog())
      .toMatchTextContent(/Ya tenés 2 acciones planificadas para esta empresa/);
    const [read] = harness.network.to("/rest/v1/gestiones", "GET");
    expect(read?.query.get("empresa_key")).toBe("eq.alimentos sa");
    expect(read?.query.get("dueno_id")).toBe("eq.o1");

    await page.getByRole("button", { name: "Completar la del 11 nov" }).click();

    expect(onClose).toHaveBeenCalled();
    expect(onOpenAction).toHaveBeenCalledWith("b", true);
  });

  it("says one planned in the singular", async () => {
    await open({
      actions: () => jsonResponse([{ id: "a", fecha: "2026-11-10" }]),
    });
    await expect.element(dialog()).toMatchTextContent(/Ya tenés una acción planificada/);
  });

  it("closes with Cancelar", async () => {
    const { onClose } = await open();
    await page.getByTestId("window-dismiss").click();
    expect(onClose).toHaveBeenCalled();
  });
});
