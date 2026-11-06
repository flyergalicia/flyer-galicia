// Protects Base de datos: who sees which solapa, Mis asesores and what an administrator can read.
import { type CloudUser } from "../../support/cloud/index.ts";
import { expect, test } from "../../support/test.ts";

const OTHER: CloudUser = {
  id: "00000000-0000-4000-8000-0000000000ef",
  email: "otro@bancogalicia.com.ar",
  name: "Otro Asesor",
  role: "asesor",
};

const WAITING_PROPOSAL = {
  id: "p1",
  empresa: "ACME SA",
  estado: "pendiente",
  origen: "hunter",
  creada_por: "x1",
  creada_por_nombre: "Hunter Uno",
  created_at: "2026-10-20T10:00:00Z",
  asesores_antes: [],
  asesores: [],
};

test.describe("Base de datos", () => {
  test(
    "comes from the name menu, with the solapas of the faculties of each one",
    { tag: "@react" },
    async ({ cloud, openApp }) => {
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
    },
  );

  test(
    "Mis asesores corrects and saves in the cloud",
    { tag: "@react" },
    async ({ cloud, openApp }) => {
      cloud.setPermissions("asesor", { asesores_guardados: true });
      cloud.savedAdvisors = [
        { id: "a1", name: "Ana", nombre: "Ana Perez", celular: "11 1", email: "a@b.com" },
      ];
      const app = await openApp();
      const replaced: string[] = [];
      app.page.on("request", (request) => {
        if (request.url().includes("/rpc/asesores_replace"))
          replaced.push(request.postData() ?? "");
      });
      await app.companyRegistry.openRegistry();

      expect
        .soft((await app.companyRegistry.advisorsInDatabase()).join(" "))
        .toContain("Ana Perez");
      await app.companyRegistry.editAdvisorInDatabase(0, "Ana Corregida");
      await app.companyRegistry.saveAdvisorsInDatabase();

      await expect.poll(() => replaced.length).toBe(1);
      expect.soft(replaced[0]).toContain("Ana Corregida");
    },
  );

  test(
    "the name menu carries how many changes wait for a decision",
    { tag: "@react" },
    async ({ cloud, openApp }) => {
      cloud.setPermissions("asesor", { padron_buscar: true });
      cloud.companyProposals = [WAITING_PROPOSAL];
      const { session } = await openApp();

      await expect
        .poll(async () => (await session.userMenuItems()).join(" "))
        .toMatch(/Base de datos\s*1/);
    },
  );

  test(
    "a substitute with no faculty of their own has it as soon as something waits",
    { tag: "@react" },
    async ({ cloud, openApp, target }) => {
      test.skip(
        target === "legacy",
        "The current app decides it once, and the answer may come later: see avance",
      );
      cloud.setPermissions("asesor", { padron_buscar: false, asesores_guardados: false });
      cloud.companyProposals = [WAITING_PROPOSAL];
      const { session } = await openApp();

      await expect
        .poll(async () => (await session.userMenuItems()).join(" "))
        .toMatch(/Base de datos\s*1/);
    },
  );

  test(
    "a list of more than 1000 companies comes whole",
    { tag: "@react" },
    async ({ cloud, openApp, target }) => {
      test.skip(target === "legacy", "The current app reads the first 1000: see avance");
      cloud.companies = Array.from({ length: 1500 }, (_, row) => ({
        empresa: `EMPRESA ${String(row)}`,
        cuits: [],
        config: "BAU",
        asesores: [],
      }));
      cloud.setPermissions("asesor", { padron_buscar: true });
      const { companyRegistry } = await openApp();

      await companyRegistry.openRegistry();

      await expect.poll(() => companyRegistry.registryStatus()).toMatch(/^1500 empresas/);
    },
  );

  test(
    "an administrator reads the list of someone else, without being able to edit it",
    { tag: "@react" },
    async ({ cloud, openApp }) => {
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
    },
  );
});
