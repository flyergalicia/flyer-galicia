// Protects what happens after downloading a flyer of a company: the offers to update the list.
import { type Cloud } from "../../support/cloud/index.ts";
import { type OpenedApp } from "../../support/open-app.ts";
import { expect, test } from "../../support/test.ts";

const ACME = {
  empresa: "ACME SA",
  cuits: ["30711111111"],
  config: "BAU",
  asesores: [
    { nombre: "Ana Perez", celular: "11 4444 5555", email: "ana.perez@bancogalicia.com.ar" },
    { nombre: "Luis Gomez", celular: "11 4444 6666", email: "luis.gomez@bancogalicia.com.ar" },
  ],
  rubro: {},
};
const BETA = { ...ACME, empresa: "BETA SA" };

async function withCompany(cloud: Cloud, openApp: (o?: object) => Promise<OpenedApp>) {
  cloud.companies = [ACME, BETA];
  const app = await openApp({ user: "admin" });
  await app.flyerEditor.loadDownloadLibrary("pdf");
  await app.companyRegistry.openSearch();
  await app.companyRegistry.waitForSearchResults(2);
  await app.companyRegistry.chooseFromSearch("ACME SA");
  return app;
}

test.describe("after downloading a flyer", () => {
  test("nothing is asked when nothing changed", async ({ cloud, openApp }) => {
    const { flyerEditor, companyRegistry } = await withCompany(cloud, openApp);

    await flyerEditor.downloadPdf();

    expect.soft(await companyRegistry.updateDialogIsOpen()).toBe(false);
  });

  test("a change is offered and saved, and the name of the company is never touched", async ({
    cloud,
    openApp,
  }) => {
    const { flyerEditor, companyRegistry, officers } = await withCompany(cloud, openApp);
    await officers.fill(1, { phone: "11 7777 8888" });

    await flyerEditor.downloadPdf();

    const dialog = await companyRegistry.waitForUpdateDialog();
    expect.soft(dialog.title).toMatch(/Actualizar mis empresas/);
    expect.soft(dialog.text, "it says what changed").toMatch(/11 4444 5555.*11 7777 8888/s);
    expect.soft(dialog.asksForTaxId, "and lets complete the tax id").toBe(true);

    await companyRegistry.fillTaxIdInDialog("30-71111111-1, 30-79999999-9");
    await companyRegistry.acceptUpdateDialog();

    const [saved] = cloud.companyReplaceRows;
    const row = saved?.find(({ empresa }) => empresa === "ACME SA");
    expect.soft(saved?.length, "the rest of the list is kept").toBe(2);
    expect
      .soft(row?.cuits, "the tax ids are read from the dialog")
      .toEqual(["30711111111", "30799999999"]);
    expect.soft(JSON.stringify(row?.asesores), "the new phone is saved").toContain("11 7777 8888");
    expect.soft(await flyerEditor.latestNotice()).toMatch(/Empresa actualizada: ACME SA/);
  });

  test("a click outside does not close it, and saying no holds until something changes", async ({
    cloud,
    openApp,
  }) => {
    const { flyerEditor, companyRegistry, officers } = await withCompany(cloud, openApp);
    await officers.fill(1, { phone: "11 7777 8888" });
    await flyerEditor.downloadPdf();
    await companyRegistry.waitForUpdateDialog();

    await companyRegistry.clickOutsideUpdateDialog();
    expect.soft(await companyRegistry.updateDialogIsOpen(), "only its buttons close it").toBe(true);

    await companyRegistry.declineUpdateDialog();
    expect.soft(cloud.companyReplaceCalls, "saying no saves nothing").toBe(0);

    await flyerEditor.downloadPdf();
    expect.soft(await companyRegistry.updateDialogIsOpen(), "the same change: silent").toBe(false);

    await officers.fill(1, { phone: "11 9999 0000" });
    await flyerEditor.downloadPdf();
    expect.soft(await companyRegistry.updateDialogIsOpen(), "another change: it asks").toBe(true);
  });

  test("a removed officer goes in red, and hiding them all counts as removing them", async ({
    cloud,
    openApp,
  }) => {
    const { flyerEditor, companyRegistry, officers } = await withCompany(cloud, openApp);

    await officers.pressRemove(2);
    await flyerEditor.downloadPdf();
    await companyRegistry.waitForUpdateDialog();
    const removed = await companyRegistry.updateDialogLosses();
    expect.soft(removed.redItems.join(" ")).toMatch(/Oficial 2.*Luis Gomez.*se quita/);
    expect.soft(removed.redColor, "painted as a danger").toBe("rgb(179, 38, 30)");
    expect.soft(removed.alert, "no alert: the rest stay").toBe("");
    await companyRegistry.declineUpdateDialog();

    await officers.pressSwitch();
    await flyerEditor.downloadPdf();
    await companyRegistry.waitForUpdateDialog();
    const hidden = await companyRegistry.updateDialogLosses();
    expect.soft(hidden.redItems.join(" "), "the switch counts as a change").toMatch(/Ana Perez/);
    expect.soft(hidden.alert).toMatch(/queda guardada sin sus oficiales/);
  });

  test("a name that is not in the list offers adding it, apart from the others", async ({
    cloud,
    openApp,
  }) => {
    const { flyerEditor, companyRegistry, officers } = await withCompany(cloud, openApp);
    await flyerEditor.fillCompanyName("NUEVA SRL");
    await officers.fill(1, { name: "Sol Ruiz", phone: "11 5", email: "sol@bancogalicia.com.ar" });
    await officers.pressRemove(2);

    await flyerEditor.downloadPdf();

    const dialog = await companyRegistry.waitForUpdateDialog();
    expect.soft(dialog.title).toMatch(/Agregar a mis empresas/);
    expect.soft(dialog.text, "it is not a rename of the other").toMatch(/no pisa ninguna/);
    await companyRegistry.fillTaxIdInDialog("30-72222222-2");
    await companyRegistry.acceptUpdateDialog();

    const [saved] = cloud.companyReplaceRows;
    expect.soft(saved?.map(({ empresa }) => empresa)).toEqual(["ACME SA", "BETA SA", "NUEVA SRL"]);
    expect.soft(saved?.at(-1)?.cuits).toEqual(["30722222222"]);
  });

  test("the same tax id on another company does not make them the same company", async ({
    cloud,
    openApp,
  }) => {
    const { flyerEditor, companyRegistry } = await withCompany(cloud, openApp);
    await flyerEditor.fillCompanyName("ACME GRUPO");

    await flyerEditor.downloadPdf();

    const dialog = await companyRegistry.waitForUpdateDialog();
    expect.soft(dialog.title, "another name is another company").toMatch(/Agregar a mis empresas/);
    await companyRegistry.fillTaxIdInDialog("30-71111111-1");
    expect
      .soft(await companyRegistry.updateDialogTaxIdNote(), "it warns, without stopping")
      .toMatch(/Ese CUIT ya figura en ACME SA.*Se guarda igual/);
    await companyRegistry.acceptUpdateDialog();

    const [saved] = cloud.companyReplaceRows;
    const names = saved?.map(({ empresa }) => empresa);
    expect.soft(names, "the first company is still there, with its name").toContain("ACME SA");
    expect.soft(names).toContain("ACME GRUPO");
  });
});
