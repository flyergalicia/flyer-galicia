// Replaces pruebas/t93_gestiones_v2.cjs: the chapter of Gestiones of the tutorial.
import { openAsTeamMember } from "../../support/commercial-team.ts";
import { expect, test } from "../../support/test.ts";

test.describe("the chapter of Gestiones of the tutorial", { tag: "@react" }, () => {
  test.beforeEach(({ cloud }) => {
    cloud.seedCommercialActions();
  });

  test("walks the officer through each solapa", async ({ openApp }) => {
    const { commercialActions: actions } = await openAsTeamMember(openApp, "officer");

    const steps = await actions.walkTutorial();

    expect
      .soft(
        steps.map(({ title }) => title),
        "the steps of the officer",
      )
      .toEqual([
        "Gestiones comerciales",
        "Derivar una acción",
        "La agenda",
        "Los horarios no se pisan",
        "Cada acción por dentro",
        "El tablero",
      ]);
    expect
      .soft(
        steps.slice(1).every(({ pointsInsideCommercialActions: inside }) => inside),
        "each step points to its solapa inside Gestiones",
      )
      .toBe(true);
  });

  test("walks the hunter", async ({ openApp }) => {
    const { commercialActions: actions } = await openAsTeamMember(openApp, "hunter");

    const steps = await actions.walkTutorial();

    expect
      .soft(
        steps.map(({ title }) => title),
        "the steps of the hunter",
      )
      .toEqual([
        "Registrá la gestión",
        "Gestiones comerciales",
        "Mi agenda",
        "Los horarios no se pisan",
        "Cada acción por dentro",
        "El tablero",
      ]);
  });

  test("walks the leader", async ({ openApp }) => {
    const { commercialActions: actions } = await openAsTeamMember(openApp, "leader");

    const steps = await actions.walkTutorial();

    expect
      .soft(
        steps.map(({ title }) => title),
        "the steps of the leader",
      )
      .toEqual([
        "Gestiones comerciales",
        "La agenda del equipo",
        "Los horarios no se pisan",
        "Cada acción por dentro",
        "El tablero",
      ]);
  });
});
