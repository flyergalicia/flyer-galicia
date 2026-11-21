// Protects the flyer half made that stays in the browser with the faculty "Guardar historial y
// borrador": the offer comes once on entering, and it is not stepped on by an empty form.
import { expect, test } from "../../support/test.ts";

const SAVE_WAIT_MS = 1_000;

test.describe("the flyer half made", () => {
  test("with the faculty it comes back on entering again, with what it had", async ({
    cloud,
    openApp,
  }) => {
    cloud.setPermissions("asesor", { guardar_trabajo: true });
    const first = await openApp();
    expect.soft(await first.flyerEditor.sessionDraftOffer(), "nothing the first time").toBeNull();
    await first.flyerEditor.fillCompanyName("A MEDIO ARMAR SA");
    await first.officers.fill(1, { name: "Ana Perez", phone: "123" });
    await first.page.waitForTimeout(SAVE_WAIT_MS);
    const stored = await first.session.browserStorage();
    await first.close();

    const back = await openApp({ localStorage: stored });
    const app = back.flyerEditor;
    await expect.poll(() => app.sessionDraftOffer()).toMatch(/A MEDIO ARMAR SA/);
    expect.soft(await app.companyName(), "the form waits for an answer").toBe("");
    // A press in the form saves a moment later, as long as nothing is on the table.
    await app.chooseCashback("BAU");
    await back.page.waitForTimeout(SAVE_WAIT_MS);
    const stillThere = await back.session.browserStorage();
    expect
      .soft(JSON.stringify(stillThere), "the empty form does not step on it")
      .toContain("A MEDIO ARMAR SA");

    await app.carryOnWithSessionDraft();
    expect.soft(await app.sessionDraftOffer(), "the offer goes").toBeNull();
    await expect.poll(() => app.companyName()).toBe("A MEDIO ARMAR SA");
    expect.soft((await back.officers.read(1)).name).toBe("Ana Perez");
    expect.soft(await app.fieldWarning("phone"), "what is wrong is marked").not.toBe("");
  });

  test("it can be discarded, and writing elsewhere takes the offer away", async ({
    cloud,
    openApp,
  }) => {
    cloud.setPermissions("asesor", { guardar_trabajo: true });
    const first = await openApp();
    await first.flyerEditor.fillCompanyName("OTRA SA");
    await first.page.waitForTimeout(SAVE_WAIT_MS);
    const stored = await first.session.browserStorage();
    await first.close();

    const discarding = await openApp({ localStorage: stored });
    await expect.poll(() => discarding.flyerEditor.sessionDraftOffer()).toMatch(/OTRA SA/);
    await discarding.flyerEditor.discardSessionDraft();
    expect.soft(await discarding.flyerEditor.latestNotice()).toBe("Borrador descartado");
    const afterDiscarding = await discarding.session.browserStorage();
    expect.soft(JSON.stringify(afterDiscarding), "it is gone").not.toContain("OTRA SA");
    await discarding.close();

    const writing = await openApp({ localStorage: stored });
    await expect.poll(() => writing.flyerEditor.sessionDraftOffer()).toMatch(/OTRA SA/);
    await writing.flyerEditor.fillCompanyName("NUEVA SA");
    expect.soft(await writing.flyerEditor.sessionDraftOffer(), "another flyer started").toBeNull();
    await writing.close();
  });

  test("Restaurar takes it away too", async ({ cloud, openApp }) => {
    cloud.setPermissions("asesor", { guardar_trabajo: true });
    const first = await openApp();
    await first.flyerEditor.fillCompanyName("OTRA SA");
    await first.page.waitForTimeout(SAVE_WAIT_MS);
    await first.flyerEditor.restoreDefaults();
    const stored = await first.session.browserStorage();
    await first.close();

    const back = await openApp({ localStorage: stored });
    await back.page.waitForTimeout(SAVE_WAIT_MS);
    expect.soft(await back.flyerEditor.sessionDraftOffer()).toBeNull();
  });

  test("without the faculty nothing is kept", async ({ cloud, openApp }) => {
    cloud.setPermissions("asesor", { guardar_trabajo: false });
    const first = await openApp();
    await first.flyerEditor.fillCompanyName("OLVIDADA SA");
    await first.page.waitForTimeout(SAVE_WAIT_MS);
    const stored = await first.session.browserStorage();
    expect.soft(JSON.stringify(stored)).not.toContain("OLVIDADA SA");
  });
});
