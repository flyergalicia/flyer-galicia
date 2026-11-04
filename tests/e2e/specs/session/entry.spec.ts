// Protects how a user gets in: the rules of "ingreso:", "sesion:", "registro:" and "arranque:".
import { gate } from "../../support/settled.ts";
import { expect, test } from "../../support/test.ts";

const PROFILE = "**/rest/v1/profiles*";
const RETRY_AFTER_MS = 12_000;

test.describe("with no session", { tag: "@react" }, () => {
  test("the form is what shows, and the app stays hidden behind it", async ({ openApp }) => {
    const { session } = await openApp({ signedOut: true, waitUntilReady: false });

    await expect.poll(() => session.entryView()).toBe("login");
    expect.soft(await session.isShowing("flyer-layout")).toBe(false);
    expect.soft((await session.status()).signedIn).toBe(false);
  });

  const refusals = [
    ["a wrong password", 400, "Invalid login credentials", /Mail o contrase.a incorrectos/],
    ["too many tries", 429, "For security purposes, wait", /Demasiados intentos/],
    ["anything else", 500, "boom", /No se pudo ingresar/],
  ] as const;
  for (const [what, status, message, expected] of refusals) {
    test(`${what} is told in Spanish, and the button works again`, async ({ cloud, openApp }) => {
      cloud.signInRefusal = { status, message };
      const { session } = await openApp({ signedOut: true, waitUntilReady: false });

      await session.signIn("a@bancogalicia.com.ar", "secreto123");

      await expect.poll(() => session.entryText()).toMatch(expected);
      expect.soft(await session.entryText(), "no technical English").not.toContain(message);
      expect.soft(await session.signInButtonBusy()).toBe(false);
    });
  }

  test("a network cut while signing in says so and frees the button", async ({
    cloud,
    openApp,
  }) => {
    cloud.signInRefusal = "offline";
    const { session } = await openApp({ signedOut: true, waitUntilReady: false });

    await session.signIn("a@bancogalicia.com.ar", "secreto123");

    await expect.poll(() => session.entryText()).toMatch(/No se pudo conectar/);
    expect.soft(await session.signInButtonBusy()).toBe(false);
  });

  test("the right password goes in", async ({ openApp }) => {
    const { session } = await openApp({ signedOut: true, waitUntilReady: false });

    await session.signIn("asesor.prueba@bancogalicia.com.ar", "secreto123");

    await session.waitUntilSignedIn();
    await expect.poll(() => session.entryView()).toBe("app");
  });

  test("only mails of the bank can ask for an account", async ({ cloud, openApp }) => {
    const { session } = await openApp({ signedOut: true, waitUntilReady: false });
    await session.showRegisterForm();
    expect.soft((await session.registerMessages()).passwordHint).toMatch(/M.nimo 8 caracteres/);

    await session.submitRegisterForm({
      name: "Ana",
      email: "ana@gmail.com",
      password: "secreto123",
    });
    expect
      .soft((await session.registerMessages()).error)
      .toMatch(/S.lo se aceptan mails @bancogalicia/);

    await session.submitRegisterForm({
      name: "Ana",
      email: "ana@bancogalicia.com.ar",
      password: "corta",
    });
    expect.soft((await session.registerMessages()).error).toMatch(/al menos 8 caracteres/);
    expect.soft(cloud.adminCalls, "nothing was sent so far").toEqual([]);

    await session.submitRegisterForm({
      name: "Ana",
      email: "ANA@bancogalicia.com.ar",
      password: "secreto123",
    });
    await expect.poll(() => cloud.adminCalls.length).toBe(1);
    expect.soft(cloud.adminCalls[0]?.action).toBe("register");
    await expect
      .poll(
        async () => (await session.registerMessages()).ok,
        "the answer does not tell who exists",
      )
      .toMatch(/Si el mail es v.lido/);
  });
});

test.describe("having forgotten the password", { tag: "@react" }, () => {
  const ASKED = { email: "ana.perez@bancogalicia.com.ar", password: "ClaveNueva123" };

  test("it checks the fields before going to the server", async ({ cloud, openApp }) => {
    const { session } = await openApp({ signedOut: true, waitUntilReady: false });
    await session.showForgottenPasswordForm();

    await session.submitForgottenPasswordForm({ email: "", password: "", repeat: "" });
    expect.soft((await session.forgottenPasswordMessages()).error).toMatch(/Ingres. tu email/);
    await session.submitForgottenPasswordForm({ ...ASKED, password: "corta", repeat: "corta" });
    expect.soft((await session.forgottenPasswordMessages()).error).toMatch(/al menos 8 caracteres/);
    await session.submitForgottenPasswordForm({ ...ASKED, repeat: "OtraClave123" });
    expect.soft((await session.forgottenPasswordMessages()).error).toMatch(/no coinciden/);

    expect.soft(cloud.adminCalls, "nothing was sent").toEqual([]);
  });

  test("the request goes to the server, which keeps it for the administrator", async ({
    cloud,
    openApp,
  }) => {
    const { session } = await openApp({ signedOut: true, waitUntilReady: false });
    await session.showForgottenPasswordForm();

    await session.submitForgottenPasswordForm({ ...ASKED, repeat: ASKED.password });

    await expect.poll(() => cloud.adminCalls).toEqual([{ action: "request_reset", ...ASKED }]);
    await expect
      .poll(async () => (await session.forgottenPasswordMessages()).ok)
      .toMatch(/pendiente de aprobaci.n del administrador/);
    expect.soft((await session.forgottenPasswordMessages()).locked).toBe(false);
    expect.soft((await session.status()).signedIn, "it does not get in").toBe(false);
  });

  test("a refusal of the server is shown, and it can be sent again", async ({ cloud, openApp }) => {
    cloud.adminRefusal = {
      action: "request_reset",
      status: 429,
      message: "Demasiados pedidos seguidos",
    };
    const { session } = await openApp({ signedOut: true, waitUntilReady: false });
    await session.showForgottenPasswordForm();

    await session.submitForgottenPasswordForm({ ...ASKED, repeat: ASKED.password });

    await expect
      .poll(async () => (await session.forgottenPasswordMessages()).error)
      .toBe("Demasiados pedidos seguidos");
    const messages = await session.forgottenPasswordMessages();
    expect.soft(messages.ok).toBe("");
    expect.soft(messages.locked).toBe(false);
  });
});

test.describe("changing the password from the name menu", { tag: "@react" }, () => {
  const CURRENT = "ClaveActual123";
  const NEW = "ClaveNueva456";

  test("it checks the fields and asks nothing of the server", async ({ cloud, openApp }) => {
    const { session } = await openApp();
    await session.openPasswordWindow();

    await session.submitPasswordWindow({ current: "", password: NEW, repeat: NEW });
    expect.soft((await session.passwordWindowMessages()).error).toMatch(/contrase.a actual/);
    await session.submitPasswordWindow({ current: CURRENT, password: "corta", repeat: "corta" });
    expect.soft((await session.passwordWindowMessages()).error).toMatch(/al menos 8 caracteres/);
    await session.submitPasswordWindow({ current: CURRENT, password: NEW, repeat: "Otra12345" });
    expect.soft((await session.passwordWindowMessages()).error).toMatch(/no coinciden/);
    await session.submitPasswordWindow({ current: CURRENT, password: CURRENT, repeat: CURRENT });
    expect.soft((await session.passwordWindowMessages()).error).toMatch(/distinta de la actual/);

    expect.soft(cloud.passwordChanges).toEqual([]);
    expect.soft(cloud.adminCalls).toEqual([]);
  });

  test("it changes it, sends the notice and the window closes by itself", async ({
    cloud,
    openApp,
  }) => {
    const { session, flyerEditor } = await openApp();
    await session.openPasswordWindow();

    await session.submitPasswordWindow({ current: CURRENT, password: NEW, repeat: NEW });

    await expect.poll(() => cloud.passwordChanges).toEqual([NEW]);
    await expect
      .poll(() => cloud.adminCalls.filter(({ action }) => action === "notify_self_password"))
      .toEqual([{ action: "notify_self_password" }]);
    expect.soft((await session.passwordWindowMessages()).ok).toMatch(/se cambi. correctamente/);
    expect.soft(await flyerEditor.latestNotice()).toBe("Contraseña actualizada");
    await expect.poll(() => session.passwordWindowOpen(), { timeout: 4000 }).toBe(false);
  });

  test("with a wrong current password nothing changes and no notice goes out", async ({
    cloud,
    openApp,
  }) => {
    cloud.signInRefusal = { status: 400, message: "Invalid login credentials" };
    const { session } = await openApp();
    await session.openPasswordWindow();

    await session.submitPasswordWindow({ current: "Equivocada1", password: NEW, repeat: NEW });

    await expect
      .poll(async () => (await session.passwordWindowMessages()).error)
      .toMatch(/actual es incorrecta/);
    expect.soft((await session.passwordWindowMessages()).locked).toBe(false);
    expect.soft(cloud.passwordChanges).toEqual([]);
    expect.soft(cloud.adminCalls).toEqual([]);
  });

  test("when the change itself fails, it says so and no notice goes out", async ({
    cloud,
    openApp,
  }) => {
    cloud.passwordChangeRefusal = { status: 422, message: "Clave demasiado débil" };
    const { session } = await openApp();
    await session.openPasswordWindow();

    await session.submitPasswordWindow({ current: CURRENT, password: NEW, repeat: NEW });

    await expect
      .poll(async () => (await session.passwordWindowMessages()).error)
      .toMatch(/Clave demasiado débil/);
    expect.soft(cloud.adminCalls).toEqual([]);
    expect.soft(await session.passwordWindowOpen(), "the window stays").toBe(true);
  });

  test("an administrator changes it elsewhere: the menu does not offer it", async ({ openApp }) => {
    const { session } = await openApp({ user: "admin" });

    expect.soft((await session.userMenuItems()).join(" ")).not.toMatch(/Cambiar contrase/);
  });
});

test.describe("with a saved session", { tag: "@react" }, () => {
  test("it says it is entering and never shows the form", async ({ openApp }) => {
    const hold = gate();
    const app = await openApp({
      waitUntilReady: false,
      beforeNavigation: async (page) => {
        await page.route(PROFILE, async (route) => {
          await hold.promise;
          await route.fallback();
        });
      },
    });

    await expect.poll(() => app.session.entryView()).toBe("entering");
    hold.open();
    await app.session.waitUntilSignedIn();
    await expect.poll(() => app.session.entryView()).toBe("app");
  });

  test("a network cut does not close the session: Reintentar goes in", async ({
    cloud,
    openApp,
  }) => {
    let offline = true;
    const app = await openApp({
      waitUntilReady: false,
      allowPageErrors: true,
      beforeNavigation: async (page) => {
        await page.route(PROFILE, async (route) => {
          if (offline) await route.abort("connectionreset");
          else await route.fallback();
        });
      },
    });

    await expect.poll(() => app.session.entryView(), { timeout: 15_000 }).toBe("retry");
    expect.soft(await app.session.entryText()).toMatch(/Tu sesi.n sigue abierta/);
    expect.soft(await app.session.entryText(), "no technical English").not.toMatch(/fetch/i);
    expect.soft(cloud.signOuts, "the session stays").toBe(0);

    offline = false;
    await app.session.pressRetryEntry();

    await app.session.waitUntilSignedIn();
    await expect.poll(() => app.session.entryView()).toBe("app");
  });

  test("if reading the session does not answer either, the card comes back", async ({
    openApp,
  }) => {
    test.slow();
    const app = await openApp({
      waitUntilReady: false,
      allowPageErrors: true,
      beforeNavigation: async (page) => {
        await page.route(PROFILE, async (route) => {
          await route.abort("connectionreset");
        });
      },
    });
    await expect.poll(() => app.session.entryView(), { timeout: 15_000 }).toBe("retry");

    await app.session.stallReadingTheSession();
    await app.session.pressRetryEntry();

    await expect
      .poll(() => app.session.entryText(), {
        timeout: RETRY_AFTER_MS,
        message: "no eternal entering",
      })
      .toMatch(/Est. tardando/);
    await expect.poll(() => app.session.entryView()).toBe("retry");
  });

  const closed = [
    ["inactive", /Cuenta inactiva/],
    ["pending", /pendiente de aprobaci.n/],
  ] as const;
  for (const [status, message] of closed) {
    test(`an account ${status} is taken out and its session closed`, async ({ cloud, openApp }) => {
      cloud.ownProfileStatus = status;
      const { session } = await openApp({ waitUntilReady: false });

      await expect.poll(() => session.entryView()).toBe("login");
      await expect.poll(() => session.entryText()).toMatch(message);
      await expect.poll(() => cloud.signOuts, "its token does not stay").toBe(1);
      expect.soft((await session.status()).signedIn).toBe(false);
    });
  }

  test("a change of password that is pending does not lock the account", async ({
    cloud,
    openApp,
  }) => {
    cloud.ownProfileStatus = "reset_pending";
    const { session } = await openApp();

    expect.soft((await session.status()).signedIn).toBe(true);
    expect.soft(cloud.signOuts).toBe(0);
  });
});

test.describe("the first thing on screen", () => {
  test(
    "is the first tab this profile sees, whatever order the administrator left",
    { tag: "@react" },
    async ({ cloud, openApp }) => {
      cloud.bucketJson["_titulos.json"] = { orden: ["estudio", "promos", "flyer"] };
      cloud.setPermissions("asesor", { promos_buscar: true, estudio: false });

      const { session } = await openApp({ waitUntilReady: false });

      await session.waitUntilSignedIn();
      await expect.poll(() => session.activeHeaderTab()).toBe("Promociones");
      await expect.poll(() => session.isShowing("promotions")).toBe(true);
    },
  );

  test(
    "no flyer is painted until the one this profile opens in arrives",
    { tag: "@react" },
    async ({ openApp }) => {
      const hold = gate();
      const app = await openApp({
        waitUntilReady: false,
        beforeNavigation: async (page) => {
          await page.route("**/flyers/_active9.json*", async (route) => {
            await hold.promise;
            await route.fallback();
          });
        },
      });

      await app.session.waitUntilSignedIn();
      await app.page.waitForTimeout(800);
      expect.soft(await app.session.previewPainted(), "not the sample nor option 1").toBe(false);

      hold.open();
      await expect.poll(() => app.session.previewPainted()).toBe(true);
      await app.flyerEditor.waitForOptionShown(9);
    },
  );

  test(
    "the flyer of option 1 arriving late does not replace the one on screen",
    { tag: "@react" },
    async ({ cloud, openApp }) => {
      const hold = gate();
      cloud.addFlyerOption({
        option: 1,
        name: "Viejo",
        image: "flyer_t1.jpg?v=1",
        legal: "Legal 1",
      });
      cloud.setPermissions("asesor", { opcion_1: false, opcion_9: true });
      const app = await openApp({
        waitUntilReady: false,
        beforeNavigation: async (page) => {
          await page.route("**/flyers/_active.json*", async (route) => {
            await hold.promise;
            await route.fallback();
          });
        },
      });
      await app.session.waitUntilSignedIn();
      await app.flyerEditor.waitForOptionShown(9);
      const calibration = await app.flyerEditor.activeCalibration();

      hold.open();
      await app.page.waitForTimeout(600);

      expect.soft(await app.flyerEditor.activeOption()).toBe(9);
      expect.soft(await app.flyerEditor.showsArtworkOf(9), "its artwork stays").toBe(true);
      expect
        .soft(await app.flyerEditor.activeCalibration(), "and its calibration")
        .toEqual(calibration);
    },
  );

  test(
    "the shared files are asked for once on the way in",
    { tag: "@react" },
    async ({ openApp }) => {
      const asked = new Map<string, number>();
      const app = await openApp({
        beforeNavigation: (page) => {
          page.on("request", (request) => {
            const file = /\/flyers\/(_[^?]+\.json)/.exec(request.url())?.[1];
            if (file) asked.set(file, (asked.get(file) ?? 0) + 1);
          });
          return Promise.resolve();
        },
      });
      await app.page.waitForTimeout(500);

      for (const file of [
        "_opciones.json",
        "_facultades.json",
        "_titulos.json",
        "_cashback.json",
      ]) {
        expect.soft(asked.get(file), `${file} once`).toBe(1);
      }
    },
  );

  test(
    "the legal and the data of an option are asked for together",
    { tag: "@react" },
    async ({ cloud, openApp }) => {
      cloud.addFlyerOption({
        option: 6,
        name: "Otra",
        image: "flyer_t6.jpg?v=1",
        legal: "Legal 6",
      });
      cloud.setPermissions("asesor", { opcion_6: true, opcion_9: false });
      const hold = gate();
      let legalAsked = false;
      const app = await openApp({
        waitUntilReady: false,
        beforeNavigation: async (page) => {
          await page.route("**/flyers/_active6.json*", async (route) => {
            await hold.promise;
            await route.fallback();
          });
          await page.route("**/flyers/_legal6.json*", async (route) => {
            legalAsked = true;
            await route.fallback();
          });
        },
      });

      await expect.poll(() => legalAsked, "the legal does not wait for the data").toBe(true);
      hold.open();
      await app.flyerEditor.waitForOptionShown(6);
    },
  );
});

test.describe("a new version", { tag: "@react" }, () => {
  test("is offered with a notice when the published one is different", async ({ openApp }) => {
    const app = await openApp();
    await app.page.route("**/version.json*", async (route) => {
      await route.fulfill({ json: { v: "otra-version" } });
    });

    await app.session.checkForNewVersion();

    await expect.poll(() => app.session.newVersionNotice()).toMatch(/versi.n nueva/);
  });

  test("says nothing when it is the same", async ({ openApp }) => {
    const app = await openApp();

    await app.session.checkForNewVersion();
    await app.page.waitForTimeout(300);

    expect.soft(await app.session.newVersionNotice()).toBe("");
  });
});
