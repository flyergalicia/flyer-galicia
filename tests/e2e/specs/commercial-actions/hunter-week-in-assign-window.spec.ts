// Replaces pruebas/t96_asignar_semana_ancha.cjs.
import { openAsTeamMember } from "../../support/commercial-team.ts";
import { expect, test } from "../../support/test.ts";

const SCREENS = [
  { width: 1366, height: 800 },
  { width: 1024, height: 768 },
];

test.describe("the week of the hunter chosen while assigning", () => {
  for (const viewport of SCREENS) {
    test(`fits the window at ${String(viewport.width)} px`, async ({ cloud, openApp }) => {
      cloud.seedCommercialActions();
      const { commercialActions: actions } = await openAsTeamMember(openApp, "officer", {
        viewport,
      });

      await actions.goToTab("agenda");
      await actions.startScheduling();
      await actions.chooseHunter("Sofía Paz");
      await actions.waitForHunterWeek();
      await actions.waitForScreenToSettle();
      const sizes = await actions.hunterWeekSizes();

      expect.soft(sizes.panelWidth, "the week is there").toBeGreaterThan(0);
      expect
        .soft(sizes.panelWidth, "it takes the whole width of the window")
        .toBeGreaterThanOrEqual(sizes.windowWidth - 2);
      expect
        .soft(sizes.scrollWidth, "no sideways scroll on the week")
        .toBeLessThanOrEqual(sizes.clientWidth + 1);
      expect
        .soft(sizes.scrollHeight, "the week shows whole, with no scroll of its own")
        .toBeLessThanOrEqual(sizes.clientHeight + 1);
    });
  }
});
