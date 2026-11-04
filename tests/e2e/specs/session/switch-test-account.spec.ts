// Replaces pruebas/t94_cambiar_de_cuenta.cjs.
import { expect, test } from "../../support/test.ts";

const softly = expect.configure({ soft: true });
const HUNTER_ID = "00000000-0000-4000-8000-00000000beef";
const LEADER_ID = "00000000-0000-4000-8000-00000000cafe";
const HUNTER = "Nicolas Ferrari";
const LEADER = "Martin Romero";
const WAIT_FOR_LIST_MS = 15_000;
// Long enough for the app to have sent a request, if it were going to.
const REQUEST_WINDOW_MS = 600;

test.describe("jumping to another test account from the name menu", () => {
  test.beforeEach(({ cloud }) => {
    cloud.testAccounts = [
      {
        id: HUNTER_ID,
        full_name: HUNTER,
        email: "pruebahunter@bancogalicia.com.ar",
        role: "hunter",
      },
      { id: LEADER_ID, full_name: LEADER, email: "pruebalider@bancogalicia.com.ar", role: "lider" },
    ];
  });

  test.describe("from a test account", () => {
    test.beforeEach(({ cloud }) => {
      cloud.isTestAccount = true;
    });

    test("it offers the others and redeems the one-use permission the server sends", async ({
      cloud,
      openApp,
    }) => {
      const app = await openApp();
      const { page, session } = app;

      await softly
        .poll(() => session.accountSwitcher(), {
          message: 'a test account sees "Cambiar de cuenta" in the name menu',
          timeout: WAIT_FOR_LIST_MS,
        })
        .toMatchObject({ heading: "Cambiar de cuenta" });
      const switcher = await session.accountSwitcher();
      expect.soft(switcher?.accounts, "with the other accounts and the profile of each").toEqual([
        { name: HUNTER, profile: "Hunter" },
        { name: LEADER, profile: "Líder" },
      ]);
      expect
        .soft(
          switcher?.accounts.map(({ name }) => name),
          "and it does not offer itself",
        )
        .not.toContain("Asesor Prueba");
      expect
        .soft(
          cloud.adminCalls.map(({ action }) => action),
          "the list comes from the server, it is not kept",
        )
        .toContain("cuentas_prueba");
      expect
        .soft(await session.browserStoresOtherAccounts(), "no session is kept in the browser")
        .toBe(false);

      cloud.adminCalls.length = 0;
      await session.switchToAccount(HUNTER);

      await softly
        .poll(() => cloud.signInRedemptions.length, {
          message: "touching an account redeems the permission",
        })
        .toBe(1);
      const permissions = cloud.adminCalls.filter(({ action }) => action === "entrar_como");
      expect
        .soft(permissions, "the server was asked for the permission for that account")
        .toEqual([{ action: "entrar_como", uid: HUNTER_ID }]);
      expect
        .soft(cloud.signInRedemptions[0], "it redeems the one-use permission the server sent")
        .toMatchObject({ token_hash: `th-${HUNTER_ID}`, type: "magiclink" });

      await session.switchToAccount(LEADER);
      await page.waitForTimeout(REQUEST_WINDOW_MS);
      expect
        .soft(cloud.signInRedemptions, "touching another one meanwhile redeems nothing else")
        .toHaveLength(1);
      expect
        .soft(
          cloud.adminCalls.filter(({ action }) => action === "entrar_como"),
          "and asks for no second permission",
        )
        .toHaveLength(1);
      expect.soft(app.pageErrors(), "no JavaScript errors").toEqual([]);
    });

    test("an account that is no longer a test account is refused, and it says so", async ({
      cloud,
      openApp,
    }) => {
      const app = await openApp();
      await expect
        .poll(() => app.session.accountSwitcher(), { timeout: WAIT_FOR_LIST_MS })
        .not.toBeNull();

      // The server is the one that decides: its list no longer has the account on screen.
      cloud.testAccounts = cloud.testAccounts.filter(({ id }) => id !== HUNTER_ID);
      await app.session.switchToAccount(HUNTER);

      await expect
        .soft(
          app.page.getByText(/No se pudo cambiar de cuenta/),
          "asking for one that is not a test account is refused and it warns",
        )
        .toBeVisible({ timeout: WAIT_FOR_LIST_MS });
      expect.soft(cloud.signInRedemptions, "nothing to redeem").toEqual([]);
    });
  });

  test("a common account sees none of this and does not even ask", async ({ cloud, openApp }) => {
    cloud.isTestAccount = false;
    const app = await openApp();
    await app.page.waitForTimeout(REQUEST_WINDOW_MS);

    expect.soft(await app.session.accountSwitcher(), "no switcher for a common account").toBeNull();
    expect
      .soft(
        cloud.adminCalls.map(({ action }) => action),
        "and it does not even ask the server",
      )
      .not.toContain("cuentas_prueba");
  });
});
