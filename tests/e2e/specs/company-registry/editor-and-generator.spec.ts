// Replaces pruebas/t56_padron_editor_generador.cjs.
import { expect, test } from "../../support/test.ts";

const COMPANIES = Array.from({ length: 30 }, (_, row) => ({
  name: `EMPRESA ${String(row)}`,
  taxIds: [`30${String(70_000_000 + row)}1`],
  cashback: "Config 1",
  officers: [
    {
      name: `Oficial ${String(row)}`,
      phone: `11 5555 ${String(1000 + row)}`,
      email: `of${String(row)}@bancogalicia.com.ar`,
    },
  ],
}));
const EXPANDED_ROWS = [3, 7];
const OFFICER_FIELDS_PER_COMPANY = 4;

test.describe("the company editor and the flyer generator", () => {
  test(
    "with the search on, a category enables the caps of its own row",
    { tag: "@react" },
    async ({ openApp }) => {
      const { companyRegistry } = await openApp({ user: "admin" });
      await companyRegistry.openRegistry();
      await companyRegistry.openEditorWith(COMPANIES);
      await companyRegistry.filterEditor("empresa 2");
      await companyRegistry.offerCurrentFlyerAsCategory();

      await companyRegistry.chooseCategoryFlyer(25);

      const chosen = await companyRegistry.capFields(25);
      const other = await companyRegistry.capFields(2);
      expect.soft(chosen, "the chosen row is on screen").not.toBeNull();
      expect
        .soft(
          chosen?.some(({ disabled }) => !disabled),
          "at least one cap of that row is enabled",
        )
        .toBe(true);
      expect.soft(other, "the other row is on screen").not.toBeNull();
      expect
        .soft(
          other?.every(({ disabled }) => disabled),
          "the caps of another row stay disabled",
        )
        .toBe(true);
    },
  );

  test(
    "deleting a company does not move the expanded officers",
    { tag: "@react" },
    async ({ openApp }) => {
      const { companyRegistry } = await openApp({ user: "admin" });
      await companyRegistry.openRegistry();
      await companyRegistry.openEditorWith(COMPANIES);
      await companyRegistry.expandOfficers(EXPANDED_ROWS);
      const expanded = await companyRegistry.expandedCompanies();
      expect.soft(expanded, "they start on their companies").toEqual(["EMPRESA 3", "EMPRESA 7"]);

      await companyRegistry.removeFromEditor(1);

      expect
        .soft(
          await companyRegistry.expandedCompanies(),
          "the expanded officers follow their company",
        )
        .toEqual(expanded);
      expect
        .soft(
          await companyRegistry.officerFieldsShown(),
          "only the expanded rows build their fields",
        )
        .toBe(EXPANDED_ROWS.length * OFFICER_FIELDS_PER_COMPANY);
    },
  );

  test(
    "ticking in the generator updates the counter without drawing the list again",
    { tag: "@react" },
    async ({ openApp }) => {
      const { companyRegistry } = await openApp({ user: "admin" });
      await companyRegistry.openRegistry();
      await companyRegistry.openGeneratorWith(COMPANIES);

      const { repainted, counter } = await companyRegistry.tickInGenerator([4, 6]);

      expect.soft(repainted, "ticking does not draw the list again").toBe(false);
      expect.soft(counter, 'the counter says "2 de 30"').toMatch(/^2 de 30/);
      const found = await companyRegistry.filterGenerator("empresa 1");
      expect.soft(found, "the filter finds 1, 10 to 19 and 21").toHaveLength(12);
      expect.soft(found[0], "with EMPRESA 1 first").toBe("EMPRESA 1");
    },
  );

  test(
    "an update that cannot be saved leaves the company as it was",
    { tag: "@react" },
    async ({ cloud, openApp }) => {
      cloud.bucketJson["_cashback.json"] = {
        configs: [
          { nombre: "BAU", m1: "$250.000", m2: "$180.000", m3: "$80.000", m4: "$30.000" },
          { nombre: "Config 1", m1: "$350.000", m2: "$200.000", m3: "$80.000", m4: "$30.000" },
          { nombre: "Config 3", m1: "$500.000", m2: "$320.000", m3: "$100.000", m4: "$40.000" },
        ],
      };
      const { companyRegistry } = await openApp({ user: "admin" });
      await companyRegistry.openRegistry();
      await companyRegistry.openGeneratorWith(COMPANIES);
      cloud.companyReplaceFails = true;

      const saved = await companyRegistry.saveFlyerChanges(0, {
        cashback: "Config 3",
        officers: [{ name: "Otro" }],
      });

      expect.soft(saved.cashback, "the cashback goes back").toBe("Config 1");
      expect.soft(saved.firstOfficer, "and so does the officer").toBe("Oficial 0");
    },
  );
});
