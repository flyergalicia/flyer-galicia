// Replaces pruebas/t95_gestiones_sin_desborde.cjs.
import { type PersonKey } from "../../support/cloud/commercial-actions/model.ts";
import { commercialTables, openAsTeamMember } from "../../support/commercial-team.ts";
import { type CommercialTab } from "../../support/driver/commercial-actions.ts";
import { expect, test } from "../../support/test.ts";

const SCREENS = [
  { width: 1920, height: 950 },
  { width: 1366, height: 800 },
  { width: 1024, height: 768 },
  { width: 768, height: 900 },
  { width: 390, height: 844 },
];
const PHONE_BELOW_WIDTH = 800;

const TABS_OF: readonly (readonly [PersonKey, readonly CommercialTab[]])[] = [
  ["officer", ["companies", "agenda", "actions", "dashboard"]],
  ["hunter", ["agenda", "actions", "dashboard"]],
  ["leader", ["agenda", "dashboard", "actions"]],
];

test.describe("no solapa of Gestiones scrolls sideways", { tag: "@react" }, () => {
  for (const [person, tabs] of TABS_OF) {
    for (const { width, height } of SCREENS) {
      test(`${person} at ${String(width)} px`, async ({ cloud, openApp }) => {
        cloud.seedCommercialActions();
        const app = await openAsTeamMember(openApp, person, {
          viewport: { width, height },
          touch: width < PHONE_BELOW_WIDTH,
        });

        for (const tab of tabs) {
          await app.commercialActions.goToTab(tab);
          expect
            .soft(await app.commercialActions.sidewaysOverflow(), `${person}, ${tab}`)
            .toEqual([]);
        }
      });
    }
  }
});

test.describe("the filters of Mis empresas", { tag: "@react" }, () => {
  test("tell forwarded companies from the others, and say how many each has", async ({
    cloud,
    openApp,
  }) => {
    cloud.seedCommercialActions();
    const { commercialActions: actions } = await openAsTeamMember(openApp, "officer");

    await actions.waitForScreenText(/ALIMENTOS DEL SUR/);
    const all = await actions.filterCompanies("all");
    const forwarded = await actions.filterCompanies("forwarded");
    const notForwarded = await actions.filterCompanies("not-forwarded");
    const withSignups = await actions.filterCompanies("with-signups");

    expect.soft(all, '"Todas" shows the 6').toBe(6);
    expect.soft(forwarded + notForwarded, "Forwarded + not forwarded = all").toBe(all);
    expect.soft(forwarded, "there are forwarded ones").toBeGreaterThan(0);
    expect.soft(withSignups, "there are some with signups").toBeGreaterThan(0);
    expect
      .soft(withSignups, "those with signups are part of the forwarded ones")
      .toBeLessThanOrEqual(forwarded);
    expect
      .soft((await actions.companyFilterOptions())[0], "each option says how many companies it has")
      .toMatch(/\(6\)/);

    await actions.filterCompanies("not-forwarded");
    await actions.searchCompanies("zzzz");
    expect.soft(await actions.companiesText(), "it warns of no matches").toMatch(/ese filtro/);
  });

  test("a company without actions counts as not forwarded", async ({ cloud, openApp }) => {
    cloud.seedCommercialActions();
    const { commercialActions: before } = await openAsTeamMember(openApp, "officer");
    await before.waitForScreenText(/ALIMENTOS DEL SUR/);
    const notForwardedBefore = await before.filterCompanies("not-forwarded");
    const forwardedBefore = await before.filterCompanies("forwarded");
    const tables = commercialTables(cloud);
    const [mine] = tables.companies;
    if (!mine) throw new Error("The seed has no companies");
    tables.companies.push({
      ...mine,
      id: tables.companies.length + 1,
      empresa: "EMPRESA NUEVA SA",
      cuits: [],
    });

    const { commercialActions: after } = await openAsTeamMember(openApp, "officer");
    await after.waitForScreenText(/EMPRESA NUEVA SA/);

    expect
      .soft(await after.filterCompanies("not-forwarded"), "it shows as not forwarded")
      .toBe(notForwardedBefore + 1);
    expect
      .soft(await after.filterCompanies("forwarded"), "and not as forwarded")
      .toBe(forwardedBefore);
  });
});
