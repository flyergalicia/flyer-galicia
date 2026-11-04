// Protects the escaping rule: what another person wrote is shown, never run.
import { type Cloud } from "../../support/cloud/index.ts";
import { type OpenedApp } from "../../support/open-app.ts";
import { expect, test } from "../../support/test.ts";

const MARKUP = `<img src=x onerror="window.__xss=1"><b>malo</b>'"`;
const SHOWN = "<b>malo</b>";
const WAIT_FOR_SCRIPT_MS = 400;

async function expectNothingRan(app: OpenedApp): Promise<void> {
  await app.page.waitForTimeout(WAIT_FOR_SCRIPT_MS);
  expect.soft(await app.flyerEditor.scriptRan(), "nothing ran").toBe(false);
}

function hostileCompany(cloud: Cloud): void {
  cloud.companies = [
    {
      empresa: MARKUP,
      cuits: ["30711111111"],
      config: MARKUP,
      asesores: [{ nombre: MARKUP, celular: MARKUP, email: MARKUP }],
      rubro: {},
    },
  ];
}

test.describe("text written by someone else", () => {
  test("in the name of a user or of a company in the panel is shown as text", async ({
    cloud,
    openApp,
  }) => {
    cloud.profiles = [
      {
        id: "00000000-0000-4000-8000-0000000000ef",
        full_name: MARKUP,
        email_asesor: "x@bancogalicia.com.ar",
        role: "asesor",
        status: "active",
        created_at: "2026-01-01T00:00:00Z",
      },
    ];
    cloud.flyerLogs = [
      {
        id: "l1",
        user_id: "00000000-0000-4000-8000-0000000000ef",
        empresa: MARKUP,
        config_name: MARKUP,
        format: "pdf",
        flyer_type: "{}",
        created_at: new Date().toISOString(),
      },
    ];
    const app = await openApp({ user: "admin" });
    await app.admin.openPanel();

    await app.admin.openSheet("Admin", "Usuarios");
    await expect.poll(() => app.admin.sheetText()).toContain(SHOWN);

    await app.admin.openSheet("Admin", "Registros");
    await expect.poll(() => app.admin.sheetText()).toContain(SHOWN);
    await expectNothingRan(app);
  });

  test("in the change log and the audit of the panel is shown as text", async ({
    cloud,
    openApp,
  }) => {
    cloud.companyLog = [
      {
        id: "l1",
        created_at: "2026-10-20T10:00:00Z",
        usuario: MARKUP,
        user_id: "x",
        accion: "alta",
        empresa: MARKUP,
        total: 1,
      },
    ];
    cloud.auditRows = [
      {
        id: "a1",
        created_at: "2026-10-20T10:00:00Z",
        accion: "approve_user",
        actor_email: MARKUP,
        objetivo_email: MARKUP,
      },
    ];
    const app = await openApp({ user: "admin" });
    await app.admin.openPanel();

    await app.admin.openSheet("Data", "Cambios en las empresas");
    await expect.poll(() => app.admin.sheetText()).toContain(SHOWN);
    await app.admin.openSheet("Admin", "Auditoría");
    await expect.poll(() => app.admin.sheetText()).toContain(SHOWN);
    await expectNothingRan(app);
  });

  test("in a company is shown as text in the search, the suggestions and its dialogs", async ({
    cloud,
    openApp,
  }) => {
    hostileCompany(cloud);
    const app = await openApp({ user: "admin" });
    const { companyRegistry: registry } = app;
    await registry.openSearch();
    await registry.waitForSearchResults(1);

    expect.soft((await registry.searchList()).text).toContain(SHOWN);
    await registry.closeSearch();
    await registry.typeCompanyName("malo");
    expect.soft((await registry.suggestedCompanies()).join(" ")).toContain(SHOWN);
    await registry.pressInCompanyField("Enter");
    const dialog = await registry.waitForUpdateDialog();
    expect.soft(dialog.text, "the warning of no cashback too").toContain(SHOWN);
    await expectNothingRan(app);
  });

  test("in an Excel is shown as text in its validation", async ({ openApp }) => {
    const app = await openApp();

    const sheet = await app.flyerEditor.uploadExcelSheet([
      ["empresa", MARKUP, "config"],
      [MARKUP, "x", MARKUP],
    ]);

    expect.soft(sheet.validation, "its column name is read, not run").toContain("<b>malo</b>");
    await expectNothingRan(app);
  });

  test("in the sheet of Mis empresas is shown as text in its report", async ({
    cloud,
    openApp,
  }) => {
    cloud.companies = [];
    cloud.setPermissions("asesor", { padron_buscar: true });
    const app = await openApp();
    await app.companyRegistry.openRegistry();

    await app.companyRegistry.uploadRegistrySheet([
      ["empresa", "cuit", "config"],
      ["ACME", "307", MARKUP],
    ]);

    const dialog = await app.companyRegistry.waitForUpdateDialog();
    expect.soft(dialog.text).toContain(SHOWN);
    await expectNothingRan(app);
  });

  test("a flyer file with quotes in its name does not break its buttons", async ({
    cloud,
    openApp,
  }) => {
    cloud.bucketFileList = [
      { name: `flyer'"><img src=x onerror=window.__xss=1>_op9.jpg`, created_at: "2026-10-20" },
    ];
    const app = await openApp({ user: "admin" });
    await app.admin.openPanel();
    await app.admin.openSheet("Config", "Flyer");

    await expect.poll(() => app.admin.sheetText()).toContain("onerror");
    await expectNothingRan(app);
  });
});
