// Protects the exports that used to stop at 1000 rows without saying so.
import { type CloudUser } from "../../support/cloud/index.ts";
import { expect, test } from "../../support/test.ts";

const MANY = 2_300;
const OWNER = "00000000-0000-4000-8000-000000000001";
const logs = Array.from({ length: MANY }, (_, at) => ({
  id: `l${String(at)}`,
  user_id: OWNER,
  empresa: `EMPRESA ${String(at)}`,
  config_name: "BAU",
  format: "pdf",
  flyer_type: "{}",
  created_at: "2026-10-20T10:00:00Z",
}));

test("Registros exports all its rows", async ({ cloud, openApp }) => {
  cloud.flyerLogs = logs;
  cloud.profiles = [{ id: OWNER, full_name: "Ana Perez", email_asesor: "a@b.com", role: "asesor" }];
  const { admin } = await openApp({ user: "admin" });
  await admin.openPanel();
  await admin.openSheet("Admin", "Registros");

  const sheet = await admin.exportSheet("btn-export-reg");

  expect.soft(sheet.rows.length).toBe(MANY);
});

test("the dashboard exports all its rows", async ({ cloud, openApp }) => {
  cloud.flyerLogs = logs;
  cloud.profiles = [{ id: OWNER, full_name: "Ana Perez", email_asesor: "a@b.com", role: "asesor" }];
  const { admin } = await openApp({ user: "admin" });
  await admin.openPanel();

  const sheet = await admin.exportSheet("btn-export-excel");

  expect.soft(sheet.rows.length).toBe(MANY);
});

test("Cambios en las empresas exports all its rows", async ({ cloud, openApp }) => {
  cloud.companyLog = Array.from({ length: MANY }, (_, at) => ({
    id: `c${String(at)}`,
    created_at: "2026-10-20T10:00:00Z",
    usuario: "Ana Perez",
    user_id: OWNER,
    accion: "alta",
    empresa: `EMPRESA ${String(at)}`,
    total: 1,
  }));
  const { admin } = await openApp({ user: "admin" });
  await admin.openPanel();
  await admin.openSheet("Data", "Cambios en las empresas");

  const sheet = await admin.exportSheet("btn-export-plog");

  expect.soft(sheet.rows.length).toBe(MANY);
});

test(
  "the Hunter reaches the companies after the first page of the database",
  { tag: "@react" },
  async ({ cloud, openApp }) => {
    const hunter: CloudUser = {
      id: "00000000-0000-4000-8000-0000000000cc",
      email: "hunter.prueba@bancogalicia.com.ar",
      name: "Hunter Prueba",
      role: "hunter",
    };
    cloud.setPermissions("hunter", { opcion_9: true });
    cloud.companies = Array.from({ length: MANY }, (_, at) => ({
      id: `e${String(at)}`,
      empresa: at === MANY - 1 ? "LA ULTIMA SA" : `EMPRESA ${String(at)}`,
      cuits: [],
      config: "BAU",
      asesores: [],
      rubro: {},
    }));
    const app = await openApp({ user: hunter, waitUntilReady: false });
    await app.session.waitUntilSignedIn();
    await app.hunter.waitForList();

    expect.soft(await app.hunter.status()).toMatch(new RegExp(String(MANY)));
    await app.hunter.search("LA ULTIMA");
    expect.soft((await app.hunter.rows()).map(({ company }) => company)).toEqual(["LA ULTIMA SA"]);
  },
);
