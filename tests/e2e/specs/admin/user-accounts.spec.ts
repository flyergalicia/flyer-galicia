// What the administrator does on the accounts, and what auth-admin receives for each thing.
import { type Cloud } from "../../support/cloud/index.ts";
import { type OpenAppOptions, type OpenedApp } from "../../support/open-app.ts";
import { expect, test } from "../../support/test.ts";

const PENDING = "Pedro Pendiente";
const RESETTING = "Rita Cambio";
const ACTIVE = "Ana Activa";
const INACTIVE = "Inés Inactiva";
const PENDING_ID = "00000000-0000-4000-8000-0000000000a1";
const RESETTING_ID = "00000000-0000-4000-8000-0000000000a2";
const ACTIVE_ID = "00000000-0000-4000-8000-0000000000a3";
const INACTIVE_ID = "00000000-0000-4000-8000-0000000000a4";
const NEW_ACCOUNT = {
  name: "Nora Nueva",
  email: "nora.nueva@bancogalicia.com.ar",
  password: "ClaveNueva123",
};

function account(id: string, name: string, status: string) {
  const email = `${name.split(" ")[0]?.toLowerCase() ?? ""}@bancogalicia.com.ar`;
  return { id, full_name: name, email, email_asesor: email, role: "asesor", status };
}

function seedAccounts(cloud: Cloud): void {
  const admin = cloud.users.admin;
  cloud.profiles = [
    account(PENDING_ID, PENDING, "pending"),
    account(RESETTING_ID, RESETTING, "reset_pending"),
    account(ACTIVE_ID, ACTIVE, "active"),
    account(INACTIVE_ID, INACTIVE, "inactive"),
    account(admin?.id ?? "", admin?.name ?? "", "active"),
  ];
}

async function openUsers(openApp: (options?: OpenAppOptions) => Promise<OpenedApp>) {
  const app = await openApp({ user: "admin" });
  await app.admin.openPanel();
  await app.admin.openUsers();
  return app;
}

function callsOf(cloud: Cloud, action: string) {
  return cloud.adminCalls.filter((call) => call.action === action);
}

async function rowOf({ admin }: OpenedApp, name: string) {
  return (await admin.userRows()).find((row) => row.name === name);
}

test.describe("the accounts of the panel", () => {
  test.beforeEach(({ cloud }) => {
    seedAccounts(cloud);
  });

  test("each status offers what can be done with it", async ({ openApp }) => {
    const app = await openUsers(openApp);

    expect.soft((await rowOf(app, PENDING))?.actions).toEqual(["Aprobar", "Rechazar"]);
    expect.soft((await rowOf(app, RESETTING))?.actions).toEqual(["Aprobar cambio", "Rechazar"]);
    expect.soft((await rowOf(app, ACTIVE))?.actions).toEqual(["Desactivar", "Editar"]);
    expect.soft((await rowOf(app, INACTIVE))?.actions).toEqual(["Activar", "Editar"]);
    expect
      .soft((await rowOf(app, ACTIVE))?.canBeDeleted, "somebody else can be deleted")
      .toBe(true);
    expect.soft((await rowOf(app, "Admin Prueba"))?.canBeDeleted, "not oneself").toBe(false);
    await expect.poll(() => app.admin.pendingUsersBadge(), "two wait for a decision").toBe("2");
  });

  test("Aprobar goes through the server and the account stops waiting", async ({
    cloud,
    openApp,
  }) => {
    const app = await openUsers(openApp);

    await app.admin.pressUserAction(PENDING, "Aprobar");

    await expect
      .poll(() => callsOf(cloud, "approve_user"))
      .toEqual([{ action: "approve_user", uid: PENDING_ID }]);
    await expect.poll(async () => (await rowOf(app, PENDING))?.badges).toContain("Activo");
    expect.soft(await app.flyerEditor.latestNotice()).toBe("Usuario aprobado");
    await expect.poll(() => app.admin.pendingUsersBadge(), "one left to decide").toBe("1");
  });

  test("an Aprobar the server refuses says why and can be pressed again", async ({
    cloud,
    openApp,
  }) => {
    cloud.adminRefusal = { action: "approve_user", status: 500, message: "se cayó el mail" };
    const app = await openUsers(openApp);

    await app.admin.pressUserAction(PENDING, "Aprobar");

    await expect
      .poll(() => app.flyerEditor.latestNotice())
      .toBe("No se pudo aprobar: se cayó el mail");
    expect.soft((await rowOf(app, PENDING))?.badges, "it keeps waiting").toContain("Pendiente");
    cloud.adminRefusal = null;
    await app.admin.pressUserAction(PENDING, "Aprobar");
    await expect.poll(async () => (await rowOf(app, PENDING))?.badges).toContain("Activo");
  });

  const resets = [
    ["Aprobar cambio", "approve_reset", "Cambio de contraseña aprobado"],
    ["Rechazar", "deny_reset", "Cambio de contraseña rechazado"],
  ] as const;
  for (const [button, action, notice] of resets) {
    test(`${button} on a change of password goes through the server as ${action}`, async ({
      cloud,
      openApp,
    }) => {
      const app = await openUsers(openApp);

      await app.admin.pressUserAction(RESETTING, button);

      await expect.poll(() => callsOf(cloud, action)).toEqual([{ action, uid: RESETTING_ID }]);
      await expect.poll(async () => (await rowOf(app, RESETTING))?.badges).toContain("Activo");
      expect.soft(await app.flyerEditor.latestNotice()).toBe(notice);
    });

    test(`${button} that the server refuses leaves it waiting and says why`, async ({
      cloud,
      openApp,
    }) => {
      cloud.adminRefusal = { action, status: 500, message: "sin conexión al servidor" };
      const app = await openUsers(openApp);

      await app.admin.pressUserAction(RESETTING, button);

      await expect
        .poll(() => app.flyerEditor.latestNotice())
        .toBe("Error: sin conexión al servidor");
      expect.soft((await rowOf(app, RESETTING))?.badges).toContain("Cambio de clave");
    });
  }

  test("deleting asks first with its own window, and only yes reaches the server", async ({
    cloud,
    openApp,
  }) => {
    const app = await openUsers(openApp);

    await app.admin.pressDeleteUser(ACTIVE);
    expect.soft(await app.session.waitForConfirmation()).toMatch(/Eliminar definitivamente a Ana/);
    await app.session.answerConfirmation(false);
    expect.soft(callsOf(cloud, "delete_user"), "no means no").toEqual([]);

    await app.admin.pressDeleteUser(ACTIVE);
    await app.session.waitForConfirmation();
    await app.session.answerConfirmation(true);

    await expect
      .poll(() => callsOf(cloud, "delete_user"))
      .toEqual([{ action: "delete_user", uid: ACTIVE_ID }]);
    await expect.poll(() => rowOf(app, ACTIVE), "it leaves the list").toBeUndefined();
    expect.soft(await app.flyerEditor.latestNotice()).toBe("Usuario eliminado");
    expect.soft(app.dialogs(), "no window of the browser").toEqual([]);
  });

  test("deleting an account that was waiting lowers the number of the button at once", async ({
    openApp,
  }) => {
    const app = await openUsers(openApp);
    await expect.poll(() => app.admin.pendingUsersBadge(), "two wait for a decision").toBe("2");

    await app.admin.pressDeleteUser(PENDING);
    await app.session.waitForConfirmation();
    await app.session.answerConfirmation(true);
    await expect.poll(() => rowOf(app, PENDING), "it leaves the list").toBeUndefined();
    await expect.poll(() => app.admin.pendingUsersBadge(), "one left").toBe("1");

    await app.admin.pressDeleteUser(ACTIVE);
    await app.session.waitForConfirmation();
    await app.session.answerConfirmation(true);
    await expect.poll(() => rowOf(app, ACTIVE)).toBeUndefined();
    await expect.poll(() => app.admin.pendingUsersBadge(), "one nobody waits for").toBe("1");

    await app.admin.pressDeleteUser(RESETTING);
    await app.session.waitForConfirmation();
    await app.session.answerConfirmation(true);
    await expect.poll(() => rowOf(app, RESETTING)).toBeUndefined();
    await expect.poll(() => app.admin.pendingUsersBadge(), "none: the number leaves").toBe("");
  });

  test("a delete the server refuses keeps the account and says why", async ({ cloud, openApp }) => {
    cloud.adminRefusal = { action: "delete_user", status: 403, message: "No se puede" };
    const app = await openUsers(openApp);

    await app.admin.pressDeleteUser(ACTIVE);
    await app.session.waitForConfirmation();
    await app.session.answerConfirmation(true);

    await expect.poll(() => app.flyerEditor.latestNotice()).toBe("Error: No se puede");
    expect.soft(await rowOf(app, ACTIVE), "still there").toBeDefined();
  });

  test("a new account checks its fields before going to the server", async ({ cloud, openApp }) => {
    const { admin } = await openUsers(openApp);
    await admin.openNewUserForm();

    await admin.submitUserForm();
    await expect.poll(() => admin.userFormError()).toMatch(/nombre completo es requerido/);
    await admin.fillUserForm({ name: NEW_ACCOUNT.name, email: "sin-arroba" });
    await admin.submitUserForm();
    await expect.poll(() => admin.userFormError()).toMatch(/email válido/);
    await admin.fillUserForm({ email: NEW_ACCOUNT.email, password: "corta" });
    await admin.submitUserForm();
    await expect.poll(() => admin.userFormError()).toMatch(/al menos 8 caracteres/);

    expect.soft(callsOf(cloud, "create_user"), "nothing was sent").toEqual([]);
  });

  test("a new account goes with its profile and status, and appears on the list", async ({
    cloud,
    openApp,
  }) => {
    const app = await openUsers(openApp);
    await app.admin.openNewUserForm();
    await app.admin.fillUserForm({ ...NEW_ACCOUNT, profile: "Pro" });

    await app.admin.submitUserForm();

    await expect
      .poll(() => callsOf(cloud, "create_user"))
      .toEqual([
        {
          action: "create_user",
          email: NEW_ACCOUNT.email,
          password: NEW_ACCOUNT.password,
          full_name: NEW_ACCOUNT.name,
          role: "pro",
          status: "active",
        },
      ]);
    await app.admin.waitForUserFormClosed();
    await expect
      .poll(async () => (await rowOf(app, NEW_ACCOUNT.name))?.badges)
      .toEqual(["Pro", "Activo"]);
    expect.soft(await app.flyerEditor.latestNotice()).toMatch(/Usuario creado exitosamente/);
  });

  test("a new account with a leader saves the leader on that account", async ({
    cloud,
    openApp,
  }) => {
    const leaderId = "00000000-0000-4000-8000-0000000000a5";
    cloud.profiles?.push({ ...account(leaderId, "Lidia Líder", "active"), role: "lider" });
    const { admin } = await openUsers(openApp);
    await admin.openNewUserForm();
    await admin.fillUserForm({ ...NEW_ACCOUNT, leader: "Lidia Líder" });

    await admin.submitUserForm();
    await admin.waitForUserFormClosed();

    expect
      .soft(cloud.profiles?.find((row) => row.email === NEW_ACCOUNT.email)?.lider_id)
      .toBe(leaderId);
  });

  test("a mail the server refuses stays on the form, which can be sent again", async ({
    cloud,
    openApp,
  }) => {
    cloud.adminRefusal = {
      action: "create_user",
      status: 400,
      message: "Sólo se aceptan mails @bancogalicia.com.ar",
    };
    const { admin } = await openUsers(openApp);
    await admin.openNewUserForm();
    await admin.fillUserForm({ ...NEW_ACCOUNT, email: "nora@otro.com" });

    await admin.submitUserForm();

    await expect.poll(() => admin.userFormError()).toMatch(/Sólo se aceptan mails/);
    expect.soft(await admin.userFormButton()).toEqual({ text: "Crear usuario", locked: false });
  });

  test("editing an account into active also sends its notice, by approving it", async ({
    cloud,
    openApp,
  }) => {
    const { admin } = await openUsers(openApp);
    await admin.openEditUserForm(INACTIVE);
    await admin.fillUserForm({ status: "Activo" });

    await admin.submitUserForm();
    await admin.waitForUserFormClosed();

    await expect
      .poll(() => callsOf(cloud, "approve_user"))
      .toEqual([{ action: "approve_user", uid: INACTIVE_ID }]);
    expect.soft(cloud.profiles?.find(({ id }) => id === INACTIVE_ID)?.status).toBe("active");
  });

  test("editing an account that was already active sends no notice", async ({ cloud, openApp }) => {
    const { admin } = await openUsers(openApp);
    await admin.openEditUserForm(ACTIVE);
    await admin.fillUserForm({ name: "Ana Renombrada" });

    await admin.submitUserForm();
    await admin.waitForUserFormClosed();

    expect
      .soft(cloud.profiles?.find(({ id }) => id === ACTIVE_ID)?.full_name)
      .toBe("Ana Renombrada");
    expect.soft(callsOf(cloud, "approve_user")).toEqual([]);
  });
});
