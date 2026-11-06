// Protects the panel of the administrator: its pillars, the matrix of faculties and its previews.
import { type Cloud, type CloudUser } from "../../support/cloud/index.ts";
import { expect, test } from "../../support/test.ts";

const VIP: CloudUser = {
  id: "00000000-0000-4000-8000-0000000000e1",
  email: "vip@bancogalicia.com.ar",
  name: "Vip Prueba",
  role: "vip",
};
const FLYER = "flyer_t7.jpg?v=1";
const NO_SAVED_FACULTIES = { roles: {} };

function withCategoryFlyers(cloud: Cloud): void {
  cloud.addFlyerOption({
    option: 8,
    name: "Combustible rubro",
    image: FLYER,
    legal: "L",
    tab: "rubros",
  });
  cloud.addFlyerOption({ option: 7, name: "Super rubro", image: FLYER, legal: "L", tab: "rubros" });
}

test.describe("the panel", { tag: "@react" }, () => {
  test("is organized in three pillars with their sheets", async ({ openApp }) => {
    const { admin } = await openApp({ user: "admin" });
    await admin.openPanel();

    const structure = await admin.panelStructure();
    expect.soft(Object.keys(structure)).toEqual(["Admin", "Data", "Config"]);
    expect
      .soft(structure.Admin?.join(" "))
      .toMatch(/Dashboard.*Usuarios.*Registros.*Uso.*Facultades.*Auditor/);
    expect.soft(structure.Data?.join(" ")).toMatch(/Empresas por usuario.*Cambios en las empresas/);
    expect.soft(structure.Config?.join(" ")).toMatch(/Flyer.*Cashback.*Legales.*Opciones/);
  });

  test("an advisor does not have it", async ({ openApp }) => {
    const { session } = await openApp();

    expect.soft((await session.headerTabs()).join(" ")).not.toMatch(/Admin/);
    expect.soft(await session.adminButtonOffered()).toBe(false);
  });

  test("the form of a user offers every profile", async ({ cloud, openApp }) => {
    cloud.profiles = [];
    const { admin } = await openApp({ user: "admin" });
    await admin.openPanel();
    await admin.openUsers();
    await admin.openNewUserForm();

    const profiles = await admin.userFormProfiles();
    for (const profile of ["Asesor", "VIP", "Pro", "Hunter"]) {
      expect.soft(profiles, profile).toContain(profile);
    }
    expect.soft(profiles.join(" "), "and the leader").toMatch(/L.der/);
  });

  test("Auditoría and Cambios en las empresas read what the server wrote", async ({
    cloud,
    openApp,
  }) => {
    cloud.auditRows = [
      {
        id: "a1",
        created_at: "2026-10-20T10:00:00Z",
        accion: "approve_user",
        actor_email: "jefe.prueba@bancogalicia.com.ar",
        objetivo_email: "nueva@bancogalicia.com.ar",
      },
    ];
    cloud.companyLog = [
      {
        id: "l1",
        created_at: "2026-10-20T10:00:00Z",
        usuario: "Otra Persona",
        user_id: "x",
        accion: "alta",
        empresa: "ACME SA",
        total: 3,
      },
    ];
    const { admin } = await openApp({ user: "admin" });
    await admin.openPanel();

    await admin.openSheet("Admin", "Auditoría");
    await expect.poll(() => admin.sheetText()).toMatch(/jefe\.prueba@bancogalicia\.com\.ar/);
    expect.soft(await admin.sheetText()).toMatch(/nueva@bancogalicia\.com\.ar/);

    await admin.openSheet("Data", "Cambios en las empresas");
    await expect.poll(() => admin.sheetText()).toMatch(/ACME SA/);
    expect.soft(await admin.sheetText()).toMatch(/Otra Persona/);
  });
});

test.describe("the matrix of faculties", { tag: "@react" }, () => {
  test("a profile with nothing saved keeps what it always had", async ({ cloud, openApp }) => {
    cloud.bucketJson["_facultades.json"] = NO_SAVED_FACULTIES;
    const { session, companyRegistry } = await openApp({ waitUntilReady: false });
    await session.waitUntilSignedIn();

    const tabs = (await session.headerTabs()).join(" ");
    expect.soft(tabs, "no Promociones").not.toMatch(/Promociones/);
    expect.soft(tabs, "no Estudio").not.toMatch(/Estudio/);
    expect.soft(tabs, "no Benchmark").not.toMatch(/Benchmark/);
    const menu = (await session.userMenuItems()).join(" ");
    expect.soft(menu, "no notes").not.toMatch(/Bloc de notas/);
    expect.soft(menu, "no database").not.toMatch(/Base de datos/);
    expect.soft(await companyRegistry.searchOffered(), "no magnifying glass").toBe(false);
  });

  test("a VIP has by default the notes and the saved advisors", async ({ cloud, openApp }) => {
    cloud.bucketJson["_facultades.json"] = NO_SAVED_FACULTIES;
    const { session } = await openApp({ user: VIP, waitUntilReady: false });
    await session.waitUntilSignedIn();

    const menu = (await session.userMenuItems()).join(" ");
    expect.soft(menu).toMatch(/Bloc de notas/);
    expect.soft(menu).toMatch(/Base de datos/);
  });

  test("each flyer has its row, grouped under its tab and folded", async ({ cloud, openApp }) => {
    withCategoryFlyers(cloud);
    cloud.setPermissions("asesor", { opcion_8: true });
    const { admin } = await openApp({ user: "admin" });
    await admin.openPanel();
    await admin.openSheet("Admin", "Facultades");

    const group = await admin.facultyGroup("Flyer Rubros");
    expect.soft(group?.name).toMatch(/2 opciones/);
    expect.soft(group?.counts.Asesor, "how many of them each profile has").toBe("1/2");

    const rows = await admin.facultyRows();
    const rowOf = (name: RegExp) => rows.find((row) => name.test(row.name));
    expect.soft(rowOf(/Combustible rubro/), "a row per flyer").toBeDefined();
    expect.soft(rowOf(/Combustible rubro/)?.visible, "folded at the start").toBe(false);
    expect.soft(rowOf(/Combustible rubro/)?.ticks.Asesor).toBe(true);
    expect.soft(rowOf(/Super rubro/)?.ticks.Asesor).toBe(false);

    await admin.toggleFacultyGroup("Flyer Rubros");
    const unfolded = await admin.facultyRows();
    expect
      .soft(unfolded.find((row) => /Super rubro/.test(row.name))?.visible, "unfolds")
      .toBe(true);

    await admin.setFaculty("Super rubro", "Asesor", true);
    expect
      .soft((await admin.facultyGroup("Flyer Rubros"))?.counts.Asesor, "counts follow")
      .toBe("2/2");
  });

  test("what does not apply to a profile cannot be ticked", async ({ openApp }) => {
    const { admin } = await openApp({ user: "admin" });
    await admin.openPanel();
    await admin.openSheet("Admin", "Facultades");

    const rows = await admin.facultyRows();
    const paste = rows.find((row) => /Pegar datos del oficial/.test(row.name));
    expect.soft(paste?.ticks.Hunter, "the Hunter only downloads").toBeNull();
    expect.soft(paste?.ticks["Líder"], "the Leader only looks").toBeNull();
    expect.soft(paste?.ticks.Asesor).not.toBeNull();
    const tutorial = rows.find((row) => /Tutorial al primer ingreso/.test(row.name));
    expect
      .soft(tutorial?.ticks.Vos, "the automatic tutorial is not for the administrator")
      .toBeNull();
  });

  test("saving reaches the people of that profile", async ({ cloud, openApp }) => {
    const admin = await openApp({ user: "admin" });
    await admin.admin.openPanel();
    await admin.admin.openSheet("Admin", "Facultades");

    await admin.admin.setFaculty("Bloc de notas", "Asesor", true);
    await admin.admin.saveFaculties();

    const saved = cloud.bucketJson["_facultades.json"];
    expect.soft(saved.roles.asesor?.notas).toBe(true);

    const advisor = await openApp();
    expect.soft((await advisor.session.userMenuItems()).join(" ")).toMatch(/Bloc de notas/);
  });

  test("the column of the administrator is his own: it goes to his profile", async ({
    cloud,
    openApp,
  }) => {
    cloud.setPermissions("asesor", { promos_buscar: true });
    const { admin, session } = await openApp({ user: "admin" });
    expect.soft((await session.headerTabs()).join(" ")).toMatch(/Promociones/);
    await admin.openPanel();
    await admin.openSheet("Admin", "Facultades");

    await admin.setFaculty("Buscador de promociones", "Vos", false);
    await admin.saveFaculties();
    await admin.closePanel();

    await expect
      .poll(async () => (await session.headerTabs()).join(" "), "he no longer sees it")
      .not.toMatch(/Promociones/);
    const mine = cloud.ownFaculties[cloud.users.admin?.id ?? ""];
    expect
      .soft(mine, "saved in his profile")
      .toEqual(expect.objectContaining({ promos_buscar: false }));
    expect
      .soft(
        cloud.bucketJson["_facultades.json"].roles.asesor?.promos_buscar,
        "not in the profile of others",
      )
      .toBe(true);
  });

  test("the administrator cannot leave himself without any flyer", async ({ openApp }) => {
    const { admin, flyerEditor } = await openApp({ user: "admin" });
    await admin.openPanel();
    await admin.openSheet("Admin", "Facultades");
    await admin.toggleFacultyGroup("Flyer Galicia");

    await admin.untickAllOwnFlyers();

    await expect.poll(() => flyerEditor.latestNotice()).toMatch(/Dej. al menos una opci.n/);
    const rows = await admin.facultyRows();
    expect
      .soft(rows.filter((row) => row.name.startsWith("Ver ") && row.ticks.Vos).length)
      .toBeGreaterThan(0);
  });
});

test.describe("seeing the app as a profile sees it", { tag: "@react" }, () => {
  test("takes things away and gives all of them back on leaving", async ({ cloud, openApp }) => {
    cloud.setPermissions("asesor", {
      promos_buscar: false,
      pegar_oficial: false,
      padron_buscar: false,
    });
    const { admin, session, officers, companyRegistry } = await openApp({ user: "admin" });
    expect.soft(await officers.pasteOffered()).toEqual([1]);
    expect.soft(await companyRegistry.searchOffered()).toBe(true);
    await admin.openPanel();
    await admin.openSheet("Admin", "Facultades");

    await admin.previewProfile("Asesor");

    expect.soft(await admin.previewBarText()).toMatch(/Vista previa: Asesor/);
    expect
      .soft((await session.headerTabs()).join(" "), "no Promociones")
      .not.toMatch(/Promociones/);
    expect.soft(await officers.pasteOffered(), "no paste").toEqual([]);
    expect.soft(await companyRegistry.searchOffered(), "no magnifying glass").toBe(false);
    expect.soft(await session.adminButtonOffered(), "no panel while previewing").toBe(false);

    await admin.leaveProfilePreview();

    expect.soft((await session.headerTabs()).join(" "), "all back").toMatch(/Promociones/);
    expect.soft(await officers.pasteOffered()).toEqual([1]);
    expect.soft(await companyRegistry.searchOffered()).toBe(true);
    expect.soft(await session.adminButtonOffered()).toBe(true);
  });

  test("leaving the preview of a Hunter brings the editor back", async ({ openApp }) => {
    const { admin, session } = await openApp({ user: "admin" });
    await admin.openPanel();
    await admin.openSheet("Admin", "Facultades");

    await admin.previewProfile("Hunter");
    await expect
      .poll(() => session.isShowing("flyer-layout"), "a hunter has no editor")
      .toBe(false);
    expect.soft(await session.isShowing("hunter-screen")).toBe(true);

    await admin.leaveProfilePreview();
    await expect.poll(() => session.isShowing("flyer-layout"), "the editor is back").toBe(true);
    expect.soft((await session.headerTabs()).join(" ")).toMatch(/Flyer Galicia/);
  });
});
