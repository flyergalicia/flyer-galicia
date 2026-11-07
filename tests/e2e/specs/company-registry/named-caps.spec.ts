// Replaces pruebas/t78_topes_con_nombre.cjs.
import { expect, test } from "../../support/test.ts";

const COMPANIES = [
  {
    name: "COMB SA",
    cashback: "BAU",
    category: { option: 0, name: "Combustible", cap: "24000", secondCap: "" },
  },
  {
    name: "SUPER SA",
    cashback: "BAU",
    category: { option: 0, name: "Supermercado", cap: "15000", secondCap: "" },
  },
  {
    name: "AMBOS DIST SA",
    cashback: "BAU",
    category: { option: 0, name: "Ambos", cap: "20000", secondCap: "30000" },
  },
  {
    name: "AMBOS IGUAL SA",
    cashback: "BAU",
    category: { option: 0, name: "Ambos", cap: "25000", secondCap: "" },
  },
  { name: "SIN RUBRO SA", cashback: "BAU" },
];

test.describe("caps with a name in the company sheet", () => {
  test("each cap goes to its column and reading it back changes nothing", async ({ openApp }) => {
    const { companyRegistry } = await openApp({ user: "admin" });

    // 1) Headers
    expect
      .soft((await companyRegistry.sheetColumns()).slice(-3), "the columns have their names")
      .toEqual(["rubro", "tope_combustible", "tope_supermercado"]);

    // 2) Export and read back: it stays the same, each cap in its column
    const { cells, unchanged } = await companyRegistry.exportAndReadBack(COMPANIES);
    const [fuel, grocery, bothDifferent, bothSame] = cells;
    expect.soft(fuel?.[1], "fuel: the cap goes in tope_combustible").toBe("24.000");
    expect.soft(fuel?.[2], "fuel: nothing in tope_supermercado").toBe("");
    expect.soft(grocery?.[1], "grocery: nothing in tope_combustible").toBe("");
    expect.soft(grocery?.[2], "grocery: the cap goes in tope_supermercado").toBe("15.000");
    expect.soft(bothDifferent?.[1], "Ambos: fuel 30.000").toBe("30.000");
    expect.soft(bothDifferent?.[2], "Ambos: grocery 20.000").toBe("20.000");
    expect.soft(bothSame?.[1], "Ambos with one cap: fuel written").toBe("25.000");
    expect.soft(bothSame?.[2], "Ambos with one cap: grocery written").toBe("25.000");
    expect.soft(fuel?.[0], "a category with no option keeps its name").toBe("Combustible");
    expect
      .soft(unchanged, "export and read back changes no cap")
      .toEqual(COMPANIES.map(() => true));

    // 3) An old sheet (tope / tope2) is read the same
    const old = await companyRegistry.capsOfSheetRow({
      empresa: "VIEJA SA",
      config: "BAU",
      rubro: "Ambos",
      tope: "20000",
      tope2: "30000",
    });
    expect.soft(old.cap, "old sheet: tope").toBe("20000");
    expect.soft(old.secondCap, "old sheet: tope2").toBe("30000");

    // 4) A cap in the column of the other category: taken as its own and warned
    const crossed = await companyRegistry.validateSheet([
      {
        cells: {
          empresa: "CRUZADA SA",
          config: "BAU",
          rubro: "Combustible",
          tope_supermercado: "24000",
        },
      },
      {
        cells: {
          empresa: "BIEN SA",
          config: "BAU",
          rubro: "Combustible",
          tope_combustible: "24000",
        },
      },
    ]);
    const warnings = crossed.problems.join(" || ");
    expect.soft(crossed.firstCompanyCap, "wrong column: the cap is taken anyway").toBe("24000");
    expect.soft(warnings, "wrong column: it warns").toMatch(/en la columna del otro rubro/);
    expect.soft(warnings, "about that row").toMatch(/fila 2/);
    expect.soft(warnings, "and only that row").not.toMatch(/fila 3 \(rubro/);
  });

  test("the inline editor names its fields and enables them by category", async ({ openApp }) => {
    const app = await openApp({ user: "admin" });
    const { companyRegistry } = app;

    // 5) The test flyer is of fuel
    await companyRegistry.openRegistry();
    const option = await companyRegistry.offerCurrentFlyerAsCategory("combustible");
    await companyRegistry.openEditorWith([
      { name: "EDIT SA", cashback: "BAU", category: { option, cap: "24000", secondCap: "" } },
    ]);
    const [fuelField, groceryField] = (await companyRegistry.capFields(0)) ?? [];
    expect
      .soft(fuelField?.placeholder, 'the field is called "Tope combustible"')
      .toBe("Tope combustible");
    expect.soft(groceryField?.placeholder, 'and the other "Tope súper"').toBe("Tope súper");
    expect.soft(fuelField?.disabled, "category fuel: the fuel one can be written").toBe(false);
    expect.soft(groceryField?.disabled, "category fuel: the grocery one cannot").toBe(true);
    expect.soft(fuelField?.value, "and it brings its cap").toBe("24.000");

    // The same flyer becomes "Ambos": both are enabled and written with their name
    await companyRegistry.offerCurrentFlyerAsCategory("ambos");
    const both = (await companyRegistry.capFields(0)) ?? [];
    expect.soft(both[0]?.disabled, "Ambos: fuel enabled").toBe(false);
    expect.soft(both[1]?.disabled, "Ambos: grocery enabled").toBe(false);
    await companyRegistry.writeCaps(0, ["30000", "20000"]);
    const category = await companyRegistry.editorCategory(0);
    expect.soft(category.cap, "Ambos: grocery 20.000 is saved").toBe("20000");
    expect.soft(category.secondCap, "Ambos: fuel 30.000 is saved").toBe("30000");
    expect.soft(app.pageErrors(), "no JavaScript errors").toEqual([]);
  });
});
