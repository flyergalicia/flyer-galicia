// Protects the search and the rules of bringing a company, guarded only by text checks before.
import { expect, test } from "../../support/test.ts";

const ACME = {
  empresa: "ACME S.A.",
  cuits: ["30711111111"],
  config: "Config 2",
  asesores: [{ nombre: "Ana Perez", celular: "11 4444 5555", email: "otra@bancogalicia.com.ar" }],
  rubro: {},
};
const BETA = {
  empresa: "BETA SA",
  cuits: ["30722222222"],
  config: "BAU",
  asesores: [{ nombre: "Luis Gomez", celular: "11 4444 6666", email: "" }],
  rubro: {},
};
const LOGISTICA = {
  empresa: "Transportes del Sur S.R.L.",
  cuits: ["30733333333", "30744444444"],
  config: "BAU",
  asesores: [
    { nombre: "Uno Primero", celular: "11 1", email: "" },
    { nombre: "Dos Segundo", celular: "11 2", email: "" },
  ],
  rubro: {},
};
const SIN_OFICIALES = { empresa: "SOLA SA", cuits: [], config: "BAU", asesores: [], rubro: {} };
const COMPANIES = [ACME, BETA, LOGISTICA, SIN_OFICIALES];

test.describe("the magnifying glass", { tag: "@react" }, () => {
  test("dots do not count: S.A. finds SA and SA finds S.A.", async ({ cloud, openApp }) => {
    cloud.companies = COMPANIES;
    const { companyRegistry: registry } = await openApp({ user: "admin" });
    await registry.openSearch();

    await registry.searchFor("BETA S.A.");
    expect.soft((await registry.searchList()).companies, '"S.A." finds "SA"').toEqual(["BETA SA"]);

    await registry.searchFor("acme sa");
    expect
      .soft((await registry.searchList()).companies, '"SA" finds "S.A."')
      .toEqual(["ACME S.A."]);

    await registry.searchFor("transportes s.r.l.");
    expect
      .soft((await registry.searchList()).companies, "any company type, any capitals")
      .toEqual(["Transportes del Sur S.R.L."]);

    await registry.searchFor("S.A.");
    const both = (await registry.searchList()).companies;
    expect.soft(both, "only dots and letters").toContain("BETA SA");
    expect.soft(both).toContain("ACME S.A.");
  });

  test("it searches words in any order, and tax ids with or without separators", async ({
    cloud,
    openApp,
  }) => {
    cloud.companies = COMPANIES;
    const { companyRegistry: registry } = await openApp({ user: "admin" });
    await registry.openSearch();
    const found = async (text: string) => {
      await registry.searchFor(text);
      return (await registry.searchList()).companies;
    };

    expect.soft((await found("")).length, "empty shows them all").toBe(COMPANIES.length);
    expect.soft(await found("sur transportes"), "any order").toEqual([LOGISTICA.empresa]);
    expect.soft(await found("30-73333333-3"), "a tax id with dashes").toEqual([LOGISTICA.empresa]);
    expect.soft(await found("30744444444"), "the second tax id too").toEqual([LOGISTICA.empresa]);
    expect.soft(await found("3072"), "part of it").toEqual([BETA.empresa]);
    expect.soft(await found("zzz"), "nothing is nothing").toEqual([]);
  });

  test("without the faculty there is no magnifying glass and no suggestion", async ({
    cloud,
    openApp,
  }) => {
    cloud.companies = COMPANIES;
    cloud.setPermissions("asesor", { padron_buscar: false });
    const { companyRegistry: registry } = await openApp();

    expect.soft(await registry.searchOffered()).toBe(false);
    await registry.typeCompanyName("acme");
    expect.soft(await registry.suggestedCompanies()).toEqual([]);
  });

  test("with the faculty it is there, and a list that is not one's own never shows", async ({
    cloud,
    openApp,
  }) => {
    cloud.companies = [
      { ...ACME, user_id: cloud.users.asesor?.id },
      {
        ...BETA,
        user_id: "00000000-0000-4000-8000-0000000000dd",
      },
    ];
    cloud.setPermissions("asesor", { padron_buscar: true });
    const { companyRegistry: registry } = await openApp();

    expect.soft(await registry.searchOffered()).toBe(true);
    await registry.openSearch();
    await registry.waitForSearchResults(1);
    expect
      .soft((await registry.searchList()).companies, "the list is private")
      .toEqual(["ACME S.A."]);
  });
});

test.describe("while typing the company", { tag: "@react" }, () => {
  test("it suggests from two letters or three digits, and Enter brings it", async ({
    cloud,
    openApp,
  }) => {
    cloud.companies = COMPANIES;
    const { companyRegistry: registry, flyerEditor, officers } = await openApp({ user: "admin" });
    await registry.loadCompanies();
    await registry.waitForCompaniesLoaded(COMPANIES.length);

    await registry.typeCompanyName("a");
    expect.soft(await registry.suggestedCompanies(), "one letter is not enough").toEqual([]);
    await registry.typeCompanyName("30");
    expect.soft(await registry.suggestedCompanies(), "nor two digits").toEqual([]);
    await registry.typeCompanyName("307");
    expect.soft((await registry.suggestedCompanies()).length, "three digits are").toBe(3);
    await registry.typeCompanyName("be");
    expect.soft(await registry.suggestedCompanies()).toEqual(["BETA SA"]);

    await registry.pressInCompanyField("Enter");
    expect.soft(await flyerEditor.companyName()).toBe("BETA SA");
    expect.soft((await officers.read(1)).name, "with its officer").toBe("Luis Gomez");
    expect.soft(await registry.suggestedCompanies(), "and the list goes away").toEqual([]);
  });
});

test.describe("bringing a company", { tag: "@react" }, () => {
  test("its data arrives whole: cashback, officers and the name of the file", async ({
    cloud,
    openApp,
  }) => {
    cloud.companies = COMPANIES;
    const { companyRegistry: registry, officers, flyerEditor } = await openApp({ user: "admin" });
    await registry.openSearch();
    await registry.waitForSearchResults(COMPANIES.length);

    await registry.chooseFromSearch(LOGISTICA.empresa);

    expect.soft(await flyerEditor.companyName()).toBe(LOGISTICA.empresa);
    expect.soft((await officers.read(1)).name).toBe("Uno Primero");
    expect.soft((await officers.read(2)).name).toBe("Dos Segundo");
    expect.soft(await officers.shownBlocks()).toEqual([1, 2]);
    expect.soft(await registry.fileNameField()).toBe(`Flyer_${LOGISTICA.empresa}`);
    expect.soft(await flyerEditor.latestNotice()).toMatch(/2 oficiales/);
  });

  test("a mail the list does not have is deduced, and one it has is kept", async ({
    cloud,
    openApp,
  }) => {
    cloud.companies = COMPANIES;
    const { companyRegistry: registry, officers } = await openApp({ user: "admin" });
    await registry.openSearch();
    await registry.waitForSearchResults(COMPANIES.length);

    await registry.chooseFromSearch(BETA.empresa);
    expect.soft((await officers.read(1)).email).toBe("luis.gomez@bancogalicia.com.ar");

    await registry.openSearch();
    await registry.chooseFromSearch(ACME.empresa);
    expect.soft((await officers.read(1)).email, "the list rules").toBe("otra@bancogalicia.com.ar");
  });

  test("a company with no officers empties the fields and says so", async ({ cloud, openApp }) => {
    cloud.companies = COMPANIES;
    const { companyRegistry: registry, officers } = await openApp({ user: "admin" });
    await registry.openSearch();
    await registry.waitForSearchResults(COMPANIES.length);
    await registry.chooseFromSearch(LOGISTICA.empresa);
    expect.soft(await registry.companyNote()).toBe("");

    await registry.openSearch();
    await registry.chooseFromSearch(SIN_OFICIALES.empresa);

    expect.soft(await officers.read(1), "nothing is dragged from the other company").toEqual({
      name: "",
      phone: "",
      email: "",
    });
    expect.soft(await officers.shownBlocks(), "only the first block stays").toEqual([1]);
    expect.soft(await registry.companyNote()).toMatch(/no tiene oficiales asignados/);
  });

  test("it turns the officers back on: the switch is only for the flyer in progress", async ({
    cloud,
    openApp,
  }) => {
    cloud.companies = COMPANIES;
    const { companyRegistry: registry, officers } = await openApp({ user: "admin" });
    await officers.pressSwitch();
    expect.soft(await officers.switchIsOn()).toBe(false);

    await registry.openSearch();
    await registry.waitForSearchResults(COMPANIES.length);
    await registry.chooseFromSearch(BETA.empresa);

    expect.soft(await officers.switchIsOn()).toBe(true);
  });

  const noCashbackCases: readonly (readonly [string, string])[] = [
    ["an empty cell", ""],
    ["SIN", "SIN"],
    ["a value it does not know", "Premium"],
  ];
  for (const [what, config] of noCashbackCases) {
    test(`${what} means no cashback, with a warning and blank amounts`, async ({
      cloud,
      openApp,
    }) => {
      const company = { ...BETA, empresa: "OTRA SA", config };
      cloud.companies = [company];
      const app = await openApp({ user: "admin" });
      const { companyRegistry: registry } = app;
      await registry.openSearch();
      await registry.waitForSearchResults(1);

      await registry.chooseFromSearch("OTRA SA");

      const dialog = await registry.waitForUpdateDialog();
      expect.soft(dialog.title).toMatch(/Sin cashback/);
      await registry.acceptUpdateDialog();
      const drawn = await app.flyerDrawing.draw();
      const texts = drawn.texts.map(({ text }) => text);
      expect.soft(texts, "the amounts are not written").not.toContain("$250.000");
    });
  }

  test("the cashback of the row chooses the amounts drawn, in any way it is written", async ({
    cloud,
    openApp,
  }) => {
    cloud.bucketJson["_cashback.json"] = {
      configs: [
        { nombre: "BAU", m1: "$250.000", m2: "$180.000", m3: "$80.000", m4: "$30.000" },
        { nombre: "Config 1", m1: "$111.000", m2: "$11.000", m3: "$1.100", m4: "$110" },
        { nombre: "Config 2", m1: "$222.000", m2: "$22.000", m3: "$2.200", m4: "$220" },
      ],
    };
    cloud.companies = [
      { ...BETA, empresa: "UNO SA", config: "1.0" },
      { ...BETA, empresa: "DOS SA", config: "config 2" },
      { ...BETA, empresa: "BASE SA", config: "bau" },
    ];
    const app = await openApp({ user: "admin" });
    const { companyRegistry: registry, flyerDrawing } = app;
    const amounts = async (name: string) => {
      await registry.openSearch();
      await registry.chooseFromSearch(name);
      return (await flyerDrawing.draw()).texts.map(({ text }) => text);
    };
    await registry.openSearch();
    await registry.waitForSearchResults(3);
    await registry.closeSearch();

    expect.soft(await amounts("UNO SA"), '"1.0" from a spreadsheet').toContain("$111.000");
    expect.soft(await amounts("DOS SA"), '"config 2"').toContain("$222.000");
    expect.soft(await amounts("BASE SA"), '"bau"').toContain("$250.000");
  });

  test("rows that arrive incomplete do not break anything", async ({ cloud, openApp }) => {
    cloud.companies = [
      { empresa: "  CON ESPACIOS  ", cuits: "30-71111111-1 / 30722222222", config: "BAU" },
      { empresa: 12_345, cuits: null, config: null, asesores: "nada" },
      { empresa: "", cuits: [], config: "BAU" },
      {
        empresa: "MEDIO",
        cuits: ["30733333333", "30733333333"],
        asesores: [{ nombre: null }, null],
      },
    ];
    const app = await openApp({ user: "admin" });
    const { companyRegistry: registry } = app;
    await registry.openSearch();
    await registry.waitForSearchResults(3);

    expect
      .soft((await registry.searchList()).companies, "names are cleaned; an empty row goes")
      .toEqual(["CON ESPACIOS", "12345", "MEDIO"]);
    await registry.searchFor("30722222222");
    expect
      .soft((await registry.searchList()).companies, "a text cell gives its tax ids")
      .toEqual(["CON ESPACIOS"]);
    await registry.searchFor("MEDIO");
    await registry.chooseFromSearch("MEDIO");
    expect.soft(app.pageErrors()).toEqual([]);
  });
});
