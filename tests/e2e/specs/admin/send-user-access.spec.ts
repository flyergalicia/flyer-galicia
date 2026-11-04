// Replaces pruebas/t91_usuario_enviar_acceso.cjs.
import { expect, test } from "../../support/test.ts";

const NEW_PASSWORD = "ClaveNueva123";
const NAME = "Asesor Prueba";

test.describe("sending the access by mail when a password changes", () => {
  test.beforeEach(({ cloud }) => {
    const { id, email } = cloud.users.asesor ?? { id: "", email: "" };
    cloud.profiles = [
      { id, email, email_asesor: email, full_name: NAME, role: "asesor", status: "active" },
    ];
  });

  test("a new user never gets the option: the welcome mail already has the password", async ({
    openApp,
  }) => {
    const { admin } = await openApp({ user: "admin" });
    await admin.openPanel();
    await admin.openUsers();

    await admin.openNewUserForm();
    await admin.setUserFormPassword(NEW_PASSWORD);

    expect.soft(await admin.sendAccessOptionVisible(), "no option on Nuevo usuario").toBe(false);
  });

  test("the option appears with a new password and sends to the chosen address", async ({
    cloud,
    openApp,
  }) => {
    const account = cloud.users.asesor;
    const { admin } = await openApp({ user: "admin" });
    await admin.openPanel();
    await admin.openUsers();
    await admin.openEditUserForm(NAME);

    expect.soft(await admin.sendAccessOptionVisible(), "hidden without a password").toBe(false);
    await admin.setUserFormPassword(NEW_PASSWORD);
    expect.soft(await admin.sendAccessOptionVisible(), "visible with a new password").toBe(true);
    expect.soft(await admin.sendAccessFieldsVisible(), "no fields until it is checked").toBe(false);
    await admin.checkSendAccess();
    expect.soft(await admin.sendAccessFieldsVisible(), "checked: the fields appear").toBe(true);
    expect
      .soft((await admin.sendAccessFields()).to, '"Enviar a" starts with the mail of the account')
      .toBe(account?.email);

    // An invalid address: nothing changes.
    await admin.fillSendAccess({ to: "jefe-sin-arroba" });
    cloud.adminCalls.length = 0;
    await admin.submitUserForm();
    expect.soft(await admin.userFormError(), "it warns").toMatch(/a qué mail/);
    expect.soft(cloud.adminCalls, "and asks for nothing").toEqual([]);

    // The address of the boss travels with the password change.
    await admin.fillSendAccess({ to: "jefe@bancogalicia.com.ar", greeting: "Carlos" });
    await admin.submitUserForm();
    await admin.waitForUserFormClosed();
    expect
      .soft(
        cloud.adminCalls.find(({ action }) => action === "set_password"),
        "it changes the password and asks to mail user + password to the chosen address",
      )
      .toMatchObject({
        uid: account?.id,
        password: NEW_PASSWORD,
        enviar_a: "jefe@bancogalicia.com.ar",
        enviar_nombre: "Carlos",
      });

    // Opened again, it starts unchecked.
    await admin.openEditUserForm(NAME);
    await admin.setUserFormPassword("OtraClave456");
    expect.soft(await admin.sendAccessOptionChecked(), "reopened: unchecked").toBe(false);
    expect.soft(await admin.sendAccessFieldsVisible(), "reopened: no fields").toBe(false);
    cloud.adminCalls.length = 0;
    await admin.submitUserForm();
    await admin.waitForUserFormClosed();
    const call = cloud.adminCalls.find(({ action }) => action === "set_password");
    expect.soft(call, "unchecked: the password still changes").toBeDefined();
    expect.soft(call?.enviar_a, "unchecked: it does not send the access").toBeUndefined();
  });
});
