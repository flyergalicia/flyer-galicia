// Protects the brake of Subir Excel in Mis empresas and what its sheets carry.
import { type Cloud } from "../../support/cloud/index.ts";
import { type OpenedApp } from "../../support/open-app.ts";
import { expect, test } from "../../support/test.ts";

const HEAD = ["empresa", "cuit", "config", "asesor1_nombre", "asesor1_celular", "asesor1_email"];
const row = (name: string, cashback = "BAU", officer = "Ana Perez"): string[] => [
  name,
  "30-71111111-1",
  cashback,
  officer,
  "11 4444 5555",
  "ana.perez@bancogalicia.com.ar",
];
const company = (name: string, cashback = "BAU", officer = "Ana Perez") => ({
  empresa: name,
  cuits: ["30711111111"],
  config: cashback,
  asesores: [{ nombre: officer, celular: "11 4444 5555", email: "ana.perez@bancogalicia.com.ar" }],
  rubro: {},
});
const SAVED = [company("ACME SA"), company("BETA SA"), company("GAMA SA"), company("DELTA SA")];

async function openDatabase(cloud: Cloud, openApp: (o?: object) => Promise<OpenedApp>) {
  cloud.setPermissions("asesor", { padron_buscar: true, asesores_guardados: true });
  const app = await openApp();
  await app.companyRegistry.openRegistry();
  return app;
}

test.describe("Subir Excel in Mis empresas", () => {
  test("the first load saves at once", async ({ cloud, openApp }) => {
    cloud.companies = [];
    const { companyRegistry: registry, flyerEditor } = await openDatabase(cloud, openApp);

    await registry.uploadRegistrySheet([HEAD, row("ACME SA"), row("BETA SA")]);

    await expect.poll(() => cloud.companyReplaceCalls).toBe(1);
    expect
      .soft(cloud.companyReplaceRows[0]?.map(({ empresa }) => empresa))
      .toEqual(["ACME SA", "BETA SA"]);
    expect.soft(await flyerEditor.latestNotice()).toMatch(/Empresas actualizadas: 2/);
  });

  test("replacing shows what goes, enters and changes before touching anything", async ({
    cloud,
    openApp,
  }) => {
    cloud.companies = SAVED;
    const { companyRegistry: registry, flyerEditor } = await openDatabase(cloud, openApp);
    await registry.waitForCompaniesLoaded(SAVED.length);

    await registry.uploadRegistrySheet([
      HEAD,
      row("ACME SA", "Config 2"),
      row("BETA SA"),
      row("NUEVA SA"),
    ]);

    const dialog = await registry.waitForUpdateDialog();
    expect.soft(dialog.title).toMatch(/Antes de reemplazar/);
    const counts = dialog.text.replace(/\s+/g, " ");
    expect.soft(counts, "two go").toMatch(/2 se van/);
    expect.soft(counts, "one enters").toMatch(/1 entran/);
    expect.soft(counts, "one changes").toMatch(/1 cambian/);
    expect.soft(counts, "one is the same").toMatch(/1 sin cambios/);
    expect.soft(counts, "half is a loss to warn about").toMatch(/Se borran 2 de tus 4 empresas/);
    expect.soft(cloud.companyReplaceCalls, "nothing was saved yet").toBe(0);

    await registry.dismissImport();
    expect.soft(cloud.companyReplaceCalls, "cancelling keeps all").toBe(0);
    expect.soft(await flyerEditor.latestNotice()).toMatch(/quedaron como estaban/);

    await registry.uploadRegistrySheet([HEAD, row("ACME SA", "Config 2"), row("BETA SA")]);
    await registry.waitForUpdateDialog();
    await registry.acceptUpdateDialog();
    expect
      .soft(cloud.companyReplaceRows[0]?.map(({ empresa }) => empresa))
      .toEqual(["ACME SA", "BETA SA"]);
  });

  test("a sheet equal to what is saved changes nothing", async ({ cloud, openApp }) => {
    cloud.companies = [company("ACME SA")];
    const { companyRegistry: registry, flyerEditor } = await openDatabase(cloud, openApp);
    await registry.waitForCompaniesLoaded(1);

    await registry.uploadRegistrySheet([HEAD, row("ACME SA")]);

    await expect.poll(() => flyerEditor.latestNotice()).toMatch(/igual a lo que ya ten/);
    expect.soft(cloud.companyReplaceCalls).toBe(0);
  });

  test("if what is saved cannot be read again, nothing is replaced", async ({ cloud, openApp }) => {
    cloud.companies = SAVED;
    const { companyRegistry: registry, flyerEditor } = await openDatabase(cloud, openApp);
    await registry.waitForCompaniesLoaded(SAVED.length);
    cloud.companiesUnreachable = true;

    await registry.uploadRegistrySheet([HEAD, row("NUEVA SA")]);

    // Supabase tries a failed read three more times (after 1, 2 and 4 s) before it gives up.
    await expect
      .poll(() => flyerEditor.latestNotice(), { timeout: 15_000 })
      .toMatch(/no se reemplaz. nada/);
    expect.soft(cloud.companyReplaceCalls).toBe(0);
  });

  test("cashback is read with tolerance, and what it does not know is reported", async ({
    cloud,
    openApp,
  }) => {
    cloud.companies = [];
    cloud.bucketJson["_cashback.json"] = {
      configs: ["BAU", "Config 1", "Config 2"].map((nombre) => ({
        nombre,
        m1: "$1",
        m2: "$2",
        m3: "$3",
        m4: "$4",
      })),
    };
    const { companyRegistry: registry } = await openDatabase(cloud, openApp);

    await registry.uploadRegistrySheet([
      HEAD,
      row("UNO", "1.0"),
      row("DOS", "config 2"),
      row("TRES", "Premium"),
      row("CUATRO", "SIN"),
      row("CINCO", ""),
      ["", "", "", "", "", ""],
      ["SEIS", "307", "BAU", "", "", ""],
    ]);

    const dialog = await registry.waitForUpdateDialog();
    const text = dialog.text.replace(/\s+/g, " ");
    expect.soft(text, "an unknown value with its real row").toMatch(/1 cashback que no reconozco/);
    expect.soft(text).toMatch(/fila 4 \("Premium"\)/);
    expect
      .soft(text, "SIN and an empty cell are not complained about")
      .toMatch(/2 empresas marcadas SIN cashback/);
    expect.soft(text, "a short tax id").toMatch(/1 CUIT sin 11 d.gitos/);
    expect.soft(text).toMatch(/fila 8 \("307"\)/);
    expect.soft(text, "and the row that was empty").toMatch(/1 fila vac.a/);

    await registry.acceptUpdateDialog();
    const saved = cloud.companyReplaceRows[0] ?? [];
    expect
      .soft(saved.map(({ empresa }) => empresa))
      .toEqual(["UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS"]);
    expect
      .soft(saved.find(({ empresa }) => empresa === "CUATRO")?.config, "SIN stays no cashback")
      .toBe("SIN");
  });

  test("what comes down has the same columns and can go up again", async ({ cloud, openApp }) => {
    cloud.companies = [company("ACME SA", "Config 2")];
    const { companyRegistry: registry } = await openDatabase(cloud, openApp);
    await registry.waitForCompaniesLoaded(1);

    const sheet = await registry.downloadRegistrySheet("companies");
    expect.soft(sheet.name).toBe("Mis_Empresas_Galicia.xlsx");
    expect.soft(sheet.head.slice(0, 3)).toEqual(["empresa", "cuit", "config"]);
    expect.soft(sheet.head).toContain("asesor4_email");
    expect.soft(sheet.head).toContain("tope_combustible");
    expect.soft(sheet.rows[0]?.[0]).toBe("ACME SA");
    expect.soft(sheet.rows[0]?.[1], "the tax id with its format").toBe("30-71111111-1");

    const template = await registry.downloadRegistrySheet("template");
    expect.soft(template.name).toBe("Plantilla_Empresas_Galicia.xlsx");
    expect.soft(template.head, "the template has the same columns").toEqual(sheet.head);
    expect
      .soft(
        template.rows.some((line) => line[2] === "SIN"),
        "and shows how to mark no cashback",
      )
      .toBe(true);

    await registry.uploadRegistrySheet([sheet.head, ...sheet.rows]);
    await expect.poll(async () => (await registry.registryStatus()).length).toBeGreaterThan(0);
    expect.soft(cloud.companyReplaceCalls, "going up again changes nothing").toBe(0);
  });

  test("the inline editor saves what was edited", async ({ cloud, openApp }) => {
    cloud.companies = [company("ACME SA")];
    const { companyRegistry: registry } = await openDatabase(cloud, openApp);
    await registry.waitForCompaniesLoaded(1);

    await registry.openInlineEditor();
    await registry.renameInEditor(0, "ACME RENOMBRADA");
    await registry.saveInlineEditor();

    expect.soft(cloud.companyReplaceRows[0]?.[0]?.empresa).toBe("ACME RENOMBRADA");
  });
});
