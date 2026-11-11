// Admin → Usuarios: what each status offers, what goes through auth-admin, and the window of a user.
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { COMMERCIAL_PEOPLE_QUERY_KEY } from "@/shared/lib/commercial-actions/people-query.ts";
import { FIRST_PLACE, goToSheet, rememberPlace } from "../model/panel.ts";
import { ME, openPanel, type PanelOptions } from "../testing/panel-cloud.ts";

const panel = () => page.getByTestId("admin-panel");
const rowOf = (name: string) =>
  panel()
    .getByTestId("account-row")
    .filter({ has: page.getByText(name, { exact: true }) });
const button = (name: string, label: string) =>
  rowOf(name).getByRole("button", { name: label, exact: true });
const notice = () => page.getByRole("status");
const form = () => page.getByRole("dialog", { name: /Nuevo usuario|Editar usuario/ });
const formField = (label: string) => form().getByLabelText(label, { exact: true });
const formError = () => form().getByTestId("account-form-error");
const submit = () => form().getByTestId("account-form-submit");

/** The window puts the cursor on the name a moment after opening: typing waits for it. */
async function openForm(press: () => Promise<void>) {
  await press();
  await expect.element(formField("Nombre completo")).toHaveFocus();
}

function person(id: string, name: string, status: string, role = "asesor") {
  const email = `${name.split(" ")[0]?.toLowerCase() ?? ""}@bancogalicia.com.ar`;
  return { id, full_name: name, email, email_asesor: email, role, status };
}

const ACCOUNTS = () => [
  person("p1", "Pedro Pendiente", "pending"),
  person("r1", "Rita Cambio", "reset_pending"),
  person("a1", "Ana Activa", "active", "vip"),
  { ...person("i1", "Inés Inactiva", "inactive"), last_login: "2026-10-01T10:00:00Z" },
  person("l1", "Lidia Líder", "active", "lider"),
  person(ME, "Admin Inventado", "active", "admin"),
  { id: "z1", full_name: null, email: null, email_asesor: null, role: null, status: "active" },
];

async function openUsers(options: PanelOptions = {}) {
  rememberPlace(goToSheet(FIRST_PLACE, "usuarios"));
  const opened = await openPanel({ accounts: ACCOUNTS(), ...options });
  await expect.element(rowOf("Ana Activa")).toBeVisible();
  return opened;
}

function calls(harness: Awaited<ReturnType<typeof openPanel>>["harness"], action: string) {
  return harness.adminCalls().filter((body) => Object(body).action === action);
}

afterEach(() => {
  rememberPlace(FIRST_PLACE);
  vi.restoreAllMocks();
});

describe("the list of users", () => {
  it("offers on each status what can be done, and never deleting oneself", async () => {
    await openUsers();
    const labels = (name: string) =>
      Array.from(
        rowOf(name).element().querySelectorAll("button:not([aria-label])"),
        (one) => one.textContent,
      );
    expect(labels("Pedro Pendiente")).toEqual(["Aprobar", "Rechazar"]);
    expect(labels("Rita Cambio")).toEqual(["Aprobar cambio", "Rechazar"]);
    expect(labels("Ana Activa")).toEqual(["Desactivar", "Editar"]);
    expect(labels("Inés Inactiva")).toEqual(["Activar", "Editar"]);
    await expect.element(rowOf("Pedro Pendiente")).not.toMatchTextContent(/Asesor/);
    await expect.element(rowOf("Ana Activa")).toMatchTextContent(/VIPActivo/);
    await expect.element(rowOf("Inés Inactiva")).toMatchTextContent(/Últ. acceso: 01\/10\/2026/);
    await expect.element(rowOf("Ana Activa")).toMatchTextContent(/Sin accesos/);
    expect(
      rowOf("Admin Inventado").getByRole("button", { name: "Eliminar usuario" }).query(),
    ).toBeNull();
    await expect.element(button("Ana Activa", "Eliminar usuario")).toBeVisible();
    await expect
      .element(rowOf("Sin nombre"))
      .toMatchTextContent(/^\?\?Sin nombre\s*·\s*Últ\. acceso: Sin accesosAsesorActivo/);
  });

  it("is searched by name or mail and filtered by status", async () => {
    await openUsers();
    await userEvent.fill(panel().getByRole("textbox", { name: "Buscar usuarios" }), "RITA");
    await expect.element(rowOf("Ana Activa")).not.toBeInTheDocument();
    await expect.element(rowOf("Rita Cambio")).toBeVisible();
    await userEvent.fill(panel().getByRole("textbox", { name: "Buscar usuarios" }), "");
    await userEvent.selectOptions(panel().getByRole("combobox", { name: "Estado" }), "Inactivos");
    await expect.element(panel().getByTestId("account-row")).toHaveLength(1);
    await userEvent.fill(panel().getByRole("textbox", { name: "Buscar usuarios" }), "nadie");
    await expect.element(panel()).toMatchTextContent(/Sin resultados/);
  });

  it("a list that could not be read says so, never that there are no users", async () => {
    let fail = true;
    rememberPlace(goToSheet(FIRST_PLACE, "usuarios"));
    await openPanel({
      accounts: ACCOUNTS(),
      intercept: ({ path, method, query }) =>
        fail && path === "/rest/v1/profiles" && method === "GET" && query.get("select") === "*"
          ? new Response(JSON.stringify({ message: "sin red" }), { status: 503 })
          : null,
    });
    await expect
      .element(panel().getByTestId("read-problem"))
      .toMatchTextContent(/No se pudieron leer los usuarios/);
    expect(panel().element().textContent).not.toMatch(/Sin resultados/);
    fail = false;
    await panel().getByRole("button", { name: "Reintentar" }).click();
    await expect.element(rowOf("Ana Activa")).toBeVisible();
  });
});

describe("what goes through auth-admin", () => {
  it("Aprobar sends its mail, and the number of the button reads again", async () => {
    const { harness } = await openUsers();
    const invalidate = vi.spyOn(harness.queryClient, "invalidateQueries");
    await button("Pedro Pendiente", "Aprobar").click();
    await expect.element(notice()).toHaveTextContent("Usuario aprobado");
    expect(calls(harness, "approve_user")).toEqual([{ action: "approve_user", uid: "p1" }]);
    await expect.element(rowOf("Pedro Pendiente")).toMatchTextContent(/Activo/);
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toContainEqual([
      "admin",
      "pending-accounts",
    ]);
  });

  it("an Aprobar refused says why, keeps the account waiting and can be pressed again", async () => {
    const { harness, cloud } = await openUsers({
      refusals: { approve_user: { status: 500, message: "se cayó el mail" } },
    });
    await button("Pedro Pendiente", "Aprobar").click();
    await expect.element(notice()).toHaveTextContent("No se pudo aprobar: se cayó el mail");
    await expect.element(rowOf("Pedro Pendiente")).toMatchTextContent(/Pendiente/);
    cloud.refusals = {};
    await button("Pedro Pendiente", "Aprobar").click();
    await expect.element(rowOf("Pedro Pendiente")).toMatchTextContent(/Activo/);
    expect(calls(harness, "approve_user")).toHaveLength(2);
  });

  it("a change of password is applied or discarded on the server, and a refusal says why", async () => {
    const { harness, cloud } = await openUsers({
      refusals: { deny_reset: { status: 500, message: "sin conexión al servidor" } },
    });
    await button("Rita Cambio", "Rechazar").click();
    await expect.element(notice()).toHaveTextContent("Error: sin conexión al servidor");
    await expect.element(rowOf("Rita Cambio")).toMatchTextContent(/Cambio de clave/);
    cloud.refusals = {};
    await button("Rita Cambio", "Rechazar").click();
    await expect.element(notice()).toHaveTextContent("Cambio de contraseña rechazado");
    expect(calls(harness, "deny_reset")).toHaveLength(2);
  });

  it("Aprobar cambio applies the password asked for", async () => {
    const { harness } = await openUsers();
    await button("Rita Cambio", "Aprobar cambio").click();
    await expect.element(notice()).toHaveTextContent("Cambio de contraseña aprobado");
    expect(calls(harness, "approve_reset")).toEqual([{ action: "approve_reset", uid: "r1" }]);
  });

  it("deleting asks first, and only yes reaches the server", async () => {
    const { harness } = await openUsers();
    await button("Ana Activa", "Eliminar usuario").click();
    const question = page.getByRole("alertdialog");
    await expect.element(question).toMatchTextContent(/¿Eliminar definitivamente a Ana Activa\?/);
    await expect.element(question).toMatchTextContent(/no se puede deshacer/);
    await question.getByRole("button", { name: "Cancelar" }).click();
    expect(calls(harness, "delete_user")).toEqual([]);

    await button("Ana Activa", "Eliminar usuario").click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Eliminar usuario" }).click();
    await expect.element(notice()).toHaveTextContent("Usuario eliminado");
    expect(calls(harness, "delete_user")).toEqual([{ action: "delete_user", uid: "a1" }]);
    await expect.element(rowOf("Ana Activa")).not.toBeInTheDocument();
  });

  it("a delete refused keeps the account and says why", async () => {
    await openUsers({ refusals: { delete_user: { status: 403, message: "No se puede" } } });
    await button("Ana Activa", "Eliminar usuario").click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Eliminar usuario" }).click();
    await expect.element(notice()).toHaveTextContent("Error: No se puede");
    await expect.element(rowOf("Ana Activa")).toBeVisible();
  });
});

describe("what changes the profile directly", () => {
  it("Rechazar a pending one, Desactivar and Activar change its status", async () => {
    const { cloud } = await openUsers();
    await button("Pedro Pendiente", "Rechazar").click();
    await expect.element(notice()).toHaveTextContent("Usuario desactivado");
    await button("Inés Inactiva", "Activar").click();
    await expect.element(notice()).toHaveTextContent("Usuario activado");
    const changes = cloud.profileChanges.filter(({ body }) => !("last_login" in Object(body)));
    expect(changes.map(({ query, body }) => [query, body])).toEqual([
      ["id=eq.p1", { status: "inactive" }],
      ["id=eq.i1", { status: "active" }],
    ]);
  });

  it("a status the database refuses says why", async () => {
    await openUsers({ profileRefusal: "permiso denegado" });
    await button("Ana Activa", "Desactivar").click();
    await expect
      .element(notice())
      .toHaveTextContent("No se pudo cambiar el estado: permiso denegado");
    await expect.element(button("Ana Activa", "Desactivar")).toBeEnabled();
  });
});

describe("a new account", () => {
  it("checks its fields before sending anything", async () => {
    const { harness } = await openUsers();
    await openForm(() => panel().getByRole("button", { name: "+ Nuevo usuario" }).click());
    await submit().click();
    await expect.element(formError()).toHaveTextContent("El nombre completo es requerido.");
    await userEvent.fill(formField("Nombre completo"), "Nora Nueva");
    await userEvent.fill(formField("Email"), "sin-arroba");
    await submit().click();
    await expect.element(formError()).toHaveTextContent("Ingresá un email válido.");
    await userEvent.fill(formField("Email"), "nora@bancogalicia.com.ar");
    await userEvent.fill(formField("Contraseña"), "corta");
    await submit().click();
    await expect
      .element(formError())
      .toHaveTextContent("La contraseña debe tener al menos 8 caracteres.");
    expect(calls(harness, "create_user")).toEqual([]);
    expect(form().getByText("Enviar usuario y contraseña por mail").query()).toBeNull();
  });

  it("goes to auth-admin with its profile and status, and its leader after it exists", async () => {
    const { harness, cloud } = await openUsers();
    const invalidate = vi.spyOn(harness.queryClient, "invalidateQueries");
    await openForm(() => panel().getByRole("button", { name: "+ Nuevo usuario" }).click());
    await userEvent.fill(formField("Nombre completo"), " Nora Nueva ");
    await userEvent.fill(formField("Email"), "Nora@bancogalicia.com.ar");
    await userEvent.fill(formField("Contraseña"), "ClaveNueva123");
    await userEvent.selectOptions(formField("Rol"), "Pro");
    await userEvent.selectOptions(formField("Líder a cargo"), "Lidia Líder");
    await submit().click();
    await expect.element(notice()).toHaveTextContent("✅ Usuario creado exitosamente");
    expect(calls(harness, "create_user")).toEqual([
      {
        action: "create_user",
        email: "Nora@bancogalicia.com.ar",
        password: "ClaveNueva123",
        full_name: "Nora Nueva",
        role: "pro",
        status: "active",
      },
    ]);
    expect(cloud.profileChanges.at(-1)).toEqual({
      query: "email=eq.nora%40bancogalicia.com.ar",
      body: { lider_id: "l1" },
    });
    await expect.element(form()).not.toBeInTheDocument();
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toContainEqual(
      COMMERCIAL_PEOPLE_QUERY_KEY,
    );
  });

  it("a mail the server refuses stays on the form, which can be sent again", async () => {
    await openUsers({
      refusals: {
        create_user: { status: 400, message: "Sólo se aceptan mails @bancogalicia.com.ar" },
      },
    });
    await openForm(() => panel().getByRole("button", { name: "+ Nuevo usuario" }).click());
    await userEvent.fill(formField("Nombre completo"), "Nora");
    await userEvent.fill(formField("Email"), "nora@otro.com");
    await userEvent.fill(formField("Contraseña"), "ClaveNueva123");
    await submit().click();
    await expect
      .element(formError())
      .toHaveTextContent("Sólo se aceptan mails @bancogalicia.com.ar");
    await expect.element(submit()).toHaveTextContent("Crear usuario");
    await expect.element(submit()).toBeEnabled();
  });

  it("without leaders, there is no field for one", async () => {
    await openUsers({ accounts: [person("a1", "Ana Activa", "active")] });
    await openForm(() => panel().getByRole("button", { name: "+ Nuevo usuario" }).click());
    expect(form().getByLabelText("Líder a cargo").query()).toBeNull();
    await form().getByRole("button", { name: "Cancelar" }).click();
    await expect.element(form()).not.toBeInTheDocument();
  });
});

describe("editing an account", () => {
  it("into active approves it, which sends its mail; an account already active sends none", async () => {
    const { harness, cloud } = await openUsers();
    await openForm(() => button("Inés Inactiva", "Editar").click());
    await expect.element(formField("Email")).toBeDisabled();
    await userEvent.selectOptions(formField("Estado"), "Activo");
    await submit().click();
    await expect.element(notice()).toHaveTextContent("Usuario actualizado");
    await expect
      .poll(() => calls(harness, "approve_user"))
      .toEqual([{ action: "approve_user", uid: "i1" }]);
    expect(cloud.profileChanges.at(-1)?.body).toEqual({
      full_name: "Inés Inactiva",
      role: "asesor",
      status: "active",
      lider_id: null,
    });

    await openForm(() => button("Ana Activa", "Editar").click());
    await userEvent.fill(formField("Nombre completo"), "Ana Renombrada");
    await submit().click();
    await expect.element(form()).not.toBeInTheDocument();
    expect(calls(harness, "approve_user")).toHaveLength(1);
  });

  it("a profile the database refuses stays on the form and says why", async () => {
    await openUsers({ profileRefusal: "permiso denegado" });
    await openForm(() => button("Ana Activa", "Editar").click());
    await submit().click();
    await expect.element(formError()).toHaveTextContent("permiso denegado");
    await expect.element(submit()).toHaveTextContent("Guardar cambios");
  });

  it("a new password goes through auth-admin, and with the option, the access by mail", async () => {
    const { harness } = await openUsers();
    await openForm(() => button("Ana Activa", "Editar").click());
    expect(form().getByText("Enviar usuario y contraseña por mail").query()).toBeNull();
    await userEvent.fill(formField("Nueva contraseña (opcional)"), "corta");
    await submit().click();
    await expect
      .element(formError())
      .toHaveTextContent("La nueva contraseña debe tener al menos 8 caracteres.");

    await userEvent.fill(formField("Nueva contraseña (opcional)"), "ClaveNueva123");
    await form().getByLabelText("Enviar usuario y contraseña por mail").click();
    await expect.element(formField("Enviar a")).toHaveValue("ana@bancogalicia.com.ar");
    await expect.element(formField("Enviar a")).toHaveFocus();
    await userEvent.fill(formField("Enviar a"), "jefe-sin-arroba");
    await submit().click();
    await expect
      .element(formError())
      .toHaveTextContent("Escribí a qué mail mandar el usuario y la contraseña.");
    expect(calls(harness, "set_password")).toEqual([]);

    await userEvent.fill(formField("Enviar a"), "jefe@bancogalicia.com.ar");
    await userEvent.fill(formField("Nombre de quien lo recibe (opcional)"), "Carlos");
    await submit().click();
    await expect
      .element(notice())
      .toHaveTextContent(
        "Contraseña cambiada. Usuario y contraseña enviados a jefe@bancogalicia.com.ar.",
      );
    expect(calls(harness, "set_password")).toEqual([
      {
        action: "set_password",
        uid: "a1",
        password: "ClaveNueva123",
        enviar_a: "jefe@bancogalicia.com.ar",
        enviar_nombre: "Carlos",
      },
    ]);

    await openForm(() => button("Ana Activa", "Editar").click());
    await userEvent.fill(formField("Nueva contraseña (opcional)"), "OtraClave456");
    await expect
      .element(form().getByLabelText("Enviar usuario y contraseña por mail"))
      .not.toBeChecked();
    await submit().click();
    await expect.element(notice()).toHaveTextContent("Usuario actualizado y contraseña cambiada");
    expect(calls(harness, "set_password").at(-1)).toEqual({
      action: "set_password",
      uid: "a1",
      password: "OtraClave456",
    });
  });

  it("a password refused stays on the form and says why", async () => {
    await openUsers({ refusals: { set_password: { status: 400, message: "clave débil" } } });
    await openForm(() => button("Ana Activa", "Editar").click());
    await userEvent.fill(formField("Nueva contraseña (opcional)"), "ClaveNueva123");
    await submit().click();
    await expect.element(formError()).toHaveTextContent("clave débil");
  });

  it("a leader is not offered as their own leader", async () => {
    await openUsers();
    await openForm(() => button("Lidia Líder", "Editar").click());
    expect(form().getByLabelText("Líder a cargo").query()).toBeNull();
  });
});
