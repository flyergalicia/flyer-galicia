// Protects the legal text: one per option, its markers, its bold and what can be pasted.
import { type Cloud } from "../../support/cloud/index.ts";
import { gate } from "../../support/settled.ts";
import { expect, test } from "../../support/test.ts";

function withTwoOptions(cloud: Cloud): void {
  cloud.addFlyerOption({
    option: 6,
    name: "Otra",
    image: "flyer_t6.jpg?v=1",
    legal: "Legal seis.",
  });
  cloud.setPermissions("asesor", { opcion_6: true });
}

test.describe("the markers of the legal", () => {
  test(
    "are replaced with the amounts of the configuration in use",
    { tag: "@react" },
    async ({ cloud, openApp }) => {
      cloud.bucketJson["_legal9.json"] = {
        text: "A {eminentblack} B {platinum} C {plusgold} D {plus} E {empresa} F {cashback} G {Plus Gold}.",
      };
      const { flyerDrawing, flyerEditor } = await openApp();
      await flyerEditor.fillCompanyName("ACME");

      const words = (await flyerDrawing.draw()).texts.map(({ text }) => text).join(" ");
      expect.soft(words).toMatch(/A\s+\$250\.000\s+B\s+\$180\.000\s+C\s+\$80\.000\s+D\s+\$30\.000/);
      expect.soft(words, "the company").toMatch(/E\s+ACME/);
      expect.soft(words, "the biggest").toMatch(/F\s+\$250\.000/);
      expect.soft(words, "spaces and capitals do not matter").toMatch(/G\s+\$80\.000/);
    },
  );

  test("one it does not know stays as written", { tag: "@react" }, async ({ cloud, openApp }) => {
    cloud.bucketJson["_legal9.json"] = { text: "Vigente {hasta} y {importeee}." };
    const { flyerDrawing } = await openApp();

    const words = (await flyerDrawing.draw()).texts.map(({ text }) => text).join(" ");
    expect.soft(words).toContain("{hasta}");
    expect.soft(words).toContain("{importeee}");
  });

  test(
    "the administrator pastes them with chips, in the legal of that option",
    { tag: "@react" },
    async ({ cloud, openApp }) => {
      withTwoOptions(cloud);
      const { admin } = await openApp({ user: "admin" });
      await admin.openPanel();
      await admin.openSheet("Config", "Legales");

      const tabs = await admin.legalTabs();
      expect.soft(tabs, "one tab per option").toContain("Combustible");
      expect.soft(tabs).toContain("Otra");

      await admin.chooseLegalTab("Otra");
      await expect.poll(() => admin.legalText()).toBe("Legal seis.");
      const markers = await admin.legalMarkers();
      expect.soft(markers.join(" "), "the chips name the markers").toMatch(/\{plusgold\}/);

      await admin.pressLegalMarker("{plusgold}");
      expect.soft(await admin.legalText()).toBe("Legal seis.{plusgold}");

      await admin.saveLegal();
      expect
        .soft(cloud.bucketJson["_legal6.json"], "only its own file")
        .toEqual(expect.objectContaining({ text: "Legal seis.{plusgold}" }));
      expect
        .soft(cloud.bucketJson["_legal9.json"])
        .toEqual(expect.objectContaining({ text: "Legal de prueba para la opción 9." }));
    },
  );
});

test.describe("each option keeps its legal", { tag: "@react" }, () => {
  test("an edit stays on its option and does not travel to the other", async ({
    cloud,
    openApp,
  }) => {
    withTwoOptions(cloud);
    const { flyerEditor } = await openApp({ startOption: 9 });
    expect.soft(await flyerEditor.legalText()).toBe("Legal de prueba para la opción 9.");

    await flyerEditor.fillLegal("Editado en la 9.");
    await flyerEditor.selectOption(6);
    await flyerEditor.waitForOptionShown(6);
    expect.soft(await flyerEditor.legalText(), "the other keeps its own").toBe("Legal seis.");

    await flyerEditor.selectOption(9);
    await flyerEditor.waitForOptionShown(9);
    expect
      .soft(await flyerEditor.legalText(), "coming back brings the edit")
      .toBe("Editado en la 9.");
  });

  test("while another one loads, its legal is not shown as this one's", async ({
    cloud,
    openApp,
  }) => {
    withTwoOptions(cloud);
    const app = await openApp({ startOption: 9 });
    const { promise: held, open: release } = gate();
    await app.page.route("**/flyers/_active6.json*", async (route) => {
      await held;
      await route.fallback();
    });
    await app.flyerEditor.forgetOption(6);

    await app.flyerEditor.selectOption(6);
    expect.soft(await app.flyerEditor.legalText(), "empty while it comes").toBe("");
    release();

    await expect.poll(() => app.flyerEditor.legalText()).toBe("Legal seis.");
  });

  test("Restaurar goes back to the saved one, even empty, never to one of another flyer", async ({
    cloud,
    openApp,
  }) => {
    cloud.bucketJson["_legal9.json"] = { text: "" };
    const { flyerEditor } = await openApp();

    await flyerEditor.fillLegal("Algo escrito");
    await flyerEditor.restoreDefaults();

    expect.soft(await flyerEditor.legalText()).toBe("");
  });

  test("an empty legal warns", async ({ cloud, openApp }) => {
    cloud.bucketJson["_legal9.json"] = { text: "   " };
    const { flyerEditor } = await openApp();

    await expect.poll(() => flyerEditor.latestNotice()).toMatch(/no tiene legal cargado/);
  });
});

test.describe("writing the legal", { tag: "@react" }, () => {
  test("the button and Ctrl+B put and take away the bold", async ({ openApp }) => {
    const { flyerEditor, page } = await openApp();

    await flyerEditor.fillLegal("uno dos tres");
    await flyerEditor.selectInLegal(4, 7);
    await flyerEditor.pressLegalBold();
    expect.soft(await flyerEditor.legalText()).toBe("uno **dos** tres");

    await flyerEditor.pressLegalBold();
    expect.soft(await flyerEditor.legalText(), "again takes it away").toBe("uno dos tres");

    await flyerEditor.selectInLegal(0, 3);
    await page.keyboard.press("Control+b");
    expect.soft(await flyerEditor.legalText(), "and the shortcut").toBe("**uno** dos tres");
  });

  test("pasting keeps the bold of the source and runs nothing that came with it", async ({
    openApp,
  }) => {
    const app = await openApp();
    await app.flyerEditor.fillLegal("");

    await app.flyerEditor.pasteInLegal(
      '<p>Texto <b>fuerte</b></p><img src=x onerror="window.__xss=1"><script>window.__xss=1</script>',
      "Texto fuerte",
    );

    expect.soft(await app.flyerEditor.legalText()).toContain("**fuerte**");
    expect.soft(await app.flyerEditor.legalText()).not.toContain("<img");
    await app.page.waitForTimeout(300);
    expect
      .soft(await app.flyerEditor.scriptRan(), "the HTML of the clipboard is inert")
      .toBe(false);
  });
});
