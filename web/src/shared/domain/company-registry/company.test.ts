import { describe, expect, it } from "vitest";
import {
  companySubtitle,
  emptyOfficer,
  findByName,
  isBorrowed,
  newCompany,
  officerCount,
  officersLabel,
  sanitizeCategory,
  sanitizeCompanies,
  searchableCompanies,
  taxIdCount,
  taxIdsLine,
} from "./company.ts";

const NAMES = ["BAU", "Config 1"];

function officer(nombre: string) {
  return { ...emptyOfficer(), nombre };
}

function officers(...names: readonly string[]) {
  return { asesores: names.map(officer) };
}

describe("a row that arrives incomplete", () => {
  it("breaks nothing: names are cleaned, and an empty one goes", () => {
    const rows = sanitizeCompanies([
      { empresa: "  CON ESPACIOS  ", cuits: "30-71111111-1 / 30722222222", config: "BAU" },
      { empresa: 12_345, cuits: null, config: null, asesores: "nada" },
      { empresa: "", cuits: [], config: "BAU" },
      {
        empresa: "MEDIO",
        cuits: ["30733333333", "30733333333"],
        asesores: [{ nombre: null }, null],
      },
      "no es una fila",
      null,
    ]);

    expect(rows.map(({ empresa }) => empresa)).toEqual(["CON ESPACIOS", "12345", "MEDIO"]);
    expect(rows[0]?.cuits).toEqual(["30711111111", "30722222222"]);
    expect(rows[2]?.cuits, "no repeated tax ids").toEqual(["30733333333"]);
    expect(rows[1]?.asesores, "always the four places").toHaveLength(4);
    expect(rows[1]?.asesores[0]).toEqual(emptyOfficer());
  });

  it("a row with a tax id and no name stays", () => {
    expect(sanitizeCompanies([{ cuits: ["307"] }])[0]?.cuits).toEqual(["307"]);
  });

  it("what is not a list is nothing", () => {
    expect(sanitizeCompanies(null)).toEqual([]);
    expect(sanitizeCompanies("x")).toEqual([]);
  });

  it("the owner and the id travel only when the query asked for them", () => {
    const [own] = sanitizeCompanies([{ empresa: "A" }]);
    const [other] = sanitizeCompanies([{ empresa: "B", id: 7, user_id: "u1" }]);

    expect(own).not.toHaveProperty("id");
    expect(own).not.toHaveProperty("user_id");
    expect(other).toMatchObject({ id: 7, user_id: "u1" });
  });
});

describe("the category", () => {
  it("is cleaned to digits and a whole option", () => {
    expect(
      sanitizeCategory({
        opcion: "5",
        importe: "$24.000",
        importe2: "x",
        txt: ` <b>${"y".repeat(50)}</b> `,
      }),
    ).toEqual({ opcion: 5, importe: "24000", importe2: "", txt: `b${"y".repeat(39)}` });
  });

  it("anything else is no category", () => {
    const none = { opcion: 0, importe: "", importe2: "", txt: "" };
    expect(sanitizeCategory(null)).toEqual(none);
    expect(sanitizeCategory({ opcion: -3 })).toEqual(none);
    expect(sanitizeCategory("x")).toEqual(none);
  });
});

describe("what is said about a company", () => {
  it("counts only the officers with a name", () => {
    expect(officerCount(officers("Ana", " ", ""))).toBe(1);
    expect(officersLabel(officers())).toBe("sin oficiales asignados");
    expect(officersLabel(officers("Ana"))).toBe("1 oficial");
    expect(officersLabel(officers("Ana", "Luis"))).toBe("2 oficiales");
  });

  it("counts every tax id of the list", () => {
    expect(taxIdCount([{ cuits: ["1", "2"] }, { cuits: [] }, { cuits: ["3"] }])).toBe(3);
  });

  it("writes the tax ids with their format", () => {
    expect(taxIdsLine({ cuits: ["30712345678", "307"] })).toBe("30-71234567-8  ·  307");
    expect(taxIdsLine({ cuits: ["30712345678", "307"] }, ", ")).toBe("30-71234567-8, 307");
  });

  it("the subtitle of the search says tax ids, cashback and officers", () => {
    const company = {
      ...newCompany(),
      ...officers("Ana"),
      cuits: ["30712345678"],
      config: "Config 1",
    };

    expect(companySubtitle(company, NAMES)).toBe("30-71234567-8  —  Config 1  ·  1 oficial");
    expect(companySubtitle({ ...company, cuits: [], config: "" }, NAMES)).toBe(
      "SIN CASHBACK  ·  1 oficial",
    );
  });
});

describe("the razón social is the key", () => {
  const acme = { ...newCompany(), empresa: "ACME S.A." };
  const beta = { ...newCompany(), empresa: "Beta" };

  it("finds the exact one, whatever the capitals and accents", () => {
    expect(findByName([acme, beta], "  acme s.a. ")).toBe(acme);
    expect(findByName([acme, beta], "bétá")).toBe(beta);
  });

  it("the same tax id on another name is another company", () => {
    const shared = { ...acme, cuits: ["30711111111"] };
    expect(findByName([shared], "ACME GRUPO")).toBeNull();
  });

  it("nothing written finds nothing", () => {
    expect(findByName([{ ...acme, empresa: "" }], "")).toBeNull();
  });
});

describe("the list of a substitute", () => {
  const own = { ...newCompany(), empresa: "MIA" };
  const borrowed = { ...newCompany(), empresa: "DE OTRO", owner: { id: "u", nombre: "Pepito" } };

  it("comes after one's own, and is told apart", () => {
    expect(searchableCompanies([own], [borrowed]).map(({ empresa }) => empresa)).toEqual([
      "MIA",
      "DE OTRO",
    ]);
    expect(isBorrowed(borrowed)).toBe(true);
    expect(isBorrowed(own)).toBe(false);
  });

  it("without it, it is the same list", () => {
    const list = [own];
    expect(searchableCompanies(list, [])).toBe(list);
  });
});
