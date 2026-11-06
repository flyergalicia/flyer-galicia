// Protects Config: the list of flyers, what replaces what, and the amounts of cashback.
import { fixtureFile } from "../../support/cloud/index.ts";
import { expect, test } from "../../support/test.ts";

const FLYER = "flyer_t7.jpg?v=1";
const JPEG = { name: "nuevo.jpg", mimeType: "image/jpeg", buffer: fixtureFile("op9.jpg") };

test.describe("Config → Opciones", () => {
  test(
    "adding one gives it a tab, a file, a row of faculties and a legal",
    { tag: "@react" },
    async ({ cloud, openApp }) => {
      const { admin } = await openApp({ user: "admin" });
      await admin.openPanel();
      await admin.openSheet("Config", "Opciones");
      await expect.poll(async () => (await admin.optionRows()).length).toBeGreaterThan(0);
      const before = await admin.optionRows();

      await admin.pressAddOption();
      const rows = await admin.optionRows();
      expect.soft(rows.length).toBe(before.length + 1);
      await admin.renameOptionRow(rows.length - 1, "Campaña nueva");
      await admin.saveOptions();

      const saved = cloud.bucketJson["_opciones.json"].opts;
      const created = saved.find(({ nombre }) => nombre === "Campaña nueva");
      expect.soft(created, "saved in the shared list").toBeDefined();

      await admin.openSheet("Admin", "Facultades");
      const faculties = await admin.facultyRows();
      expect
        .soft(
          faculties.some(({ name }) => /Campaña nueva/.test(name)),
          "it has its faculty",
        )
        .toBe(true);

      await admin.openSheet("Config", "Legales");
      expect.soft(await admin.legalTabs(), "and its legal").toContain("Campaña nueva");
    },
  );

  test(
    "a new flyer can replace the old one: companies follow it by themselves",
    { tag: "@react" },
    async ({ cloud, openApp }) => {
      cloud.addFlyerOption({
        option: 8,
        name: "Combustible 2025",
        image: FLYER,
        legal: "L",
        tab: "rubros",
      });
      cloud.addFlyerOption({
        option: 11,
        name: "Combustible 2026",
        image: FLYER,
        legal: "L",
        tab: "rubros",
      });
      const app = await openApp({ user: "admin" });
      const { admin, companyRegistry } = app;
      await admin.openPanel();
      await admin.openSheet("Config", "Opciones");
      await expect.poll(async () => (await admin.optionRows()).length).toBeGreaterThan(1);

      const company = { name: "ACME", cashback: "BAU", category: { option: 8 } };
      expect.soft(await companyRegistry.destinationOption(company), "before").toBe(11);

      const index = (await admin.optionRows()).findIndex(({ number }) => number === 11);
      await admin.chooseOptionReplaces(index, "Reemplaza a: Combustible 2025");
      await admin.saveOptions();

      const saved = cloud.bucketJson["_opciones.json"].opts.find(({ n }) => n === 11);
      expect.soft(saved?.reemplaza).toBe(8);
      expect
        .soft(await companyRegistry.destinationOption(company), "the old number leads to the new")
        .toBe(11);
      expect
        .soft((await admin.optionRows())[index]?.isCurrent, "it is marked as current")
        .toBe(true);
    },
  );

  test(
    "the row of a company leads to the current flyer of its category, not to the screen",
    { tag: "@react" },
    async ({ cloud, openApp }) => {
      cloud.addFlyerOption({
        option: 8,
        name: "Combustible",
        image: FLYER,
        legal: "L",
        tab: "rubros",
      });
      cloud.addFlyerOption({
        option: 7,
        name: "Supermercado",
        image: FLYER,
        legal: "L",
        tab: "rubros",
      });
      const { companyRegistry, flyerEditor } = await openApp({ user: "admin" });

      const destination = async (category: object) =>
        companyRegistry.destinationOption({ name: "X", cashback: "BAU", category });
      expect.soft(await destination({ name: "Combustible" }), "by the text of the sheet").toBe(8);
      expect.soft(await destination({ name: "Supermercado" })).toBe(7);
      expect.soft(await destination({ option: 8 }), "by the number saved").toBe(8);
      expect.soft(await destination({}), "with no category, the general flyer in force").toBe(9);

      await flyerEditor.selectOption(8);
      await flyerEditor.waitForOptionShown(8);
      expect.soft(await destination({}), "wherever one stands").toBe(9);
    },
  );

  test("a category left without flyer is said, and does not fall into the general one", async ({
    cloud,
    openApp,
  }) => {
    cloud.addFlyerOption({
      option: 8,
      name: "Combustible",
      image: FLYER,
      legal: "L",
      tab: "rubros",
    });
    const { companyRegistry, flyerEditor } = await openApp({ user: "admin" });
    await flyerEditor.loadDownloadLibrary("zip");
    await flyerEditor.loadDownloadLibrary("pdf");

    const outcome = await companyRegistry.generateFlyers([
      { name: "ACME", cashback: "BAU", category: { option: 99, name: "Harina" } },
      { name: "BETA", cashback: "BAU", category: { option: 8 } },
    ]);

    expect.soft(outcome.files.join(" "), "the other one goes").toMatch(/BETA/);
    expect
      .soft(outcome.files.join(" "), "this one is not sent to another flyer")
      .not.toMatch(/ACME/);
    expect.soft(outcome.summary, "and this one is told").toMatch(/ACME/);
  });

  // The one above puts in the batch a company a person cannot tick (React has no way to): this is
  // the same rule with what a person does.
  test(
    "a category left without flyer says so on the list, and the batch does not take it",
    { tag: "@react" },
    async ({ cloud, openApp }) => {
      cloud.addFlyerOption({
        option: 8,
        name: "Combustible",
        image: FLYER,
        legal: "L",
        tab: "rubros",
      });
      const { companyRegistry, flyerEditor } = await openApp({ user: "admin" });
      await flyerEditor.loadDownloadLibrary("zip");
      await flyerEditor.loadDownloadLibrary("pdf");
      const companies = [
        { name: "ACME", cashback: "BAU", category: { option: 99, name: "Harina" } },
        { name: "BETA", cashback: "BAU", category: { option: 8 } },
      ];

      await companyRegistry.openGeneratorWith(companies);
      expect
        .soft(await companyRegistry.generatorText(), "the list says why it does not go")
        .toMatch(/ACME[\s\S]*el flyer de su rubro ya no está/);

      const outcome = await companyRegistry.generateFlyers(companies);
      expect.soft(outcome.files.join(" "), "the other one goes").toMatch(/BETA/);
      expect
        .soft(outcome.files.join(" "), "this one is not sent to another flyer")
        .not.toMatch(/ACME/);
    },
  );
});

test.describe("Config → Cashback", { tag: "@react" }, () => {
  test("is edited in the panel, saved for everybody and reaches whoever comes in", async ({
    cloud,
    openApp,
  }) => {
    const admin = await openApp({ user: "admin" });
    await admin.admin.openPanel();
    await admin.admin.openSheet("Config", "Cashback");
    await expect.poll(async () => (await admin.admin.cashbackConfigs()).length).toBeGreaterThan(0);

    await admin.admin.setCashbackAmount(0, 0, "$999.000");
    await admin.admin.saveCashback();

    expect.soft(JSON.stringify(cloud.bucketJson["_cashback.json"])).toContain("$999.000");

    const advisor = await openApp();
    await expect
      .poll(async () => (await advisor.flyerDrawing.draw()).texts.map(({ text }) => text))
      .toContain("$999.000");
  });
});

test.describe("Config → Flyer", { tag: "@react" }, () => {
  test("takes a PDF or an image and asks which flyer it is for", async ({ cloud, openApp }) => {
    cloud.addFlyerOption({ option: 6, name: "Otra", image: "flyer_t6.jpg?v=1", legal: "L" });
    const { admin, calibrator } = await openApp({ user: "admin" });
    await admin.openPanel();
    await admin.openSheet("Config", "Flyer");

    const accepted = await calibrator.uploadAccepts();
    expect.soft(accepted).toContain(".pdf");
    expect.soft(accepted).toContain(".jpg");
    expect.soft(accepted).toContain(".png");

    await calibrator.chooseFlyerFile(JPEG);
    const options = await calibrator.optionsAsked();
    expect.soft(options).toContain("Combustible");
    expect.soft(options).toContain("Otra");

    await calibrator.cancelOption();
    expect.soft(cloud.uploads, "cancelling uploads nothing").toEqual([]);
    expect.soft(await calibrator.isOpen()).toBe(false);
  });

  test("something that is not a flyer is refused", async ({ openApp }) => {
    const { admin, calibrator } = await openApp({ user: "admin" });
    await admin.openPanel();
    await admin.openSheet("Config", "Flyer");

    await calibrator.chooseFlyerFile({
      name: "datos.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("x"),
    });
    await calibrator.answerOption("Combustible");

    await expect.poll(() => calibrator.uploadError()).toMatch(/Formatos permitidos/);
  });

  test("a file already uploaded can be activated from the list", async ({ cloud, openApp }) => {
    cloud.bucketFileList = [{ name: "flyer_123_op9.jpg", created_at: "2026-10-20T10:00:00Z" }];
    const app = await openApp({ user: "admin" });
    await app.admin.openPanel();
    await app.admin.openSheet("Config", "Flyer");

    await app.page
      .getByRole("button", { name: /Activar/ })
      .first()
      .click();

    await expect
      .poll(() => JSON.stringify(cloud.bucketJson["_active9.json"]))
      .toContain("flyer_123_op9.jpg");
  });

  test("a new flyer is always a new address, and only those are kept for a long time", async ({
    cloud,
    openApp,
  }) => {
    const app = await openApp({ user: "admin" });
    const { admin, calibrator, flyerEditor } = app;
    const uploads: { file: string; long: boolean }[] = [];
    app.page.on("request", (request) => {
      const match = /\/object\/flyers\/([^?]+)/.exec(request.url());
      if (request.method() === "POST" && match?.[1]) {
        uploads.push({
          file: match[1],
          long: (request.postDataBuffer()?.toString("latin1") ?? "").includes("31536000"),
        });
      }
    });
    await admin.openPanel();
    await admin.openSheet("Config", "Flyer");

    await calibrator.chooseFlyerFile(JPEG);
    await calibrator.answerOption("Combustible");
    await calibrator.waitForEditor();
    await calibrator.saveAndActivate();

    const image = uploads.find(({ file }) => file.endsWith(".jpg"));
    expect
      .soft(image?.file, "the name carries the time and the flyer")
      .toMatch(/^flyer_\d+_op9\.jpg$/);
    expect.soft(image?.long, "it can be kept for a year").toBe(true);
    expect
      .soft(uploads.find(({ file }) => file === "_active9.json")?.long, "a fixed name cannot")
      .toBe(false);
    expect
      .soft(JSON.stringify(cloud.bucketJson["_active9.json"]), "and the address has its version")
      .toMatch(/\?v=\d+"/);
    await flyerEditor.waitForOptionShown(9);
  });
});
