// Replaces pruebas/t77_suplencia.cjs.
import { type Cloud } from "../../support/cloud/index.ts";
import { expect, test } from "../../support/test.ts";

const OWNER_ID = "00000000-0000-4000-8000-0000000000bb";
const OWNER_NAME = "Pepito Gomez";
const OWNER_OFFICER = {
  nombre: OWNER_NAME,
  celular: "11 5555 0000",
  email: "pepito.gomez@bancogalicia.com.ar",
};
const OWN_COMPANIES = [
  {
    empresa: "ACME SA",
    cuits: ["30711111111"],
    config: "BAU",
    asesores: [{ nombre: "Ana Perez", celular: "11 4444 5555", email: "ana@bancogalicia.com.ar" }],
    rubro: {},
  },
];
const OWNER_COMPANIES = [
  {
    empresa: "DELTA LOGISTICA SA",
    cuits: ["30900123686"],
    config: "BAU",
    asesores: [OWNER_OFFICER],
    rubro: {},
    user_id: OWNER_ID,
    dueno_nombre: OWNER_NAME,
  },
  {
    empresa: "DELTA FOODS SRL",
    cuits: ["30900124615"],
    config: "BAU",
    asesores: [OWNER_OFFICER],
    rubro: {},
    user_id: OWNER_ID,
    dueno_nombre: OWNER_NAME,
  },
];
const NEW_OFFICER = {
  name: "Carla Nueva",
  phone: "11 6666 7777",
  email: "carla.nueva@bancogalicia.com.ar",
};
const OWNER_TAG = `Empresa de ${OWNER_NAME}`;

function setUpSubstitute(cloud: Cloud): void {
  cloud.companies = OWN_COMPANIES;
  cloud.substituteCompanies = OWNER_COMPANIES;
  cloud.companyProposals = [];
}

test.describe("a substitute reaches the companies of the one who chose them", () => {
  test("search, suggestions and generator keep the two bases apart", async ({ cloud, openApp }) => {
    setUpSubstitute(cloud);
    const { companyRegistry } = await openApp({ user: "admin" });

    // 1) Search: mine and those of Pepito, marked
    await companyRegistry.forgetCompanies();
    await companyRegistry.openSearch();
    await companyRegistry.waitForSearchResults(OWN_COMPANIES.length + OWNER_COMPANIES.length);
    const list = await companyRegistry.searchList();
    expect
      .soft(list.companies, "the search lists mine and those of the owner")
      .toHaveLength(OWN_COMPANIES.length + OWNER_COMPANIES.length);
    expect
      .soft(list.ownerTags, 'those of the owner say "Empresa de Pepito Gomez"')
      .toEqual([OWNER_TAG, OWNER_TAG]);
    expect.soft(list.companies[0], "mine come first").toBe("ACME SA");
    expect
      .soft(await companyRegistry.ownCompanyCount(), "and the base of my own still has one")
      .toBe(1);

    // 2) The search also finds a tax id in the base of Pepito
    await companyRegistry.searchFor("30-90012368");
    expect
      .soft((await companyRegistry.searchList()).companies, "the tax id of a company of the owner")
      .toEqual(["DELTA LOGISTICA SA"]);
    await companyRegistry.closeSearch();

    // 3) Suggestions
    await companyRegistry.typeCompanyName("delta");
    const suggestions = await companyRegistry.suggestions();
    expect.soft(suggestions.count, "the suggestions offer both of the owner").toBe(2);
    expect.soft(suggestions.ownerTags, "with their tag").toBe(2);
    await companyRegistry.closeSuggestions();

    // 4) Generar flyers only with mine
    await companyRegistry.showGenerator();
    expect.soft(await companyRegistry.generatorRowCount(), "Generar flyers: only mine").toBe(1);
    await companyRegistry.hideGenerator();
  });

  test(
    "Generar flyers and what is saved are only one's own",
    { tag: "@react" },
    async ({ cloud, openApp }) => {
      setUpSubstitute(cloud);
      const { companyRegistry } = await openApp({ user: "admin" });
      await companyRegistry.openRegistry();
      await companyRegistry.waitForCompaniesLoaded(OWN_COMPANIES.length);

      await companyRegistry.showGenerator();
      expect.soft(await companyRegistry.generatorRowCount()).toBe(OWN_COMPANIES.length);
      await companyRegistry.hideGenerator();

      await companyRegistry.openInlineEditor();
      await companyRegistry.saveInlineEditor();
      expect
        .soft(
          cloud.companyReplaceRows[0]?.map(({ empresa }) => empresa),
          "they never join one's own",
        )
        .toEqual(OWN_COMPANIES.map(({ empresa }) => empresa));
    },
  );

  test("a change on a company of the owner is requested, never saved", async ({
    cloud,
    openApp,
  }) => {
    setUpSubstitute(cloud);
    const { companyRegistry, flyerEditor } = await openApp({ user: "admin" });
    await companyRegistry.forgetCompanies();
    await companyRegistry.openSearch();
    await companyRegistry.waitForSearchResults(OWN_COMPANIES.length + OWNER_COMPANIES.length);
    await companyRegistry.closeSearch();

    // 5) A company of Pepito with another officer: after downloading it offers to REQUEST it
    const notices = await companyRegistry.applySubstituteCompany(0);
    expect
      .soft(notices.join(" | "), "bringing it says whose it is")
      .toMatch(/de las empresas de Pepito Gomez/);
    await flyerEditor.setOfficer(NEW_OFFICER);
    await companyRegistry.reviewChangesAfterDownload();
    const dialog = await companyRegistry.waitForUpdateDialog();
    expect
      .soft(dialog.title, 'the dialog: "Cambios en una empresa de Pepito Gomez"')
      .toMatch(/Cambios en una empresa de Pepito Gomez/);
    expect.soft(dialog.text, "it lists the change").toMatch(/Carla Nueva/);
    expect.soft(dialog.text, "it offers to request it").toMatch(/Ped[ií]rselo a Pepito Gomez/);
    expect
      .soft(dialog.text, "it does not offer to keep it in mine")
      .not.toMatch(/Actualizar empresa|Agregar a mis empresas/);
    expect.soft(dialog.asksForTaxId, "nor asks for a tax id").toBe(false);
    await companyRegistry.acceptUpdateDialog();

    const [first] = cloud.substituteRequests;
    expect.soft(first?.p_dueno, "the request goes to the right owner").toBe(OWNER_ID);
    expect.soft(first?.p_empresa, "about that company").toBe("DELTA LOGISTICA SA");
    expect
      .soft(first?.p_asesores, "with the new officer")
      .toEqual([
        expect.objectContaining({ nombre: NEW_OFFICER.name }),
        expect.anything(),
        expect.anything(),
        expect.anything(),
      ]);
    expect.soft(first?.p_config, "no cashback sent if it did not change").toBeNull();
    expect.soft(first?.p_rubro, "no category sent if it did not change").toBeNull();
    expect.soft(cloud.companyReplaceCalls, "my own base was never saved").toBe(0);

    await companyRegistry.reviewChangesAfterDownload();
    expect
      .soft(await companyRegistry.updateDialogIsOpen(), "it does not ask again for the same change")
      .toBe(false);

    // 6) Changing the cashback also travels in the request
    await companyRegistry.applySubstituteCompany(1);
    await flyerEditor.setNoCashback(true);
    await companyRegistry.reviewChangesAfterDownload();
    const cashbackDialog = await companyRegistry.waitForUpdateDialog();
    expect.soft(cashbackDialog.text, "the dialog shows the cashback change").toMatch(/Cashback/);
    await companyRegistry.acceptUpdateDialog();
    expect
      .soft(cloud.substituteRequests[1]?.p_config, 'the request sends "" for no cashback')
      .toBe("");
    await flyerEditor.setNoCashback(false);

    // 7) A company of MINE still offers "Actualizar mis empresas"
    await companyRegistry.applyOwnCompany(0);
    await flyerEditor.setOfficer({ name: "Otro Nombre", phone: "", email: "" });
    await companyRegistry.reviewChangesAfterDownload();
    expect
      .soft(
        (await companyRegistry.waitForUpdateDialog()).title,
        'own company: "Actualizar mis empresas"',
      )
      .toMatch(/Actualizar mis empresas/);
    await companyRegistry.dismissUpdateDialog();
  });

  test("when the owner takes the substitute out, their companies stop appearing", async ({
    cloud,
    openApp,
  }) => {
    setUpSubstitute(cloud);
    const { companyRegistry } = await openApp({ user: "admin" });
    await companyRegistry.forgetCompanies();
    await companyRegistry.openSearch();
    await companyRegistry.waitForSearchResults(OWN_COMPANIES.length + OWNER_COMPANIES.length);
    await companyRegistry.closeSearch();

    cloud.substituteCompanies = [];
    await companyRegistry.refreshSubstitutes();
    await companyRegistry.openSearch();

    const list = await companyRegistry.searchList();
    expect.soft(list.companies, "the search goes back to mine only").toEqual(["ACME SA"]);
    expect.soft(list.ownerTags, "with no owner tags").toEqual([]);
    await companyRegistry.closeSearch();
  });

  test(
    "the owner sees the request of the substitute with its cashback",
    { tag: "@react" },
    async ({ cloud, openApp }) => {
      setUpSubstitute(cloud);
      const app = await openApp({ user: "admin" });
      const createdAt = new Date().toISOString();
      cloud.companyProposals = [
        {
          id: "a1",
          empresa: "DELTA FOODS SRL",
          estado: "pendiente",
          origen: "suplente",
          creada_por: "x1",
          creada_por_nombre: "Admin Prueba",
          dueno_id: "yo",
          created_at: createdAt,
          asesores_antes: [{ nombre: OWNER_NAME, celular: "11 5555 0000", email: "" }],
          asesores: [{ nombre: OWNER_NAME, celular: "11 5555 0000", email: "" }],
          config_antes: "BAU",
          config: "",
          rubro_antes: null,
          rubro: null,
        },
        {
          id: "a2",
          empresa: "OTRA SA",
          estado: "pendiente",
          origen: "hunter",
          creada_por: "x2",
          creada_por_nombre: "Hunter Uno",
          dueno_id: "yo",
          created_at: createdAt,
          asesores_antes: [{ nombre: "Ana", celular: "", email: "" }],
          asesores: [{ nombre: "Beto", celular: "", email: "" }],
        },
      ];

      const proposals = await app.companyRegistry.pendingProposals();

      expect.soft(proposals, "the owner sees both requests").toHaveLength(2);
      expect
        .soft(proposals[0]?.text, 'the one of the substitute says "como suplente"')
        .toMatch(/como suplente/);
      expect
        .soft(proposals[0]?.text, "it shows the cashback")
        .toMatch(/Cashback: BAU → Sin cashback/);
      expect.soft(proposals[0]?.canAskBack, "and has no Repreguntar").toBe(false);
      expect.soft(proposals[1]?.canAskBack, "the one of the hunter keeps Repreguntar").toBe(true);
      expect
        .soft(proposals[1]?.text, "and says who proposed it")
        .toMatch(/Propuesto por Hunter Uno/);
      expect.soft(app.pageErrors(), "no JavaScript errors").toEqual([]);
    },
  );
});
