// Protects Base de datos: who sees which solapa, Mis asesores and what an administrator can read.
import { type CloudUser } from "../../support/cloud/index.ts";
import { expect, test } from "../../support/test.ts";

const OTHER: CloudUser = {
  id: "00000000-0000-4000-8000-0000000000ef",
  email: "otro@bancogalicia.com.ar",
  name: "Otro Asesor",
  role: "asesor",
};

test.describe("Base de datos", () => {
  test("comes from the name menu, with the solapas of the faculties of each one", async ({
    cloud,
    openApp,
  }) => {
    cloud.setPermissions("asesor", { padron_buscar: false, asesores_guardados: false });
    const none = await openApp();
    expect.soft((await none.session.userMenuItems()).join(" ")).not.toMatch(/Base de datos/);

    cloud.setPermissions("asesor", { padron_buscar: false, asesores_guardados: true });
    const one = await openApp();
    expect.soft((await one.session.userMenuItems()).join(" ")).toMatch(/Base de datos/);
    await one.session.chooseFromUserMenu("Base de datos");
    await expect.poll(() => one.session.isShowing("my-database")).toBe(true);
    expect.soft(await one.companyRegistry.databaseTabs(), "one pane: no solapas").toEqual([]);

    cloud.setPermissions("asesor", { padron_buscar: true, asesores_guardados: true });
    const all = await openApp();
    await all.companyRegistry.openRegistry();
    const tabs = await all.companyRegistry.databaseTabs();
    expect.soft(tabs.join(" | ")).toMatch(/Mis empresas.*Mis asesores.*Cambios pendientes/);
  });

  test("Mis asesores corrects and saves in the cloud", async ({ cloud, openApp }) => {
    cloud.setPermissions("asesor", { asesores_guardados: true });
    cloud.savedAdvisors = [
      { id: "a1", name: "Ana", nombre: "Ana Perez", celular: "11 1", email: "a@b.com" },
    ];
    const app = await openApp();
    const replaced: string[] = [];
    app.page.on("request", (request) => {
      if (request.url().includes("/rpc/asesores_replace")) replaced.push(request.postData() ?? "");
    });
    await app.companyRegistry.openRegistry();

    expect.soft((await app.companyRegistry.advisorsInDatabase()).join(" ")).toContain("Ana Perez");
    await app.companyRegistry.editAdvisorInDatabase(0, "Ana Corregida");
    await app.companyRegistry.saveAdvisorsInDatabase();

    await expect.poll(() => replaced.length).toBe(1);
    expect.soft(replaced[0]).toContain("Ana Corregida");
  });

  test("an administrator reads the list of someone else, without being able to edit it", async ({
    cloud,
    openApp,
  }) => {
    cloud.profiles = [
      { id: OTHER.id, full_name: OTHER.name, email_asesor: OTHER.email, role: "asesor" },
      {
        id: cloud.users.admin?.id,
        full_name: "Admin Prueba",
        email_asesor: "a@bancogalicia.com.ar",
        role: "admin",
      },
    ];
    cloud.companies = [
      { empresa: "DE OTRO SA", user_id: OTHER.id, cuits: [], config: "BAU", asesores: [] },
      { empresa: "MIA SA", user_id: "x", cuits: [], config: "BAU", asesores: [] },
    ];
    const { admin, companyRegistry } = await openApp({ user: "admin" });
    await admin.openPanel();
    await admin.openSheet("Data", "Empresas por usuario");

    const offered = `${OTHER.name} · Asesor`;
    await expect
      .poll(() => companyRegistry.otherUsersOffered(), "not the administrators")
      .toEqual([offered]);
    await companyRegistry.chooseOtherUser(offered);

    await expect.poll(() => admin.sheetText()).toMatch(/DE OTRO SA/);
    expect.soft(await admin.sheetText(), "only of that person").not.toMatch(/MIA SA/);
    expect.soft(await companyRegistry.otherUserScreenHasEditing()).toBe(false);
  });
});
