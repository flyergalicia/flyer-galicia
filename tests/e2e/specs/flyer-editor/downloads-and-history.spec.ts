// Protects what a download leaves behind: the log, the name of the file, the history.
import { expect, test } from "../../support/test.ts";

const ANA = { name: "Ana Perez", phone: "11 4444 5555", email: "ana.perez@bancogalicia.com.ar" };
const LUIS = { name: "Luis Gomez", phone: "11 4444 6666", email: "luis.gomez@bancogalicia.com.ar" };
const CARLA = {
  name: "Carla Diaz",
  phone: "11 4444 7777",
  email: "carla.diaz@bancogalicia.com.ar",
};

test.describe("a download", () => {
  test("is logged with its company, format and flyer", async ({ cloud, openApp }) => {
    const { flyerEditor, officers } = await openApp();
    await flyerEditor.fillCompanyName("ACME SA");
    await officers.fill(1, ANA);

    await flyerEditor.downloadPdfToDisk();

    await expect.poll(() => cloud.flyerLogWrites.length).toBe(1);
    const [log] = cloud.flyerLogWrites;
    expect.soft(log?.empresa).toBe("ACME SA");
    expect.soft(log?.format).toBe("pdf");
    const detail = String(log?.flyer_type);
    expect.soft(detail, "which flyer it used").toContain('"opcion":9');
    expect.soft(detail, "and who").toContain(ANA.name);
  });

  test("PNG is under Otros, and it is logged as such", async ({ cloud, openApp }) => {
    const { flyerEditor } = await openApp();
    await flyerEditor.fillCompanyName("ACME SA");

    expect.soft((await flyerEditor.otherActions()).join(" ")).toMatch(/PNG/);
    expect.soft(await flyerEditor.downloadPngToDisk()).toMatch(/\.png$/);

    await expect.poll(() => cloud.flyerLogWrites.length).toBe(1);
    expect.soft(cloud.flyerLogWrites[0]?.format).toBe("png");
  });

  const names: readonly (readonly [string, string, string])[] = [
    ["forbidden characters", 'A/B:C*D?"E<F>G|H', "Flyer A-B-C-D-E-F-G-H"],
    ["spaces and dots at the end", "ACME S.A.  ", "Flyer ACME S.A"],
    ["control characters", "AC\tME", "Flyer ACME"],
  ];
  for (const [what, company, expected] of names) {
    test(`the name of the file has no ${what}`, async ({ openApp }) => {
      const { session } = await openApp();

      expect
        .soft(await session.downloadFileName("Flyer {empresa}", { empresa: company }))
        .toBe(expected);
    });
  }

  test("a very long name is cut so the system accepts it", async ({ openApp }) => {
    const { session } = await openApp();

    const name = await session.downloadFileName("Flyer {empresa}", { empresa: "X".repeat(300) });
    expect.soft(name.length).toBeLessThanOrEqual(120);
  });

  test("what looks wrong is warned while writing, and never stops the download", async ({
    openApp,
  }) => {
    const { flyerEditor, officers } = await openApp();
    await flyerEditor.fillCompanyName("ACME SA");

    await officers.fill(1, { name: "Ana Perez", phone: "123", email: "no-es-mail" });
    expect.soft(await flyerEditor.fieldWarning("phone")).not.toBe("");
    expect.soft(await flyerEditor.fieldWarning("email")).not.toBe("");

    expect.soft(await flyerEditor.downloadPdfToDisk(), "it comes out anyway").toMatch(/\.pdf$/);
    await expect.poll(() => flyerEditor.latestNotice()).toMatch(/se gener. igual/);

    await officers.fill(1, { phone: "11 4444 5555", email: "ana@bancogalicia.com.ar" });
    expect.soft(await flyerEditor.fieldWarning("phone"), "fixed, it goes away").toBe("");
    expect.soft(await flyerEditor.fieldWarning("email")).toBe("");
  });
});

test.describe("sharing", () => {
  test("is not offered when the browser cannot share a PDF", async ({ openApp }) => {
    const { flyerEditor } = await openApp();

    expect.soft(await flyerEditor.shareOffered()).toBe(false);
    expect.soft((await flyerEditor.otherActions()).join(" ")).not.toMatch(/Compartir/);
  });

  test("when it can, it shares a PDF and logs it", async ({ cloud, openApp }) => {
    const { flyerEditor, page } = await openApp({
      beforeNavigation: async (opened) => {
        await opened.addInitScript(() => {
          const shared: { name: string; type: string }[] = [];
          Object.assign(navigator, {
            canShare: () => true,
            share: ({ files }: { files: File[] }) => {
              shared.push(...files.map(({ name, type }) => ({ name, type })));
              return Promise.resolve();
            },
          });
          Object.assign(window, { sharedFiles: shared });
        });
      },
    });
    await flyerEditor.fillCompanyName("ACME SA");
    expect.soft(await flyerEditor.shareOffered()).toBe(true);

    await flyerEditor.pressShare();

    await expect.poll(() => cloud.flyerLogWrites.length).toBe(1);
    expect.soft(cloud.flyerLogWrites[0]?.format).toBe("compartir");
    expect.soft(page.url()).toContain("index.html");
  });
});

test.describe("the history", () => {
  test("loading one flyer brings all its officers and no leftover of the one before", async ({
    openApp,
  }) => {
    const { flyerEditor, officers } = await openApp();
    await flyerEditor.fillCompanyName("TRES SA");
    await officers.fill(1, ANA);
    await officers.pressAdd();
    await officers.fill(2, LUIS);
    await officers.pressAdd();
    await officers.fill(3, CARLA);
    await flyerEditor.downloadPdfToDisk();
    await flyerEditor.dismissAfterDownload();

    await flyerEditor.restoreDefaults();
    await flyerEditor.fillCompanyName("UNO SA");
    await officers.fill(1, LUIS);
    await flyerEditor.downloadPdfToDisk();
    await flyerEditor.dismissAfterDownload();

    await flyerEditor.chooseEditorTab("Historial");
    const rows = await flyerEditor.historyRows();
    expect.soft(rows[0], "the last one first").toMatch(/UNO SA/);
    expect.soft(rows[1]).toMatch(/TRES SA/);

    await flyerEditor.editFromHistory(1);
    await flyerEditor.chooseEditorTab("Individual");
    expect.soft(await officers.shownBlocks(), "the three of that flyer").toEqual([1, 2, 3]);
    expect.soft((await officers.read(3)).name).toBe(CARLA.name);

    await flyerEditor.chooseEditorTab("Historial");
    await flyerEditor.editFromHistory(0);
    await flyerEditor.chooseEditorTab("Individual");
    expect.soft(await officers.shownBlocks(), "one: the others do not stay stuck").toEqual([1]);
    expect.soft((await officers.read(2)).name).toBe("");
  });

  test("a flyer hidden with the switch comes back from the history with its switch off", async ({
    openApp,
  }) => {
    const { flyerEditor, officers } = await openApp();
    await flyerEditor.fillCompanyName("SIN OFICIALES SA");
    await officers.fill(1, ANA);
    await officers.pressSwitch();
    await flyerEditor.downloadPdfToDisk();
    await flyerEditor.dismissAfterDownload();

    await officers.pressSwitch();
    await flyerEditor.chooseEditorTab("Historial");
    await flyerEditor.editFromHistory(0);

    expect.soft(await officers.switchIsOn()).toBe(false);
  });

  test("it stays for next time only with the faculty", async ({ cloud, openApp }) => {
    cloud.setPermissions("asesor", { guardar_trabajo: true });
    const allowed = await openApp();
    await allowed.flyerEditor.fillCompanyName("GUARDADA SA");
    await allowed.flyerEditor.downloadPdfToDisk();
    await allowed.flyerEditor.dismissAfterDownload();
    const back = await openApp({ localStorage: await allowed.session.browserStorage() });
    await back.flyerEditor.chooseEditorTab("Historial");
    expect.soft((await back.flyerEditor.historyRows()).join(" ")).toMatch(/GUARDADA SA/);

    cloud.setPermissions("asesor", { guardar_trabajo: false });
    const without = await openApp();
    await without.flyerEditor.fillCompanyName("OLVIDADA SA");
    await without.flyerEditor.downloadPdfToDisk();
    await without.flyerEditor.dismissAfterDownload();
    const later = await openApp({ localStorage: await without.session.browserStorage() });
    await later.flyerEditor.chooseEditorTab("Historial");
    expect.soft((await later.flyerEditor.historyRows()).join(" ")).not.toMatch(/OLVIDADA SA/);
  });
});

test.describe("officers by branch", () => {
  test("come with the faculty, go up to eight with their place and go away with the switch", async ({
    cloud,
    openApp,
  }) => {
    cloud.setPermissions("asesor", { oficiales_sede: true });
    const { flyerEditor, officers, flyerDrawing, session } = await openApp();
    expect.soft(await flyerEditor.branchesSwitchOffered()).toBe(true);

    await flyerEditor.pressBranchesSwitch();
    await flyerEditor.fillBranchesTitle("Tus oficiales");
    await officers.fill(1, ANA);
    await flyerEditor.fillBranch(1, "📍 Rosario");
    for (let added = 2; added <= 8; added += 1) await officers.pressAdd();
    expect.soft(await officers.shownBlocks()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect.soft(await officers.addButtonLabel(), "eight is the limit").toBeNull();
    await officers.fill(8, CARLA);

    const words = (await flyerDrawing.draw()).texts.map(({ text }) => text).join(" ");
    expect.soft(words, "the title").toMatch(/Tus oficiales/);
    expect.soft(words, "the place").toMatch(/Rosario/);
    expect.soft(words, "the eighth").toMatch(/Carla Diaz/);

    await flyerEditor.pressBranchesSwitch();
    expect.soft(await session.waitForConfirmation(), "it asks first").toMatch(/Oficiales por sede/);
    await session.answerConfirmation(true);
    expect
      .soft((await officers.shownBlocks()).at(-1), "back to the usual four")
      .toBeLessThanOrEqual(4);
    expect
      .soft(await officers.read(8), "and the rest erased")
      .toEqual({ name: "", phone: "", email: "" });
  });

  test("without the faculty there is no switch", async ({ cloud, openApp }) => {
    cloud.setPermissions("asesor", { oficiales_sede: false });
    const { flyerEditor } = await openApp();

    expect.soft(await flyerEditor.branchesSwitchOffered()).toBe(false);
  });
});
