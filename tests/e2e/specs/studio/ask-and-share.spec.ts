// Replaces pruebas/t86_estudio_preguntar_compartir.cjs.
import { activeFile, addDesign, designData, textChange } from "../../support/cloud/designs.ts";
import { type Cloud } from "../../support/cloud/index.ts";
import { activeFlyerNine } from "../../support/cloud/seed-data.ts";
import { type OpenedApp } from "../../support/open-app.ts";
import { settled } from "../../support/settled.ts";
import { expect, test } from "../../support/test.ts";

const TEXT_PLACE = { x: 730, y: 1395 };
const DESIGN_NAME = "Combustible con días";
const QUESTION = "¿Los días son los de la promo del 25%?";
const WAITING = "Esperando respuesta";
const ASKED = "Te hicieron una pregunta";
const REQUESTED = "Pedido enviado";
const MVP = 2;
const FUEL = 9;

async function allMessages(app: OpenedApp): Promise<number> {
  return (await app.studio.cards()).reduce((total, { messages }) => total + messages, 0);
}

async function allButtons(app: OpenedApp): Promise<string[]> {
  return (await app.studio.cards()).flatMap(({ buttons }) => buttons);
}

function everyoneActive(cloud: Cloud): void {
  cloud.profiles = Object.values(cloud.users).map((user) => ({
    id: user.id,
    full_name: user.name,
    email: user.email,
    role: user.role,
    status: "active",
  }));
}

test(
  "the administrator asks before approving and shares a copy of a design",
  { tag: "@react" },
  async ({ cloud, openApp }) => {
    const firstDesign = () => cloud.designs[0];
    const sharedCopy = () => cloud.designs.find((row) => row.user_id === cloud.users.asesor2?.id);

    // 1) The advisor saves a design with a text and asks to publish it
    const advisor = await openApp({ user: "asesor" });
    await test.step("the advisor saves a design and asks to publish it", async () => {
      await advisor.flyerEditor.setZoom(1.6);
      await advisor.logoEditor.enter();
      await advisor.logoEditor.writeText(TEXT_PLACE, "Lunes y jueves");
      await advisor.studio.save({ name: DESIGN_NAME });
      await advisor.studio.open();
      await advisor.studio.requestPublication();
      expect.soft(firstDesign()?.estado, "the request is sent").toBe("pedido");
    });

    // 2) The administrator asks
    const admin = await openApp({ user: "admin" });
    await test.step("the administrator asks", async () => {
      await admin.studio.open();
      await admin.studio.showFilter("requests");
      const requestButtons = await allButtons(admin);
      expect.soft(requestButtons, "the request offers Aprobar").toContain("Aprobar y publicar");
      expect.soft(requestButtons, "Preguntar").toContain("Preguntar");
      expect.soft(requestButtons, "and No aprobar").toContain("No aprobar");

      await admin.studio.ask(QUESTION);
      const design = firstDesign();
      await admin.studio.waitForStatus(WAITING);
      await admin.studio.waitForConversation(1);
      expect.soft(design?.estado, "it stays as a question").toBe("consulta");
      expect.soft(cloud.designMessages, "with 1 message").toHaveLength(1);
      const asked = (await admin.studio.cards())[0];
      expect.soft(asked?.status, 'the administrator sees "Esperando respuesta"').toContain(WAITING);
      expect.soft(asked?.conversation, "and the question on the card").toContain("25%");
      expect.soft(asked?.buttons, "they can ask again").toContain("Otra pregunta");
      expect.soft(asked?.buttons, "or approve anyway").toContain("Aprobar y publicar");
      expect.soft(await admin.studio.cards(), 'it stays in "Pedidos"').toHaveLength(1);
    });

    // 3) The author finds out and answers
    const author = await openApp({ user: "asesor" });
    await test.step("the author finds out and answers", async () => {
      await author.studio.waitForOpenQuestions(1);
      expect
        .soft(await author.studio.openQuestions(), "on entering they know of 1 question")
        .toBe(1);
      expect.soft(await author.studio.tabBadge(), "a 1 on the Estudio tab").toBe("1");
      const header = await author.studio.headerMessages();
      expect.soft(header.visible, "a number on the envelope of the header").toBe(true);
      expect.soft(header.explanation, "with its explanation").toMatch(/pregunta sobre un diseño/);
      await expect
        .soft(
          author.page.getByText(/te hizo una pregunta sobre/).first(),
          'the sign "te hizo una pregunta"',
        )
        .toBeAttached();

      await author.studio.open();
      await author.studio.waitForConversation(1);
      const toAnswer = (await author.studio.cards())[0];
      expect.soft(toAnswer?.status, 'the author sees "Te hicieron una pregunta"').toContain(ASKED);
      expect.soft(toAnswer?.buttons, "it offers Responder").toContain("Responder");
      expect.soft(toAnswer?.buttons, "and Cancelar pedido").toContain("Cancelar pedido");
      expect.soft(toAnswer?.buttons, "not asking again").not.toContain("Pedir que se publique");

      await author.studio.answer("Sí, son los del 25%.");
      await author.studio.waitForConversation(2);
      expect.soft(firstDesign()?.estado, 'it goes back to "pedido"').toBe("pedido");
      expect.soft(cloud.designMessages, "with 2 messages").toHaveLength(2);
      expect.soft(await allMessages(author), "the author sees both").toBe(2);
      expect.soft(await author.studio.openQuestions(), "no question is open").toBe(0);
      expect.soft(await author.studio.tabBadge(), "and the number is gone").toBe("");
    });

    // 4) The administrator sees the answer, asks again and rejects
    const secondAdmin = await openApp({ user: "admin" });
    await test.step("the administrator sees the answer and asks again", async () => {
      await secondAdmin.studio.open();
      await secondAdmin.studio.waitForConversation(2);
      const answered = (await secondAdmin.studio.cards())[0];
      expect.soft(await allMessages(secondAdmin), "the administrator sees the answer").toBe(2);
      expect.soft(answered?.conversation, "with what it says").toMatch(/son los del 25/);

      await secondAdmin.studio.ask("¿Y el logo de abajo?");
      await secondAdmin.studio.waitForConversation(3);
      expect.soft(firstDesign()?.estado, "third round: a question again").toBe("consulta");
      expect.soft(cloud.designMessages, "with 3 messages").toHaveLength(3);
    });

    await test.step("the refresh brings the question and the answer to open cards", async () => {
      // The author had Estudio open: the refresh brings the question to the card, not only the number
      await author.studio.refreshNow();
      await author.studio.waitForConversation(3);
      const refreshed = (await author.studio.cards())[0];
      expect.soft(refreshed?.buttons, "the refresh offers Responder").toContain("Responder");
      expect.soft(await allMessages(author), "and shows the new question").toBe(3);

      // And the administrator with Estudio open gets the answer without coming back
      await author.studio.answer("Lo corrijo.");
      await author.studio.waitForStatus(REQUESTED);
      await secondAdmin.studio.refreshNow();
      await secondAdmin.studio.waitForConversation(4);
      expect.soft(await allMessages(secondAdmin), "the answer reaches the open card").toBe(4);
    });

    await test.step("the administrator rejects it during a question", async () => {
      cloud.adminCalls.length = 0;
      const design = firstDesign();
      await secondAdmin.studio.reject("Falta corregir el logo");
      expect.soft(design?.estado, "No aprobar works during a question").toBe("rechazado");
      expect.soft(design?.nota_admin, "with its note").toBe("Falta corregir el logo");
      expect.soft(await allMessages(secondAdmin), "the conversation goes away").toBe(0);
      await settled(() => cloud.adminCalls.length > 0);
      expect
        .soft(
          cloud.adminCalls.some(
            (call) =>
              call.action === "notify_estudio" && call.que === "resuelto" && call.id === design?.id,
          ),
          "No aprobar mails the author",
        )
        .toBe(true);
    });

    await test.step("the administrator shares it with a person", async () => {
      // 5) Sharing with a person
      everyoneActive(cloud);
      await secondAdmin.studio.showFilter("all");
      await secondAdmin.studio.openShareDialog();
      const people = (await secondAdmin.studio.shareDialog()).people;
      expect.soft(people, "the list leaves out the administrator and the author").toHaveLength(1);
      expect.soft(people[0], "and has the other person").toMatch(/Otra Persona/);
      expect
        .soft(
          (await secondAdmin.studio.shareDialog()).confirmEnabled,
          "with nobody chosen it is off",
        )
        .toBe(false);
      await secondAdmin.studio.searchPeopleToShare("zzz");
      expect
        .soft((await secondAdmin.studio.shareDialog()).text, "the search box filters")
        .toMatch(/Nadie con ese nombre/);
      await secondAdmin.studio.searchPeopleToShare("otra");
      await secondAdmin.studio.tickFirstPersonToShare();
      const design = firstDesign();
      expect
        .soft(
          (await secondAdmin.studio.shareDialog()).confirmLabel,
          'it says "Compartir con 1 persona"',
        )
        .toMatch(/con 1 persona/);
      cloud.adminCalls.length = 0;
      await secondAdmin.studio.confirmShare();
      await settled(() => cloud.adminCalls.length > 0);
      expect
        .soft(
          cloud.adminCalls.some(
            (call) =>
              call.action === "notify_estudio" &&
              call.que === "compartido" &&
              call.id === design?.id,
          ),
          "Compartir mails whoever receives it",
        )
        .toBe(true);
      const copy = sharedCopy();
      expect
        .soft(copy?.compartido_por, "the person gets a copy from the administrator")
        .toBe("Admin Prueba");
      expect.soft(copy?.compartido_de, "of that design").toBe(design?.id);
      expect.soft(copy?.estado, "private").toBe("privado");
      expect.soft(designData(copy).cambios, "with the change").toHaveLength(1);
      await settled(async () => (await secondAdmin.studio.listedDesigns()).length === 2);
    });

    await test.step("sharing again sends the new version", async () => {
      // Sharing again sends the new version, not a second copy
      await secondAdmin.studio.openShareDialog({ onlyOriginalDesign: true });
      expect
        .soft((await secondAdmin.studio.shareDialog()).text, "it warns they already have a copy")
        .toMatch(/ya tiene una copia/);
      await secondAdmin.studio.tickFirstPersonToShare();
      await secondAdmin.studio.confirmShare();
      expect
        .soft(
          cloud.designs.filter((row) => row.user_id === cloud.users.asesor2?.id),
          "sharing again does not duplicate",
        )
        .toHaveLength(1);
    });

    // 6) Whoever receives it, without the Estudio faculty
    cloud.setPermissions("asesor", { estudio: false });
    const receiver = await openApp({ user: "asesor2" });
    await test.step("whoever receives it has no Estudio faculty", async () => {
      await receiver.studio.waitForSharedWithMe(1);
      expect
        .soft(await receiver.studio.isTabVisible(), "they see Estudio because of the copy")
        .toBe(true);
      await expect
        .soft(
          receiver.page.getByText(`te compartió «${DESIGN_NAME}»`).first(),
          'the sign "Admin Prueba te compartió"',
        )
        .toBeAttached();
      await receiver.studio.open();
      await receiver.studio.waitForCards();
      const shared = (await receiver.studio.cards())[0];
      expect
        .soft(shared?.sharedNote, "the card tells who shared it")
        .toMatch(/Te lo compartió Admin Prueba/);
      expect.soft(shared?.buttons, "they can use it").toContain("Usar");
      expect
        .soft(shared?.buttons, "but not ask to publish it")
        .not.toContain("Pedir que se publique");
      expect.soft(shared?.buttons, "nor share it").not.toContain("Compartir");
      expect
        .soft(await receiver.studio.savedBrandsSectionShown(), "no Marcas guardadas section")
        .toBe(false);
      expect
        .soft(await receiver.studio.intro(), "the text explains they are shared")
        .toMatch(/te comparti/);
      await receiver.studio.use();
      expect
        .soft(await receiver.logoEditor.changes(), '"Usar" opens it in the editor')
        .toHaveLength(1);
      expect
        .soft((await receiver.studio.saveButton()).visible, 'no faculty, no "Guardar en Estudio"')
        .toBe(false);
    });

    // Nothing shared and no faculty: no tab
    const noAccess = await openApp({ user: "asesor" });
    await test.step("with nothing shared and no faculty there is no tab", async () => {
      await noAccess.page.waitForTimeout(800);
      expect
        .soft(await noAccess.studio.isTabVisible(), "no faculty and nothing shared: no tab")
        .toBe(false);
    });

    // 6b) Their profile does not have the base flyer of the design (it happened with a VIP)
    cloud.bucketJson["_opciones.json"] = {
      opts: [
        { n: FUEL, nombre: "Combustible", solapa: "flyer" },
        { n: MVP, nombre: "MVP", solapa: "flyer" },
      ],
    };
    const nine = activeFile(cloud, FUEL) ?? activeFlyerNine();
    cloud.bucketJson["_active2.json"] = {
      ...nine,
      imageUrl: nine.imageUrl?.replace("flyer_t9", "flyer_t2"),
    };
    cloud.bucketJson["_legal2.json"] = { text: "Legal MVP" };
    cloud.setPermissions("asesor", { opcion_2: false, estudio: true });
    const copy = sharedCopy();
    if (copy) copy.opcion = MVP;

    const vip = await openApp({ user: "asesor2", startOption: FUEL });
    await test.step("their profile does not have the base flyer of the design", async () => {
      expect.soft(await vip.studio.profileHasOption(MVP), "their profile lacks MVP").toBe(false);
      await vip.studio.open();
      await vip.studio.waitForCards();
      await vip.studio.use();
      expect.soft(await vip.flyerEditor.currentOption(), '"Usar" opens it on MVP anyway').toBe(MVP);
      expect.soft(await vip.logoEditor.changes(), "with its change").toHaveLength(1);
      const tabs = await vip.flyerSections.tabs();
      expect
        .soft(
          tabs.some(({ option }) => option === MVP),
          "MVP is not in the bar",
        )
        .toBe(false);
      expect
        .soft(
          tabs.some(({ isFlyer }) => !isFlyer),
          'the design is, under "Abiertos"',
        )
        .toBe(true);
      await vip.flyerEditor.fillCompanyName("Prueba SA");
      expect.soft(await vip.flyerSections.downloadPdf(), "the PDF comes down").toHaveLength(1);
      await vip.flyerSections.closeOpenTab(0);
      await settled(async () => (await vip.flyerEditor.currentOption()) !== MVP);
      expect
        .soft(await vip.flyerEditor.currentOption(), "closing goes back to their flyer")
        .not.toBe(MVP);
      expect.soft(await vip.studio.canUseOption(MVP), "and MVP stops being available").toBe(false);
    });

    for (const app of [advisor, admin, author, secondAdmin, receiver, noAccess, vip]) {
      expect.soft(app.pageErrors(), "no JavaScript errors").toEqual([]);
    }
  },
);

test(
  "sharing again does not step on a copy whose publication was requested",
  { tag: "@react" },
  async ({ cloud, openApp }) => {
    everyoneActive(cloud);
    const original = addDesign(cloud, {
      id: "d900-0000-4000-8000-000000000000",
      nombre: DESIGN_NAME,
      datos: { v: 1, cambios: [textChange("Nuevo")], subidos: {} },
    });
    const copy = addDesign(cloud, {
      id: "d901-0000-4000-8000-000000000000",
      nombre: "Copia pedida",
      user_id: cloud.users.asesor2?.id ?? "",
      estado: "pedido",
      compartido_de: original.id,
      compartido_por: "Admin Prueba",
      datos: { v: 1, cambios: [textChange("Viejo")], subidos: {} },
    });
    const admin = await openApp({ user: "admin" });
    await admin.studio.open();
    await admin.studio.showFilter("all");
    await admin.studio.openShareDialog({ onlyOriginalDesign: true });
    await admin.studio.tickFirstPersonToShare();
    await admin.studio.confirmShare();
    await expect
      .soft(admin.page.getByText(/No se compartió con .*ya lo tiene y pidió publicarlo/).first())
      .toBeAttached();
    expect.soft(copy.estado, "the copy stays requested").toBe("pedido");
    expect.soft(copy.nombre, "with what it had").toBe("Copia pedida");
    expect.soft(designData(copy).cambios[0]?.["texto"], "its content too").toBe("Viejo");
    expect.soft(admin.pageErrors(), "no JavaScript errors").toEqual([]);
  },
);

test("Config → Flyer lists options with no flyer last and says how to remove them", async ({
  cloud,
  openApp,
}) => {
  cloud.bucketJson["_opciones.json"] = {
    opts: [
      { n: 3, nombre: "VIEJO Algo", solapa: "flyer" },
      { n: FUEL, nombre: "Combustible", solapa: "flyer" },
    ],
  };
  const admin = await openApp({ user: "admin" });

  const list = await admin.studio.flyerListOfConfig();

  // Option 1 always exists, with no flyer in the simulated cloud: they are 2.
  expect.soft(list, "it counts the options with no flyer").toMatch(/Sin flyer activo \(2\)/);
  expect.soft(list, "and explains how to remove them").toMatch(/Config → Opciones → Quitar/);
  expect
    .soft(list.indexOf("Combustible"), "the one with a flyer goes first, the old one last")
    .toBeLessThan(list.indexOf("VIEJO Algo"));
  expect.soft(admin.pageErrors(), "no JavaScript errors").toEqual([]);
});
