// Replaces pruebas/t93_gestiones_v2.cjs: the period of the dashboard by quarter and month.
import { openAsTeamMember } from "../../support/commercial-team.ts";
import { expect, test } from "../../support/test.ts";

const SIX_DAYS_MS = 6 * 86_400_000;

test(
  "the dashboard period goes by quarter and month, and Shift adds to it",
  { tag: "@react" },
  async ({ cloud, openApp }) => {
    cloud.seedCommercialActions();
    const { commercialActions: actions } = await openAsTeamMember(openApp, "leader");
    const year = new Date().getFullYear();

    await actions.goToTab("dashboard");
    await actions.choosePeriod("Por trimestre o mes…");

    expect
      .soft(await actions.quarterChoices(), "the panel offers the quarters")
      .toEqual(["1Q", "2Q", "3Q", "4Q"]);
    expect.soft(await actions.chosenMonths(), "it starts on the quarter of today").toHaveLength(3);

    await actions.touchQuarter(1);
    expect
      .soft(await actions.chosenMonths(), "a touch on 1Q chooses its months")
      .toEqual(["01", "02", "03"]);

    await actions.touchQuarter(3, { adding: true });
    expect
      .soft(await actions.chosenMonths(), "with Shift, 3Q adds to 1Q")
      .toEqual(["01", "02", "03", "07", "08", "09"]);

    await actions.touchQuarter(1, { adding: true });
    expect
      .soft(await actions.chosenMonths(), "with Shift on a chosen one, it goes away")
      .toEqual(["07", "08", "09"]);

    await actions.touchQuarter(2);
    expect
      .soft(await actions.chosenMonths(), "without Shift, only what was touched")
      .toEqual(["04", "05", "06"]);

    expect.soft(await actions.openQuarterMonths(2), "the arrow opens the 3 months of 2Q").toBe(3);

    await actions.touchMonth("05");
    expect
      .soft(await actions.chosenMonths(), "a touch on a month chooses only that one")
      .toEqual(["05"]);

    await actions.touchMonth("06", { adding: true });
    expect
      .soft(await actions.chosenMonths(), "with Shift, another month adds")
      .toEqual(["05", "06"]);
    expect
      .soft(await actions.screenText(), "the note says which months it looks at")
      .toContain(`mayo y junio de ${String(year)}`);

    await actions.touchMonth("05", { adding: true });
    await actions.touchMonth("06", { adding: true });
    expect
      .soft(await actions.chosenMonths(), "the last month cannot be taken away")
      .toEqual(["06"]);

    const monthOfDoneActions = new Date(Date.now() - SIX_DAYS_MS).toISOString().slice(5, 7);
    await actions.touchMonth(monthOfDoneActions);
    const inThatMonth = await actions.waitForDashboardFigures(({ actions: done }) => done > 0);
    expect
      .soft(inThatMonth.actions, "the month of the done actions counts them")
      .toBeGreaterThan(0);

    await actions.chooseYear(year - 2);
    const inAnotherYear = await actions.waitForDashboardFigures(({ actions: done }) => done === 0);
    expect.soft(inAnotherYear.actions, "another year counts nothing").toBe(0);
  },
);
