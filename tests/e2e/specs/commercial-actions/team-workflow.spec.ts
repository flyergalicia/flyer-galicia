// Replaces pruebas/t93_gestiones_v2.cjs: three people at once on the same cloud, the way an
// action goes around the team. Each step finds what the one before it left.
import { dayFromToday, PEOPLE, today } from "../../support/cloud/commercial-actions/model.ts";
import { type Cloud } from "../../support/cloud/index.ts";
import { commercialTables, openAsTeamMember } from "../../support/commercial-team.ts";
import { type CommercialActionsDriver } from "../../support/driver/commercial-actions.ts";
import { expect, test } from "../../support/test.ts";

const WAITING_MS = 15_000;

type Seeded = ReturnType<Cloud["seedCommercialActions"]>;
type OpenApp = Parameters<typeof openAsTeamMember>[0];

/** From the officer to the hunter: what does not need the agenda nor the dashboard. */
async function fromTheOfficerToTheHunter(
  cloud: Cloud,
  openApp: OpenApp,
  seeded: Seeded,
): Promise<{ readonly officer: CommercialActionsDriver }> {
  const tables = commercialTables(cloud);
  const actionById = (id: string) => tables.actions.find((action) => action.id === id);
  const { forwardedWithQuestion, doneWithSignups } = seeded;
  const { commercialActions: officer } = await openAsTeamMember(openApp, "officer");

  await test.step("the officer reads the question of the hunter and answers", async () => {
    await officer.openAction(forwardedWithQuestion.id);
    expect
      .soft(await officer.waitForScreenText(/flyer de combustible/), "the conversation has it")
      .toMatch(/flyer de combustible/);
    expect.soft(await officer.waitForActionToBeRead(), "opening it leaves it read").toBe(true);

    await officer.sendMessage("Llevá el de combustible, tienen 40 camiones.");
    const screen = await officer.waitForScreenText(/40 camiones/);
    expect.soft(screen, "the officer's answer shows").toMatch(/40 camiones/);
    expect
      .soft(
        tables.messages.some(
          ({ autor, texto }) => autor === PEOPLE.officer.id && /camiones/.test(texto),
        ),
        "the message is saved",
      )
      .toBe(true);
    expect.soft(screen, "the action has a history").toMatch(/Historial/);
    expect.soft(screen, "that tells who forwarded it to whom").toMatch(/se la deriv/);
  });

  await test.step("the officer leaves another action to the leader", async () => {
    await officer.goToTab("companies");
    await officer.startForwarding("METALURGICA NORTE SA");
    await officer.leaveToLeader();
    await officer.setDate(dayFromToday(5));
    await officer.confirmForwarding();
    await officer.waitForDialogToClose();
  });

  const { commercialActions: hunter } = await openAsTeamMember(openApp, "hunter");

  await test.step("the hunter gets the answer and says they cannot attend", async () => {
    expect
      .soft(await hunter.actionsWithUnreadMessages(), "the officer's message arrives as news")
      .not.toEqual([]);

    await hunter.openAction(forwardedWithQuestion.id);
    expect
      .soft(await hunter.waitForScreenText(/40 camiones/), "they see the answer")
      .toMatch(/40 camiones/);
    const commands = (await hunter.actionCommands()).join();
    expect
      .soft(commands, "the hunter cannot change the hunter")
      .not.toMatch(/Cambiar hunter|Asignar a un hunter/);
    expect.soft(commands, "but can say they cannot attend").toMatch(/No puedo ir/);

    await hunter.reportCannotAttend("Me superpone con una capacitación");
    expect
      .soft(await hunter.waitForScreenText(/Avisaste que no podés/), "it stays on their agenda")
      .toMatch(/Avisaste que no podés/);
    expect
      .soft(actionById(forwardedWithQuestion.id)?.no_puede_at, "the notice is saved")
      .toBeTruthy();
    expect
      .soft(
        tables.messages.some(({ tipo, texto }) => tipo === "no_puedo" && /capacitaci/.test(texto)),
        "and arrives as a message",
      )
      .toBe(true);

    await hunter.updateActionBehindTheScreen(forwardedWithQuestion.id, {
      hunter_id: PEOPLE.hunter3.id,
    });
    expect
      .soft(
        actionById(forwardedWithQuestion.id)?.hunter_id,
        "the database does not let the hunter pass it to another",
      )
      .toBe(PEOPLE.hunter.id);
  });

  await test.step("the hunter registers a signup and a discard", async () => {
    await hunter.openAction(doneWithSignups.id);
    await hunter.waitForScreenText(/Walter Ibáñez/);

    await hunter.movePerson("Walter Ibáñez", "signup");
    const askPackage = await hunter.waitForDialogText(/Con qué paquete fue el alta/);
    expect.soft(askPackage, "a signup asks for its package").toMatch(/Con qué paquete fue el alta/);
    expect
      .soft(askPackage, 'it offers "Sin paquete (Caja de Ahorro)"')
      .toMatch(/Sin paquete \(Caja de Ahorro\)/);
    expect.soft(askPackage, "and the packages").toMatch(/Eminent Black/);

    await hunter.chooseInDialog("Sin paquete (Caja de Ahorro)");
    const afterSignup = await hunter.waitForPeople((people) =>
      people.some(({ name, status }) => name === "Walter Ibáñez" && status === "alta"),
    );
    expect
      .soft(
        afterSignup.find(({ name }) => name === "Walter Ibáñez"),
        "the signup stays with no package",
      )
      .toMatchObject({ status: "alta", package: "caja" });

    await hunter.movePerson("Ximena Toledo", "signup");
    await hunter.waitForDialogText(/Con qué paquete fue el alta/);
    await hunter.dismissDialog();
    await hunter.waitForDialogToClose();
    await hunter.waitForScreenToSettle();
    expect
      .soft(
        tables.prospects.find(({ nombre }) => nombre === "Ximena Toledo")?.estado,
        "cancelling leaves the prospect as it was",
      )
      .toBe("prospecto");

    await hunter.movePerson("Ximena Toledo", "discarded");
    expect
      .soft(await hunter.waitForDialogText(/Por qué se descarta/), "a discard asks why")
      .toMatch(/Por qué se descarta/);
    await hunter.chooseInDialog("No contesta");
    const afterDiscard = await hunter.waitForPeople((people) =>
      people.some(({ name, reason }) => name === "Ximena Toledo" && reason !== null),
    );
    expect
      .soft(
        afterDiscard.find(({ name }) => name === "Ximena Toledo")?.reason,
        'it stays discarded for "No contesta"',
      )
      .toBe("no_contesta");

    const valeria = afterDiscard.find(({ name }) => name === "Valeria Quiroga");
    const refusal = await hunter.updatePersonBehindTheScreen(valeria?.id ?? "", {
      estado: "alta",
      paquete: null,
    });
    expect.soft(refusal, "the database does not take a signup with no package").toMatch(/GES_PAQ/);
    expect
      .soft(
        await hunter.waitForScreenText(/marcó el alta de Walter/),
        "the history writes down the signup",
      )
      .toMatch(/marcó el alta de Walter/);
  });
  return { officer };
}

test("an action goes from the officer to the hunter, with its conversation and its people", async ({
  cloud,
  openApp,
}) => {
  await fromTheOfficerToTheHunter(cloud, openApp, cloud.seedCommercialActions());
});

test("an action goes from the officer to the hunter and the leader, and reaches the numbers", async ({
  cloud,
  openApp,
}) => {
  const seeded = cloud.seedCommercialActions();
  const tables = commercialTables(cloud);
  const actionById = (id: string) => tables.actions.find((action) => action.id === id);
  const { forwardedWithQuestion, cannotAttend } = seeded;
  const { officer } = await fromTheOfficerToTheHunter(cloud, openApp, seeded);

  const leaderApp = await openAsTeamMember(openApp, "leader");
  const { commercialActions: leader, page: leaderPage } = leaderApp;

  await test.step("the leader sees the trays and assigns", async () => {
    await expect
      .soft(
        leaderPage.getByRole("tab", { name: "Agenda del equipo", selected: true }),
        "the leader enters on the agenda of the team",
      )
      .toBeVisible({ timeout: WAITING_MS });
    const trays = await leader.waitForScreenText(/Por asignar \(2\)/);
    expect.soft(trays, 'they see "Por asignar (2)"').toMatch(/Por asignar \(2\)/);
    expect
      .soft(trays, 'and "Piden que se la pasen a otro (2)"')
      .toMatch(/Piden que se la pasen a otro \(2\)/);
    expect.soft(trays, "with the reason").toMatch(/capacitaci/);

    await leader.openFromTray("unassigned", "LOGISTICA ANDINA SRL");
    expect
      .soft(await leader.dialogText(), 'the tray opens "Asignar a un hunter"')
      .toMatch(/Asignar a un hunter/);
    const choices = (await leader.hunterChoices()).join();
    for (const name of ["Julia Sosa", "Tomás Ríos", "Sofía Paz"]) {
      expect.soft(choices, `they choose among the team: ${name}`).toContain(name);
    }

    await leader.chooseHunter("Julia Sosa");
    await leader.confirmAssignment();
    await leader.waitForDialogToClose();
    const fair = tables.actions.find(({ empresa }) => empresa.includes("LOGISTICA"));
    expect.soft(fair?.hunter_id, "it stays assigned to Julia").toBe(PEOPLE.hunter3.id);
  });

  await test.step("the leader passes on what Tomás cannot attend", async () => {
    await leader.goToTab("agenda");
    await leader.openFromTray("reassign-requests", "METALURGICA NORTE SA");
    await leader.chooseHunter("Sofía Paz");
    await leader.confirmAssignment();
    await leader.waitForDialogToClose();

    const passed = actionById(cannotAttend.id);
    expect.soft(passed?.hunter_id, "the leader passes it to Sofía").toBe(PEOPLE.hunter.id);
    expect.soft(passed?.no_puede_at, 'the "no puedo" goes away').toBeFalsy();
    expect.soft(passed?.visto_hunter, "and Sofía gets it as new").toBe(false);
    expect
      .soft(
        tables.events.some(
          ({ gestion_id: action, que, quien, detalle }) =>
            action === cannotAttend.id &&
            que === "hunter" &&
            quien === PEOPLE.leader.id &&
            detalle.de === PEOPLE.hunter2.id &&
            detalle.a === PEOPLE.hunter.id,
        ),
        "the history says from whom to whom and who passed it",
      )
      .toBe(true);

    const overlapError = await leader.updateActionBehindTheScreen(forwardedWithQuestion.id, {
      hora_desde: "15:30",
      hora_hasta: "16:30",
      fecha: today(),
    });
    expect.soft(overlapError, "the leader can save over an overlap: it is their call").toBeNull();
  });

  await test.step("the dashboard of the officer counts all of it", async () => {
    await officer.goToTab("dashboard");
    await officer.choosePeriod("Todo");
    const board = await officer.waitForScreenText(/Con paquete:/);
    expect.soft(board, "it tells signups with a package").toMatch(/Con paquete:/);
    expect.soft(board, "and counts those without").toMatch(/Sin paquete: 2/);
    expect.soft(board, "it shows why they are discarded").toMatch(/Por qué se descartan/);
    expect.soft(board, "with the reasons").toMatch(/No contesta/);
    expect.soft(board, "and how many of the data lists were contacted").toMatch(/Bases de datos:/);

    const unassigned = tables.actions.filter(
      ({ estado, tipo, hunter_id: assignee, dueno_id: owner, creada_por: creator }) =>
        estado === "planificada" &&
        tipo !== "datos" &&
        !assignee &&
        (owner === PEOPLE.officer.id || creator === PEOPLE.officer.id),
    );
    const figures = await officer.dashboardFigures();
    expect.soft(unassigned.length, "there is something nobody assigned").toBeGreaterThan(0);
    expect.soft(figures.unassigned, "it counts it apart").toBe(unassigned.length);
    expect.soft(board, "and warns about it").toMatch(/sin asignar/);
    expect.soft(board, "saying it does not enter the numbers").toMatch(/No cuenta en los n/);
    expect
      .soft(
        figures.hunterIds.filter((id) => !id),
        "no row of hunters stays with no owner",
      )
      .toEqual([]);
    expect.soft(await officer.screenMarkup(), "no NaN or undefined").not.toMatch(/NaN|undefined/);
    expect.soft(board, "it explains it only counts the period").toMatch(/El tablero cuenta/);
    expect.soft(board, "and actions with a hunter").toMatch(/se ve todo, sin per/);
  });

  await test.step("choosing an officer does not shrink the field that chooses them", async () => {
    await leader.goToTab("dashboard");
    await leader.dashboardFigures();
    const officers = await leader.officerChoices();
    expect.soft(officers.length, "the leader sees the two officers").toBeGreaterThanOrEqual(2);

    await leader.chooseOfficer(PEOPLE.officer.name);

    expect
      .soft(await leader.officerChoices(), '"Oficial Payroll" keeps bringing everybody')
      .toEqual(officers);
    const counted = (await leader.dashboardFigures()).countedOfficerIds;
    expect
      .soft(
        counted.filter((id) => id !== PEOPLE.officer.id),
        "and what it counts does respect the filter",
      )
      .toEqual([]);
  });
});
