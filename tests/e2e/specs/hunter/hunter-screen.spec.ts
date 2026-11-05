// Protects the Hunter profile: one screen, search and download, and nothing else.
import { type Cloud, type CloudUser, type Row } from "../../support/cloud/index.ts";
import { type OpenedApp } from "../../support/open-app.ts";
import { expect, test } from "../../support/test.ts";

const HUNTER: CloudUser = {
  id: "00000000-0000-4000-8000-0000000000cc",
  email: "hunter.prueba@bancogalicia.com.ar",
  name: "Hunter Prueba",
  role: "hunter",
};
const OWNER = "00000000-0000-4000-8000-0000000000bb";
const OFFICER = { nombre: "Ana Perez", celular: "11 4444 5555", email: "ana@bancogalicia.com.ar" };
const company = (empresa: string, extra: object = {}) => ({
  id: empresa,
  user_id: OWNER,
  empresa,
  cuits: ["30711111111"],
  config: "BAU",
  asesores: [OFFICER],
  rubro: {},
  ...extra,
});
const FLYER = "flyer_t7.jpg?v=1";

function setUp(cloud: Cloud, rows: Row[], permissions: Record<string, boolean> = {}): void {
  cloud.companies = rows;
  cloud.setPermissions("hunter", { opcion_9: true, ...permissions });
}

async function openHunter(openApp: (o?: object) => Promise<OpenedApp>): Promise<OpenedApp> {
  const app = await openApp({ user: HUNTER, waitUntilReady: false });
  await app.session.waitUntilSignedIn();
  await expect.poll(() => app.session.isShowing("hunter-screen"), { timeout: 10_000 }).toBe(true);
  await app.hunter.waitForList();
  return app;
}

test.describe("the Hunter", { tag: "@react" }, () => {
  test("has one tab, and the lock of its profile beats the matrix", async ({ cloud, openApp }) => {
    setUp(cloud, [company("ACME SA")], {
      padron_buscar: true,
      pegar_oficial: true,
      estudio: true,
      benchmark: true,
    });
    const app = await openHunter(openApp);

    const tabs = (await app.session.headerTabs()).join(" ");
    expect.soft(tabs).toMatch(/Flyer por empresa|Buscar flyer|Hunter/);
    expect.soft(tabs, "no Studio even if it is ticked").not.toMatch(/Estudio/);
    expect.soft(tabs, "no Benchmark").not.toMatch(/Benchmark/);
    expect.soft(await app.session.isShowing("flyer-layout"), "no editor").toBe(false);
    const menu = (await app.session.userMenuItems()).join(" ");
    expect.soft(menu, "no database").not.toMatch(/Base de datos/);
  });

  test("searches, chooses and downloads, writing nothing but the log of the download", async ({
    cloud,
    openApp,
  }) => {
    setUp(cloud, [company("ACME SA"), company("BETA S.A.")]);
    const app = await openHunter(openApp);
    const writes: string[] = [];
    app.page.on("request", (request) => {
      if (request.method() !== "GET" && request.url().includes("/rest/v1/")) {
        writes.push(new URL(request.url()).pathname);
      }
    });
    await app.hunter.search("beta sa");
    expect
      .soft(
        (await app.hunter.rows()).map(({ company: name }) => name),
        "dots do not count",
      )
      .toEqual(["BETA S.A."]);

    await app.hunter.pressInSearch("Enter");
    const preview = await app.hunter.waitForPreview();
    expect.soft(preview.shown, "Enter chooses the first").toBe(true);
    expect.soft(preview.canDownload).toBe(true);
    expect.soft((await app.hunter.drawnTexts()).join(" "), "with its officer").toMatch(/Ana Perez/);

    const file = await app.hunter.download();
    expect.soft(file).toMatch(/^Flyer BETA S\.A\.*.*\.pdf$/);
    await expect.poll(() => writes.length).toBeGreaterThan(0);
    expect
      .soft(
        writes.every((path) => path.endsWith("/flyer_logs")),
        writes.join(", "),
      )
      .toBe(true);
    expect.soft(cloud.companyReplaceCalls, "the list of companies is not touched").toBe(0);
    await app.page.waitForTimeout(500);
    expect
      .soft(await app.companyRegistry.updateDialogIsOpen(), "and no offer to update it")
      .toBe(false);
  });

  test("a company it cannot draw says why, instead of using another flyer", async ({
    cloud,
    openApp,
  }) => {
    cloud.addFlyerOption({
      option: 8,
      name: "Combustible",
      image: FLYER,
      legal: "L8",
      tab: "rubros",
    });
    setUp(cloud, [
      company("SIN RUBRO SA"),
      company("RUBRO SA", { rubro: { opcion: 8, txt: "Combustible" } }),
    ]);
    const app = await openHunter(openApp);

    const rows = await app.hunter.rows();
    const blocked = rows.find(({ company: name }) => name === "RUBRO SA");
    expect.soft(blocked?.canDraw, "its flyer is not enabled").toBe(false);
    expect.soft(blocked?.warnings).toMatch(/no est. habilitado/);
    expect.soft(rows.find(({ company: name }) => name === "SIN RUBRO SA")?.canDraw).toBe(true);

    await app.hunter.choose("RUBRO SA");
    const preview = await app.hunter.waitForPreview();
    expect.soft(preview.shown).toBe(false);
    expect.soft(preview.canDownload).toBe(false);
    expect.soft(preview.message).toMatch(/No hay flyer para esta empresa/);
  });

  test("the current flyer of the category is used, with its legal", async ({ cloud, openApp }) => {
    cloud.addFlyerOption({
      option: 8,
      name: "Combustible viejo",
      image: FLYER,
      legal: "Viejo",
      tab: "rubros",
    });
    cloud.addFlyerOption({
      option: 11,
      name: "Combustible nuevo",
      image: FLYER,
      legal: "Legal nuevo",
      tab: "rubros",
    });
    const options = cloud.bucketJson["_opciones.json"].opts;
    const replacing = options.find(({ n }) => n === 11);
    if (replacing) replacing.reemplaza = 8;
    setUp(cloud, [company("RUBRO SA", { rubro: { opcion: 8, importe: "30000" } })], {
      opcion_8: true,
      opcion_11: true,
    });
    const app = await openHunter(openApp);

    expect.soft((await app.hunter.rows())[0]?.flyer).toMatch(/Combustible nuevo/);
    await app.hunter.choose("RUBRO SA");
    expect.soft((await app.hunter.waitForPreview()).shown).toBe(true);
    const words = (await app.hunter.drawnTexts()).join(" ");
    expect.soft(words, "the legal of that flyer").toMatch(/Legal\s+nuevo/);
    expect.soft(words, "and its cap").toMatch(/\$30\.000/);
  });

  test("its own cap goes on the flyer, and with none the one of the template", async ({
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
    setUp(
      cloud,
      [
        company("CON TOPE SA", { rubro: { opcion: 8, importe: "41000" } }),
        company("SIN TOPE SA", { rubro: { opcion: 8 } }),
      ],
      { opcion_8: true },
    );
    const app = await openHunter(openApp);

    const rows = await app.hunter.rows();
    expect
      .soft(rows.find(({ company: name }) => name === "SIN TOPE SA")?.warnings)
      .toMatch(/sin tope cargado: sale \$24\.000/);
    await app.hunter.choose("CON TOPE SA");
    await app.hunter.waitForPreview();
    expect.soft((await app.hunter.drawnTexts()).join(" ")).toMatch(/\$41\.000/);
    await app.hunter.choose("SIN TOPE SA");
    await app.hunter.waitForPreview();
    expect.soft((await app.hunter.drawnTexts()).join(" ")).toMatch(/\$24\.000/);
  });

  test("an option with no flyer is never used", async ({ cloud, openApp }) => {
    cloud.addFlyerOption({ option: 12, name: "Sin arte", image: null, legal: "L" });
    setUp(cloud, [company("ACME SA")], { opcion_9: false, opcion_12: true });
    const app = await openHunter(openApp);

    const [row] = await app.hunter.rows();
    expect.soft(row?.canDraw).toBe(false);
    expect.soft(row?.warnings).toMatch(/no hay ning.n flyer habilitado/);
  });

  test("the wheel alone scrolls the preview, with Ctrl it zooms", async ({ cloud, openApp }) => {
    setUp(cloud, [company("ACME SA")]);
    const app = await openHunter(openApp);
    await app.hunter.choose("ACME SA");
    await app.hunter.waitForPreview();

    expect.soft(await app.hunter.wheel(false), "no Ctrl").toBe(100);
    expect.soft(await app.hunter.wheel(true), "with Ctrl").toBeGreaterThan(100);
  });

  test("several companies: the ticked ones stay on top and Ctrl+Enter downloads them", async ({
    cloud,
    openApp,
  }) => {
    setUp(cloud, [company("ACME SA"), company("BETA SA"), company("GAMA SA")]);
    const app = await openHunter(openApp);
    await app.hunter.startMultiple();

    await app.hunter.tick("ACME SA");
    await app.hunter.tick("GAMA SA");
    expect.soft(await app.hunter.ticked()).toEqual(["ACME SA", "GAMA SA"]);

    await app.hunter.search("beta");
    expect
      .soft(await app.hunter.ticked(), "searching does not hide them")
      .toEqual(["ACME SA", "GAMA SA"]);
    await app.hunter.untick("ACME SA");
    expect.soft(await app.hunter.ticked()).toEqual(["GAMA SA"]);

    expect.soft(await app.hunter.downloadTickedWithShortcut()).toMatch(/Flyers_Empresas.*\.zip$/);
  });

  test("proposing officers needs the faculty, and goes through the request, never the list", async ({
    cloud,
    openApp,
  }) => {
    setUp(cloud, [company("ACME SA")], { proponer_oficiales: true });
    const app = await openHunter(openApp);
    const sent: unknown[] = [];
    app.page.on("request", (request) => {
      if (request.url().includes("/rpc/padron_propuesta_crear")) sent.push(request.postDataJSON());
    });
    expect.soft((await app.hunter.rows())[0]?.canPropose).toBe(true);

    await app.hunter.openProposal("ACME SA");
    expect.soft(await app.hunter.proposalTitle()).toMatch(/Proponer un cambio de oficiales/);
    await app.hunter.fillProposalOfficer(1, "Carla Nueva", "11 7777 8888");
    await app.hunter.fillProposalNote("El celular cambió");
    await app.hunter.sendProposal();

    await expect.poll(() => sent.length).toBe(1);
    expect.soft(sent[0], "its owner and its officers").toEqual(
      expect.objectContaining({
        p_empresa: "ACME SA",
        p_dueno: OWNER,
        p_nota: "El celular cambió",
      }),
    );
    expect.soft(JSON.stringify(sent[0])).toContain("Carla Nueva");
    await expect.poll(() => app.hunter.proposalWindowOpen()).toBe(false);
    expect.soft(cloud.companyReplaceCalls, "never the whole list").toBe(0);
  });

  test("without that faculty there is no button and no menu item", async ({ cloud, openApp }) => {
    setUp(cloud, [company("ACME SA")], { proponer_oficiales: false });
    const app = await openHunter(openApp);

    expect.soft((await app.hunter.rows())[0]?.canPropose).toBe(false);
    expect.soft((await app.session.userMenuItems()).join(" ")).not.toMatch(/Mis propuestas/);
  });
});

test.describe("the answer of the Hunter to a question about a proposal", { tag: "@react" }, () => {
  const QUESTION_ID = "p9";
  const BEFORE = [OFFICER];
  const PROPOSED = [{ nombre: "Carla Nueva", celular: "11 7777 8888", email: "" }];

  function withQuestion(cloud: Cloud): void {
    setUp(cloud, [company("ACME SA")], { proponer_oficiales: true });
    cloud.companyProposals = [
      {
        id: QUESTION_ID,
        empresa: "ACME SA",
        empresa_key: "acme sa",
        dueno_id: OWNER,
        creada_por: HUNTER.id,
        estado: "consulta",
        asesores_antes: BEFORE,
        asesores: PROPOSED,
        created_at: "2026-10-20T10:00:00Z",
      },
    ];
    cloud.proposalMessages = [
      {
        id: "m0",
        propuesta_id: QUESTION_ID,
        rol: "oficial",
        tipo: "consulta",
        autor_nombre: "Olga Oficial",
        texto: "¿Confirmaste el celular?",
        created_at: "2026-10-21T10:00:00Z",
      },
    ];
  }

  test("the list warns, Mis propuestas shows the question and it is answered from there", async ({
    cloud,
    openApp,
  }) => {
    withQuestion(cloud);
    const { hunter, flyerEditor } = await openHunter(openApp);
    expect.soft((await hunter.rows())[0]?.proposalTag).toMatch(/te hizo una consulta/);
    expect.soft((await hunter.rows())[0]?.canPropose, "no second proposal meanwhile").toBe(false);

    await hunter.openMyProposals();
    const [card] = await hunter.myProposals();
    expect.soft(card?.text).toMatch(/¿Confirmaste el celular\?/);
    expect.soft(card?.buttons).toContain("Responder");

    await hunter.pressAnswer("ACME SA");
    expect.soft(await hunter.proposalTitle()).toMatch(/Responder la consulta/);
    expect.soft(await hunter.proposalWindowText(), "with the question").toMatch(/Confirmaste/);
    expect.soft(await hunter.proposalOfficerName(1), "with what was proposed").toBe("Carla Nueva");

    await hunter.fillProposalOfficer(1, "Carla Corregida", "11 7777 9999");
    await hunter.fillProposalNote("Sí, lo confirmé con el cliente");
    await hunter.sendProposal();

    await expect.poll(() => cloud.proposalAnswers.length).toBe(1);
    const [answer] = cloud.proposalAnswers;
    expect.soft(answer?.p_id).toBe(QUESTION_ID);
    expect.soft(answer?.p_texto).toBe("Sí, lo confirmé con el cliente");
    expect.soft(answer?.p_asesores, "the four places go").toEqual([
      {
        nombre: "Carla Corregida",
        celular: "11 7777 9999",
        email: "carla.corregida@bancogalicia.com.ar",
      },
      { nombre: "", celular: "", email: "" },
      { nombre: "", celular: "", email: "" },
      { nombre: "", celular: "", email: "" },
    ]);
    await expect
      .poll(() => flyerEditor.latestNotice())
      .toMatch(/vuelve a quedar pendiente de aprobaci.n/);
    expect.soft(await hunter.proposalWindowOpen(), "the window closes").toBe(false);
    await expect
      .poll(async () => (await hunter.rows())[0]?.proposalTag, "the list follows")
      .toMatch(/pendiente de aprobaci.n/);
    await hunter.openMyProposals();
    const [after] = await hunter.myProposals();
    expect.soft(after?.text, "with the answer in the conversation").toMatch(/lo confirmé/);
    expect.soft(after?.buttons, "nothing left to answer").not.toContain("Responder");
  });

  test("a text alone is enough, and with nothing written it cannot be sent", async ({
    cloud,
    openApp,
  }) => {
    withQuestion(cloud);
    const [question] = cloud.companyProposals ?? [];
    if (question) question.asesores = BEFORE;
    const { hunter } = await openHunter(openApp);
    await hunter.openMyProposals();
    await hunter.pressAnswer("ACME SA");
    expect.soft(await hunter.canSendProposal(), "same officers, no text").toBe(false);

    await hunter.fillProposalNote("Lo reviso y te aviso");
    expect.soft(await hunter.canSendProposal(), "a text alone").toBe(true);

    await hunter.fillProposalNote("   ");
    expect.soft(await hunter.canSendProposal(), "blanks are nothing").toBe(false);
  });

  test("what cannot be sent says so, keeps the window and can be sent again", async ({
    cloud,
    openApp,
  }) => {
    withQuestion(cloud);
    cloud.proposalAnswerFails = true;
    const { hunter, flyerEditor } = await openHunter(openApp);
    await hunter.openMyProposals();
    await hunter.pressAnswer("ACME SA");
    await hunter.fillProposalNote("Sí");

    await hunter.sendProposal();

    await expect
      .poll(() => flyerEditor.latestNotice())
      .toMatch(/No se pudo enviar: falla simulada/);
    expect.soft(await hunter.proposalWindowOpen()).toBe(true);
    expect.soft(await hunter.canSendProposal()).toBe(true);
    cloud.proposalAnswerFails = false;
    await hunter.sendProposal();
    await expect.poll(() => cloud.proposalAnswers.length).toBe(1);
  });
});

test.describe("the officer who owns the company", () => {
  const PROPOSAL = {
    id: "p1",
    empresa: "ACME SA",
    empresa_key: "acme sa",
    dueno_id: "00000000-0000-4000-8000-000000000001",
    estado: "pendiente",
    origen: "hunter",
    creada_por: HUNTER.id,
    creada_por_nombre: HUNTER.name,
    created_at: "2026-10-20T10:00:00Z",
    asesores: [{ nombre: "Carla Nueva", celular: "11 7", email: "" }],
    asesores_antes: [OFFICER],
  };
  const answers = [
    ["Aprobar", "padron_propuesta_aprobar", /Cambio aplicado/],
    ["Rechazar", "padron_propuesta_rechazar", /rechazada/],
    ["Repreguntar", "padron_propuesta_consultar", /Consulta enviada/],
  ] as const;
  for (const [button, rpc, notice] of answers) {
    test(
      `${button} goes through its request and does not rewrite the list`,
      { tag: "@react" },
      async ({ cloud, openApp }) => {
        cloud.companies = [company("ACME SA", { user_id: PROPOSAL.dueno_id })];
        cloud.companyProposals = [PROPOSAL];
        cloud.setPermissions("asesor", { padron_buscar: true });
        const app = await openApp();
        const calls: string[] = [];
        app.page.on("request", (request) => {
          if (request.url().includes("/rpc/")) calls.push(new URL(request.url()).pathname);
        });

        const cards = await app.companyRegistry.pendingProposals();
        expect.soft(cards[0]?.canAskBack, "a hunter can be asked back").toBe(true);
        expect.soft(cards[0]?.text).toMatch(/Propuesto por Hunter Prueba/);
        await app.companyRegistry.answerProposal(button, "Una aclaración");

        await expect.poll(() => calls.some((call) => call.endsWith(rpc))).toBe(true);
        await expect.poll(() => app.flyerEditor.latestNotice()).toMatch(notice);
        expect.soft(cloud.companyReplaceCalls).toBe(0);
      },
    );
  }
});
