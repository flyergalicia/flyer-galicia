// Protects the keyboard of the main screen, the windows of the name menu and the tutorial.
import { expect, test } from "../../support/test.ts";

test.describe("the keyboard", () => {
  test("the tabs of the panel move with the arrows", async ({ openApp }) => {
    const { session } = await openApp();

    expect.soft(await session.moveAlongEditorTabs("ArrowRight")).toMatch(/Masivo/);
    expect
      .soft(await session.selectedEditorTab(), "it says which one is selected")
      .toMatch(/Masivo/);
    expect.soft(await session.moveAlongEditorTabs("ArrowLeft")).toMatch(/Individual/);
  });

  test("Ctrl+Enter downloads, and does nothing with a window on top", async ({ openApp }) => {
    const { flyerEditor, flyerDrawing, page } = await openApp();
    await flyerEditor.loadDownloadLibrary("pdf");
    await flyerEditor.fillCompanyName("ACME");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.keyboard.press("Control+Enter"),
    ]);
    expect.soft(download.suggestedFilename()).toMatch(/\.pdf$/);

    await expect.poll(() => flyerEditor.downloadIsBusy()).toBe(false);
    await flyerDrawing.openPreviewWindow();
    let another = false;
    page.once("download", () => {
      another = true;
    });
    await page.keyboard.press("Control+Enter");
    await page.waitForTimeout(1_500);
    expect.soft(another, "the window goes first").toBe(false);
  });

  test("Escape closes a window", async ({ openApp }) => {
    const { flyerDrawing, page } = await openApp();
    await flyerDrawing.openPreviewWindow();

    await page.keyboard.press("Escape");

    expect.soft((await flyerDrawing.previewWindowZoom()).open).toBe(false);
  });

  test("the app asks with its own windows, never with those of the browser", async ({
    cloud,
    openApp,
  }) => {
    cloud.setPermissions("asesor", { asesores_guardados: true });
    cloud.savedAdvisors = [
      { id: "a1", name: "Ana", nombre: "Ana Perez", celular: "11 1", email: "a@b.com" },
    ];
    const app = await openApp();
    await app.officers.openSavedAdvisors(1);

    await app.officers.pressDeleteSavedAdvisor("Ana");

    expect.soft(await app.session.waitForConfirmation()).toMatch(/Eliminar/);
    await app.session.answerConfirmation(false);
    expect.soft(app.dialogs(), "no window of the browser").toEqual([]);
  });
});

test.describe("the name menu", () => {
  test("whoever is not an administrator changes the password in a window", async ({ openApp }) => {
    const { session } = await openApp();

    await session.openPasswordWindow();

    expect.soft(await session.passwordWindowOpen()).toBe(true);
    await session.closePasswordWindow();
    expect.soft(await session.passwordWindowOpen()).toBe(false);
  });

  test("the notes come with their faculty", async ({ cloud, openApp }) => {
    cloud.setPermissions("asesor", { notas: true });
    const { session } = await openApp();

    await session.openNotes();

    expect.soft(await session.notesOpen()).toBe(true);
  });

  test("the tutorial is there for everybody, and it opens on request", async ({ openApp }) => {
    const { session } = await openApp();
    expect.soft(await session.tutorialOpen(), "it does not open by itself").toBe(false);
    expect.soft((await session.userMenuItems()).join(" ")).toMatch(/Ver tutorial/);

    await session.chooseFromUserMenu("Ver tutorial");

    await expect.poll(() => session.tutorialOpen()).toBe(true);
  });

  test("with its faculty it opens by itself the first time, and never again", async ({
    cloud,
    openApp,
  }) => {
    cloud.setPermissions("asesor", { tutorial_auto: true });
    const { session } = await openApp();

    await expect.poll(() => session.tutorialOpen(), { timeout: 4_000 }).toBe(true);
    await session.closeTutorial();

    const again = await openApp({ localStorage: await session.browserStorage() });
    await again.page.waitForTimeout(1_500);
    expect.soft(await again.session.tutorialOpen()).toBe(false);
  });
});

test.describe("the tabs of the header", () => {
  test("an administrator holds one and drags it: everybody gets the new order", async ({
    cloud,
    openApp,
  }) => {
    test.slow();
    cloud.setPermissions("asesor", { promos_buscar: true });
    const admin = await openApp({ user: "admin" });
    const before = await admin.session.headerTabs();
    expect.soft(before[0]).toMatch(/Flyer Galicia/);

    await admin.session.dragHeaderTab("Promociones", "Flyer Galicia");

    await expect.poll(async () => (await admin.session.headerTabs())[0]).toMatch(/Promociones/);
    await expect
      .poll(() => JSON.stringify(cloud.bucketJson["_titulos.json"]))
      .toMatch(/"orden":\["promos"/);

    const advisor = await openApp({ waitUntilReady: false });
    await advisor.session.waitUntilSignedIn();
    await expect
      .poll(() => advisor.session.activeHeaderTab(), "and starts there")
      .toBe("Promociones");
  });

  test("whoever is not an administrator cannot move them", async ({ cloud, openApp }) => {
    test.slow();
    cloud.setPermissions("asesor", { promos_buscar: true });
    const { session } = await openApp();
    const before = await session.headerTabs();

    await session.dragHeaderTab("Promociones", "Flyer Galicia");

    expect.soft(await session.headerTabs()).toEqual(before);
  });
});
