// Replaces pruebas/t93_gestiones_v2.cjs: the agenda of each person and how to look at it.
import { openAsTeamMember } from "../../support/commercial-team.ts";
import { expect, test } from "../../support/test.ts";

const MONTH_LABEL =
  /^(?:Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre) \d{4}$/;
const WEEKDAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const FREE_SPOT_HOURS_BELOW_TOP = 2;

test("the officer sees the agenda of hunters, with what is not theirs masked", async ({
  cloud,
  openApp,
}) => {
  const { forwardedWithQuestion } = cloud.seedCommercialActions();
  const { commercialActions: actions } = await openAsTeamMember(openApp, "officer");

  await actions.goToTab("agenda");
  await actions.chooseAgendaView("Semana");
  expect
    .soft(await actions.waitForAgendaLayout("hours"), "the agenda goes by hours and days")
    .toBe(true);
  const week = await actions.screenText();
  for (const hunter of ["Sofía Paz", "Tomás Ríos", "Julia Sosa"]) {
    expect.soft(week, `above, it chooses among all hunters: ${hunter}`).toContain(hunter);
  }
  expect.soft(week, "the band of hours starts at 8").toMatch(/08:00/);
  expect.soft(week, "and reaches 18").toMatch(/17:00/);

  await actions.chooseWhoseAgenda("Sofía Paz");
  const ofSofia = await actions.screenText();
  expect.soft(ofSofia, "what is of their companies shows whole").toMatch(/ALIMENTOS DEL SUR/);
  expect.soft(ofSofia, 'what is of another officer says "Ocupado"').toMatch(/Ocupado/);
  expect.soft(ofSofia, "without the company").not.toMatch(/TRANSPORTES RIO/);
  const taken = await actions.takenBlocks();
  expect.soft(taken.count, "there is a taken block").toBeGreaterThan(0);
  expect.soft(taken.thatOpen, 'an "Ocupado" block does not open').toBe(0);
  expect
    .soft(ofSofia, "the legend explains the red")
    .toMatch(/ocupados con empresas que no son tuyas/);

  await actions.chooseAgendaView("Día del equipo");
  expect.soft(await actions.waitForAgendaLayout("team"), "hunters by hour").toBe(true);
  const team = await actions.screenText();
  expect.soft(team, "with each hunter").toMatch(/Sofía Paz/);
  expect.soft(team, "and the free spots").toMatch(/Libre/);

  await actions.chooseAgendaView("Mes");
  expect.soft(await actions.waitForAgendaLayout("month"), "the calendar of the month").toBe(true);
  await actions.showMonthOf(forwardedWithQuestion.fecha);
  expect
    .soft(await actions.screenText(), "the month has what is theirs")
    .toMatch(/ALIMENTOS DEL SUR/);
  expect.soft((await actions.takenBlocks()).count, 'without the "Ocupado"').toBe(0);
  expect
    .soft(await actions.agendaRangeLabel(), "the label says month and year")
    .toMatch(MONTH_LABEL);

  const month = await actions.agendaMonth();
  await actions.moveAgenda("next");
  expect
    .soft((await actions.agendaMonth()) > month, "the arrow moves one month at a time")
    .toBe(true);

  await actions.moveAgenda("today");
  await actions.chooseAgendaView("Semana");
  expect
    .soft(await actions.waitForAgendaLayout("hours"), "and it goes back to the week")
    .toBe(true);
});

test("choosing the hunter while assigning shows their week, and a free spot fills the time", async ({
  cloud,
  openApp,
}) => {
  cloud.seedCommercialActions();
  const { commercialActions: actions } = await openAsTeamMember(openApp, "officer");
  await actions.goToTab("agenda");
  await actions.chooseAgendaView("Semana");

  await actions.startScheduling();
  expect
    .soft(await actions.dialogText(), '"Asignar a un hunter" opens')
    .toMatch(/Asignar a un hunter/);
  expect.soft(await actions.hunterChoices(), "with its hunters").toContain("Sofía Paz");

  await actions.chooseHunter("Sofía Paz");
  const week = await actions.waitForHunterWeek();
  expect.soft(week?.title, "their week shows on the same window").toMatch(/La semana de/);
  expect.soft(week?.blocks, "with blocks").toBeGreaterThan(0);
  expect.soft(week?.blocksThatOpen, "that are only for looking").toBe(0);

  await actions.touchHunterWeek(FREE_SPOT_HOURS_BELOW_TOP);
  expect
    .soft((await actions.schedule()).from, "touching a free spot fills the time")
    .toMatch(/^\d\d:\d\d$/);

  await actions.dismissDialog();
  expect.soft(await actions.waitForDialogToClose(), "the window can be left").toBe(true);
});

test("the hunter sees who to contact and can schedule their own things", async ({
  cloud,
  openApp,
}) => {
  cloud.seedCommercialActions();
  const { commercialActions: actions } = await openAsTeamMember(openApp, "hunter");

  await actions.goToTab("agenda");
  const agenda = await actions.waitForScreenText(/Para contactar \(/);
  expect
    .soft(agenda, 'the agenda of the hunter shows "Para contactar"')
    .toMatch(/Para contactar \(/);
  expect.soft(agenda, "with the person to call").toMatch(/Walter Ibáñez/);
  expect.soft(agenda, "and what they have today").toMatch(/TRANSPORTES RIO SA/);
  expect.soft(agenda, "and the one left behind").toMatch(/Ximena Toledo/);
  expect.soft(agenda, 'marked "desde el …"').toMatch(/desde el/);

  await actions.startScheduling();
  expect
    .soft(await actions.actionTypeChoices(), 'the hunter can choose "Base de datos"')
    .toContain("Base de datos");
  await actions.chooseActionType("data-list");
  expect
    .soft((await actions.formSections()).peopleList, "and gets where to paste people")
    .toBe(true);
  await actions.chooseActionType("action");
  expect
    .soft((await actions.waitForHunterWeek())?.title, "scheduling with a time shows their own week")
    .toMatch(/Tu semana/);
  await actions.dismissDialog();

  await actions.openContactList();
  const contacts = await actions.waitForDialogText(/Vencidas \(1\)/);
  expect.soft(contacts, '"Ver todas" sets the overdue apart').toMatch(/Vencidas \(1\)/);
  expect.soft(contacts, "and those of today").toMatch(/Hoy \(1\)/);
  expect.soft(contacts, "with all the people").toMatch(/Ximena Toledo/);
  expect.soft(contacts, "with all the people").toMatch(/Walter Ibáñez/);

  await actions.chooseContact("Ximena");
  const highlighted = await actions.waitForHighlightedPerson();
  expect.soft(highlighted, "touching one opens the action, with that person marked").not.toBe("");
  expect.soft(highlighted, "and the one marked is her").toMatch(/Ximena/);

  expect
    .soft(await actions.waitForDialogToClose(), "the window leaves the action in sight")
    .toBe(true);
  await actions.leaveAction();
  expect.soft(await actions.waitForNoHighlightedPerson(), "leaving takes the mark away").toBe(true);
});

test("whoever assigns starts by the team, and a hunter by their week", async ({
  cloud,
  openApp,
}) => {
  cloud.seedCommercialActions();
  const { commercialActions: officer } = await openAsTeamMember(openApp, "officer");
  const { commercialActions: hunter } = await openAsTeamMember(openApp, "hunter");

  await officer.goToTab("agenda");
  expect
    .soft(await officer.agendaViewShown(), "the officer opens on the day of all hunters")
    .toBe("Día del equipo");

  await hunter.goToTab("agenda");
  expect.soft(await hunter.agendaViewShown(), "the hunter, on their week").toBe("Semana");

  await hunter.chooseAgendaView("Día");
  expect.soft(await hunter.waitForAgendaLayout("hours"), "the hunter can see one day").toBe(true);
  expect.soft(await hunter.agendaDayColumns(), "only one day, by hours").toBe(1);
  const { date, heading } = await hunter.agendaDayShown();
  const weekday = WEEKDAYS[new Date(`${date}T12:00:00`).getDay()] ?? "";
  expect.soft(heading.startsWith(weekday), `the heading (${heading}) says that day`).toBe(true);
});
