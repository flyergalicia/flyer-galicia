// Admin → Facultades: the matrix with its groups, what applies to each profile, saving it, the switch
// of Gestiones and the preview of a profile.
import { afterEach, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { usePermissions } from "@/shared/session/index.ts";
import { FIRST_PLACE, goToSheet, rememberPlace } from "../model/panel.ts";
import { ME, openPanel, type PanelOptions } from "../testing/panel-cloud.ts";

const panel = () => page.getByTestId("admin-panel");
const grid = () => panel().getByTestId("faculty-grid");
const row = (key: string) => grid().element().querySelector<HTMLElement>(`[data-faculty="${key}"]`);
const box = (key: string, column: string) =>
  row(key)?.querySelector<HTMLInputElement>(`[data-column="${column}"] input`) ?? null;
const notice = () => page.getByRole("status");
const OPTIONS = {
  opts: [
    { n: 1, nombre: "Opción 1" },
    { n: 8, nombre: "Combustible rubro", solapa: "rubros" },
    { n: 7, nombre: "Super rubro", solapa: "rubros" },
  ],
};

function Can({ permission }: { readonly permission: "notas" | "promos_buscar" }) {
  const { can, simulatedRole } = usePermissions();
  return (
    <span data-testid="can">
      {String(can(permission))}·{simulatedRole ?? "nadie"}
    </span>
  );
}

async function openFaculties(options: PanelOptions = {}) {
  rememberPlace(goToSheet(FIRST_PLACE, "facultades"));
  const opened = await openPanel({
    files: {
      "_opciones.json": OPTIONS,
      "_facultades.json": { roles: { asesor: { opcion_8: true } } },
    },
    ...options,
  });
  await expect.element(grid()).toBeVisible();
  return opened;
}

function uploads(harness: Awaited<ReturnType<typeof openPanel>>["harness"]) {
  return harness.network.to("/storage/v1/object/flyers/_facultades.json", "POST");
}

async function uploaded(
  harness: Awaited<ReturnType<typeof openPanel>>["harness"],
): Promise<unknown> {
  const body = uploads(harness).at(-1)?.init?.body;
  if (body === undefined || body === null) return null;
  const content =
    body instanceof FormData ? [...body.values()].find((value) => typeof value !== "string") : body;
  return content === undefined ? null : JSON.parse(await new Response(content).text());
}

afterEach(() => {
  rememberPlace(FIRST_PLACE);
});

describe("the matrix", () => {
  it("has a row per flyer, folded under its tab, with how many each column has", async () => {
    await openFaculties();
    const group = grid().element().querySelector<HTMLElement>('[data-group="rubros"]');
    expect(group?.textContent).toMatch(/Flyer Rubros2 opciones/);
    expect(group?.querySelector('[data-column="asesor"]')?.textContent).toBe("1/2");
    expect(row("opcion_8")?.textContent).toMatch(
      /Ver «Combustible rubro» \(opción 8, solapa Flyer Rubros\)/,
    );
    expect(row("opcion_8")?.hidden).toBe(true);
    expect(box("opcion_8", "asesor")?.checked).toBe(true);
    expect(box("opcion_7", "asesor")?.checked).toBe(false);

    await grid()
      .getByRole("button", { name: /Flyer Rubros/ })
      .click();
    expect(row("opcion_7")?.hidden).toBe(false);
    await userEvent.click(box("opcion_7", "asesor") ?? document.body);
    await expect
      .poll(() => group?.querySelector('[data-column="asesor"]')?.textContent)
      .toBe("2/2");
    await grid()
      .getByRole("button", { name: /Flyer Rubros/ })
      .click();
    expect(row("opcion_7")?.hidden).toBe(true);
  });

  it("does not let tick what does not apply to a profile", async () => {
    await openFaculties();
    expect(box("pegar_oficial", "hunter")).toBeNull();
    expect(
      row("pegar_oficial")?.querySelector('[data-column="hunter"]')?.getAttribute("title"),
    ).toMatch(/Hunter: sólo busca/);
    expect(box("pegar_oficial", "lider")).toBeNull();
    expect(box("pegar_oficial", "asesor")).not.toBeNull();
    expect(box("tutorial_auto", "me")).toBeNull();
    expect(box("opcion_8", "hunter")).not.toBeNull();
  });

  it("saves the profiles in the file and the column Vos in one's own profile", async () => {
    const { harness, cloud } = await openFaculties({ beside: <Can permission="notas" /> });
    await userEvent.click(box("notas", "asesor") ?? document.body);
    await userEvent.click(box("notas", "me") ?? document.body);
    await panel().getByRole("button", { name: "Guardar cambios" }).click();
    await expect.element(notice()).toHaveTextContent("Facultades actualizadas");
    console.log(
      JSON.stringify(
        harness.network.requests
          .filter(({ path }) => path.includes("storage"))
          .map(({ method, path }) => [method, path]),
      ),
    );
    const saved: unknown = await uploaded(harness);
    expect(saved).toMatchObject({
      roles: { asesor: { notas: true, opcion_8: true }, hunter: { opcion_1: false } },
    });
    expect(cloud.ownFaculties).toMatchObject({ notas: false, opcion_1: true });
    await expect.element(page.getByTestId("can")).toHaveTextContent("false·nadie");
    expect(cloud.profileChanges.some(({ query }) => query === `id=eq.${ME}`)).toBe(true);
  });

  it("a file that could not be saved says so, and the column Vos too", async () => {
    let refuse = "file";
    const { cloud } = await openFaculties({
      intercept: ({ path, method }) =>
        refuse === "file" &&
        method === "POST" &&
        path === "/storage/v1/object/flyers/_facultades.json"
          ? new Response(
              JSON.stringify({ statusCode: "403", error: "x", message: "sin permiso" }),
              { status: 403 },
            )
          : null,
    });
    await panel().getByRole("button", { name: "Guardar cambios" }).click();
    await expect.element(notice()).toMatchTextContent(/^Error al guardar las facultades: /);
    await expect.element(panel().getByRole("button", { name: "Guardar cambios" })).toBeEnabled();
    refuse = "";
    cloud.profileRefusal = "sin permiso";
    await panel().getByRole("button", { name: "Guardar cambios" }).click();
    await expect
      .element(notice())
      .toHaveTextContent('Los perfiles se guardaron, pero tu columna "Vos" no: sin permiso');
  });

  it("never leaves the administrator without any flyer", async () => {
    await openFaculties();
    await grid()
      .getByRole("button", { name: /Flyer Galicia/ })
      .click();
    await grid()
      .getByRole("button", { name: /Flyer Rubros/ })
      .click();
    await userEvent.click(box("opcion_1", "me") ?? document.body);
    await userEvent.click(box("opcion_7", "me") ?? document.body);
    await userEvent.click(box("opcion_8", "me") ?? document.body);
    await expect
      .element(notice())
      .toHaveTextContent("Dejá al menos una opción del armador habilitada.");
    expect(box("opcion_8", "me")?.checked).toBe(true);
  });

  it("Recargar forgets what was not saved", async () => {
    await openFaculties();
    await userEvent.click(box("notas", "vip") ?? document.body);
    expect(box("notas", "vip")?.checked).toBe(false);
    await panel().getByRole("button", { name: "Recargar" }).click();
    await expect.poll(() => box("notas", "vip")?.checked).toBe(true);
  });

  it("a matrix that could not be read is not shown as the defaults, and cannot be saved", async () => {
    rememberPlace(goToSheet(FIRST_PLACE, "facultades"));
    await openPanel({ files: { "_opciones.json": OPTIONS }, droppedFiles: ["_facultades.json"] });
    await expect
      .element(panel().getByTestId("read-problem"))
      .toMatchTextContent(/No se pudieron leer las facultades/);
    expect(grid().query()).toBeNull();
    await expect.element(panel().getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
  });
});

const choice = (name: string) => panel().getByRole("radio", { name: new RegExp(`^${name}`) });
const press = (name: string) =>
  panel().getByTestId("commercial-switch").getByText(name, { exact: true }).click();

describe("the switch of Gestiones", () => {
  it("is saved in app_flags and says what it means", async () => {
    const { harness } = await openFaculties({ commercialFlag: "off" });
    await expect.element(choice("Apagado")).toBeChecked();
    await press("Apagado");
    expect(harness.network.to("/rest/v1/app_flags", "POST")).toEqual([]);
    await press("En prueba");
    await expect
      .element(notice())
      .toHaveTextContent("Gestiones comerciales: en prueba (sólo vos y Prospect).");
    expect(harness.network.to("/rest/v1/app_flags", "POST").at(-1)?.body).toMatchObject({
      clave: "gestiones",
      valor: "prueba",
    });
    await press("Activo");
    await expect
      .element(notice())
      .toHaveTextContent("Gestiones comerciales: activo según Facultades.");
    await press("Apagado");
    await expect.element(notice()).toHaveTextContent("Gestiones comerciales: apagado.");
  });

  it("a switch the database refuses goes back to what it was", async () => {
    await openFaculties({
      intercept: ({ path, method }) =>
        path === "/rest/v1/app_flags" && method === "POST"
          ? new Response(JSON.stringify({ message: "sin permiso" }), { status: 403 })
          : null,
    });
    await panel().getByTestId("commercial-switch").getByText("Activo", { exact: true }).click();
    await expect.element(notice()).toHaveTextContent("No se pudo guardar: sin permiso");
    await expect.element(panel().getByRole("radio", { name: /^Apagado/ })).toBeChecked();
  });
});

describe("seeing the app as a profile", () => {
  it("closes the panel, shows the bar, and the bar gives everything back", async () => {
    const { closed } = await openFaculties({ beside: <Can permission="promos_buscar" /> });
    await expect.element(page.getByTestId("can")).toHaveTextContent("true·nadie");
    await grid().getByRole("button", { name: "Asesor", exact: true }).click();
    await expect
      .element(page.getByTestId("role-preview-bar"))
      .toHaveTextContent(
        "Vista previa: Asesor. Así ve la app este perfil.Salir de la vista previa",
      );
    await expect
      .element(notice())
      .toHaveTextContent("Vista previa: estás viendo la app como Asesor");
    await expect.element(page.getByTestId("can")).toHaveTextContent("false·asesor");
    await expect.poll(() => closed.length).toBe(1);
    await expect
      .poll(() => document.documentElement.style.getPropertyValue("--simbar-h"))
      .toMatch(/^[1-9]\d*px$/);

    await page.getByRole("button", { name: "Salir de la vista previa" }).click();
    await expect.element(page.getByTestId("can")).toHaveTextContent("true·nadie");
    expect(page.getByTestId("role-preview-bar").query()).toBeNull();
    expect(document.documentElement.style.getPropertyValue("--simbar-h")).toBe("");
  });
});
