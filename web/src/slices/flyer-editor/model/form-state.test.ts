import { describe, expect, it } from "vitest";
import { sanitizeCompanies } from "@/shared/domain/company-registry/index.ts";
import { DEFAULT_CASHBACK_CONFIGS } from "@/shared/domain/company-registry/cashback.ts";
import {
  amountOnFlyer,
  BRANCH_PIN,
  branchesHaveData,
  capInField,
  categoryForReview,
  DEFAULT_FILE_NAME,
  type FormContext,
  initialFormState,
  nextFreeOfficer,
  officerHasData,
  officersForReview,
  officersLimit,
  placeText,
  problemsOnFlyer,
  restoredForm,
  valuesOfForm,
  withAllFieldsChecked,
  withBenefitName,
  withBenefitNameFromCompany,
  withBranches,
  withCashback,
  withCompany,
  withCompanyBrought,
  withFieldChecked,
  withFileName,
  withNoCashback,
  withOfficerAdded,
  withOfficerEmptied,
  withOfficerField,
  withOfficerPlace,
  withOfficerRemoved,
  withOfficerRestored,
  withPastedOfficer,
  withPastedPhone,
  withSavedAdvisor,
} from "./form-state.ts";

const CONTEXT: FormContext = {
  configs: DEFAULT_CASHBACK_CONFIGS,
  names: DEFAULT_CASHBACK_CONFIGS.map(({ nombre }) => nombre),
  tab: "flyer",
};

function company(row: Record<string, unknown>) {
  const [clean] = sanitizeCompanies([{ cuits: [], config: "BAU", ...row }]);
  if (!clean) throw new Error("It has no name");
  return clean;
}

const officer = (form: ReturnType<typeof initialFormState>, position = 0) => {
  const found = form.officers[position];
  if (!found) throw new Error("There is no such officer");
  return found;
};

describe("what the form draws", () => {
  it("starts empty, with one officer that does not go until it has a name", () => {
    const values = valuesOfForm(initialFormState(), CONTEXT);
    expect(values.empresa).toBe("");
    expect(values.has1).toBe(false);
    expect(values.has2).toBe(false);
    expect(values.m1).toBe("$250.000");
    expect(values.config).toBe("BAU");
    expect(values.importe).toBe("$24.000");
    expect(values.importe2).toBe("$24.000");
    expect(values).not.toHaveProperty("sinOficiales");
  });

  it("says Cel: before a phone, and an officer with a name goes on the flyer", () => {
    let form = withOfficerField(initialFormState(), 0, "nombre", "Ana Perez");
    form = withOfficerField(form, 0, "celular", " 11 4444 5555 ");
    const values = valuesOfForm(form, CONTEXT);
    expect(values.has1).toBe(true);
    expect(values.nombre).toBe("Ana Perez");
    expect(values.celular).toBe("Cel: 11 4444 5555");
    expect(values.email).toBe("ana.perez@bancogalicia.com.ar");
  });

  it("with the switch off none goes, and nothing is erased (invariant 19)", () => {
    const form = {
      ...withOfficerField(initialFormState(), 0, "nombre", "Ana Perez"),
      officersOn: false,
    };
    const values = valuesOfForm(form, CONTEXT);
    expect(values.has1).toBe(false);
    expect(values.nombre).toBe("Ana Perez");
    expect(values.sinOficiales).toBe(true);
  });

  it("past the four of always nobody goes, unless it is by branch", () => {
    const fifth = withOfficerAdded(withOfficerField(initialFormState(), 4, "nombre", "Luz Paz"), 4);
    expect(valuesOfForm(fifth, CONTEXT).has5).toBe(false);
    expect(officersLimit(fifth)).toBe(4);
    const byBranch = {
      ...fifth,
      branches: true,
      branchesTitle: " Por sede ",
      officers: fifth.officers.with(4, { ...officer(fifth, 4), ubic: "CABA" }),
    };
    const values = valuesOfForm(byBranch, CONTEXT);
    expect(officersLimit(byBranch)).toBe(8);
    expect(values.has5).toBe(true);
    expect(values.ubic5).toBe("CABA");
    expect(values.sedes).toBe(true);
    expect(values.sedesTit).toBe("Por sede");
  });

  it("each tab draws its own", () => {
    const form = withCompany(initialFormState(), "ACME");
    expect(valuesOfForm(form, { ...CONTEXT, tab: "rubros" }).benef).toBe(true);
    expect(valuesOfForm(form, { ...CONTEXT, tab: "rubros" }).benefNombre).toBe("ACME");
    expect(valuesOfForm(form, { ...CONTEXT, tab: "sueldo" }).cashUnico).toBe(true);
    expect(valuesOfForm(form, CONTEXT).benef).toBe(false);
    expect(valuesOfForm(form, CONTEXT).cashUnico).toBe(false);
  });

  it("no cashback keeps the configuration and says so", () => {
    const form = withNoCashback(withCashback(initialFormState(), 2));
    const values = valuesOfForm(form, CONTEXT);
    expect(values.nocb).toBe(true);
    expect(values.config).toBe("Sin cashback");
    expect(values.m1).toBe("$400.000");
    expect(form.cashback).toBe(2);
    expect(withCashback(form, 1).noCashback).toBe(false);
  });

  it("without any configuration it writes no amounts", () => {
    const values = valuesOfForm(initialFormState(), { ...CONTEXT, configs: [], names: [] });
    expect(values.m1).toBeNull();
    expect(values.config).toBe("");
  });

  it("a second cap that is empty is the first one", () => {
    const form = { ...initialFormState(), cap: "50.000", secondCap: "" };
    expect(valuesOfForm(form, CONTEXT).importe2).toBe("$50.000");
    expect(valuesOfForm({ ...form, secondCap: "7000" }, CONTEXT).importe2).toBe("$7.000");
    expect(capInField("24000")).toBe("24.000");
    expect(capInField("sin nada")).toBe("");
  });
});

describe("writing the company", () => {
  it("the name of the file and the benefit follow it until they are written by hand", () => {
    const form = withCompany(initialFormState(), "ACME");
    expect(form.fileName).toBe("Flyer_ACME");
    expect(form.benefitName).toBe("ACME");

    const own = withFileName(withBenefitName(form, "OTRO"), "Mi flyer");
    const next = withCompany(own, "BETA");
    expect(next.fileName).toBe("Mi flyer");
    expect(next.benefitName).toBe("OTRO");
    expect(withBenefitNameFromCompany(next).benefitName).toBe("BETA");
    expect(withCompany(withBenefitNameFromCompany(next), "GAMA").benefitName).toBe("GAMA");
  });

  it("starts with its pattern", () => {
    expect(initialFormState().fileName).toBe(DEFAULT_FILE_NAME);
  });
});

describe("writing an officer", () => {
  it("the mail follows the name until it is written by hand, and emptied it suggests again", () => {
    let form = withOfficerField(initialFormState(), 0, "nombre", "Julian");
    expect(officer(form).email).toBe("");
    form = withOfficerField(form, 0, "nombre", "Julian Rojas");
    expect(officer(form).email).toBe("julian.rojas@bancogalicia.com.ar");
    form = withOfficerField(form, 0, "email", "otro@bancogalicia.com.ar");
    form = withOfficerField(form, 0, "nombre", "Julian Otro");
    expect(officer(form).email).toBe("otro@bancogalicia.com.ar");
    form = withOfficerField(form, 0, "email", "");
    expect(officer(form).mailByHand).toBe(false);
    form = withOfficerField(form, 0, "nombre", "Julian Rojas");
    expect(officer(form).email).toBe("julian.rojas@bancogalicia.com.ar");
  });

  it("a phone and a mail are looked at while they are written and on leaving", () => {
    let form = withOfficerField(initialFormState(), 0, "celular", "11");
    expect(officer(form).phoneProblem?.kind).toBe("invalid");
    form = withOfficerField(form, 0, "email", "a@gmail.com");
    expect(officer(form).mailProblem?.kind).toBe("warning");

    const pasted = withPastedPhone(form, 0, "11 4444 5555");
    expect(officer(pasted).phoneProblem?.kind, "what came by code waits").toBe("invalid");
    expect(officer(withFieldChecked(pasted, 0, "celular")).phoneProblem).toBeNull();
    const fixed = {
      ...pasted,
      officers: pasted.officers.with(0, { ...officer(pasted), email: "" }),
    };
    expect(officer(withFieldChecked(fixed, 0, "email")).mailProblem).toBeNull();
    expect(officer(withAllFieldsChecked(fixed)).mailProblem).toBeNull();
    expect(officer(withAllFieldsChecked(fixed)).phoneProblem).toBeNull();
  });

  it("an officer that is not there changes nothing", () => {
    const form = initialFormState();
    expect(withOfficerField(form, 99, "nombre", "x")).toBe(form);
  });
});

describe("the blocks of the officers", () => {
  it("open one at a time up to four", () => {
    let form = initialFormState();
    for (const position of [1, 2, 3]) {
      expect(nextFreeOfficer(form)).toBe(position);
      form = withOfficerAdded(form, position);
    }
    expect(nextFreeOfficer(form)).toBe(-1);
    expect(nextFreeOfficer({ ...form, branches: true })).toBe(4);
  });

  it("the first is emptied and stays, the others go and leave nothing", () => {
    let form = withOfficerAdded(initialFormState(), 1);
    form = withOfficerField(form, 1, "nombre", "Luis Gomez");
    expect(officerHasData(officer(form, 1))).toBe(true);
    form = withOfficerRemoved(form, 1);
    expect(officer(form, 1).shown).toBe(false);
    expect(officer(form, 1).on).toBe(false);
    expect(officer(form, 1).nombre).toBe("");
    expect(officerHasData(officer(form, 1))).toBe(false);

    form = withOfficerField(form, 0, "email", "a@b.com");
    form = withOfficerEmptied(form, 0);
    expect(officer(form).shown).toBe(true);
    expect(officer(form).email).toBe("");
    expect(officer(form).mailByHand).toBe(false);
  });

  it("what is pasted comes as it came, and what was there can come back", () => {
    let form = withOfficerField(initialFormState(), 0, "nombre", "Antes Viejo");
    const before = officer(form);
    form = withPastedOfficer(form, 1, { nombre: "Ana Perez", celular: "11 1", email: "" });
    expect(officer(form, 1).shown).toBe(true);
    expect(officer(form, 1).email, "it is not deduced from the name").toBe("");
    expect(officer(form, 1).mailByHand, "no mail, nothing to keep").toBe(false);
    form = withPastedOfficer(form, 0, { nombre: "Otra", celular: "", email: "o@b.com" });
    expect(officer(form).mailByHand).toBe(true);
    form = withOfficerRestored(form, 0, before);
    expect(officer(form).nombre).toBe("Antes Viejo");
    expect(officer(form).email).toBe(before.email);
  });
});

describe("a saved advisor", () => {
  const SAVED = { nombre: "Julieta Paz", celular: "11 1", email: "guardado@bancogalicia.com.ar" };

  it("fills its place and shows it", () => {
    const form = withSavedAdvisor(initialFormState(), 2, SAVED);
    expect(officer(form, 2)).toMatchObject({ ...SAVED, on: true, shown: true });
  });

  it("leaves what was said about the mail as it was", () => {
    const untouched = withSavedAdvisor(initialFormState(), 0, SAVED);
    expect(officer(untouched).mailByHand).toBe(false);
    const byHand = withOfficerField(initialFormState(), 0, "email", "a@b.com");
    expect(officer(withSavedAdvisor(byHand, 0, SAVED)).mailByHand).toBe(true);
  });

  it("as in the current app: changing the name then replaces its mail by the one suggested", () => {
    const form = withOfficerField(
      withSavedAdvisor(initialFormState(), 0, SAVED),
      0,
      "nombre",
      "Ana Perez",
    );
    expect(officer(form).email).toBe("ana.perez@bancogalicia.com.ar");
  });

  it("the mail of what is pasted does count as written by hand: it is another way in", () => {
    const pasted = withPastedOfficer(initialFormState(), 0, SAVED);
    const form = withOfficerField(pasted, 0, "nombre", "Ana Perez");
    expect(officer(form).email).toBe(SAVED.email);
  });
});

describe("oficiales por sede", () => {
  it("the pin alone is no place, and what was written goes as it is", () => {
    expect(placeText(`${BRANCH_PIN} `)).toBe("");
    expect(placeText("")).toBe("");
    expect(placeText(`  ${BRANCH_PIN} Rosario `)).toBe(`${BRANCH_PIN} Rosario`);
    expect(placeText("Rosario")).toBe("Rosario");
  });

  it("the fields start with the pin, ready to complete, and it does not count as data", () => {
    const form = initialFormState();
    expect(officer(form).ubic).toBe(`${BRANCH_PIN} `);
    expect(officerHasData(officer(form))).toBe(false);
    expect(officerHasData(officer(withOfficerPlace(form, 0, "Rosario")))).toBe(true);
    expect(branchesHaveData(form)).toBe(false);
  });

  it("on, there are eight, and the flyer gets the title and the places", () => {
    let form = withBranches(initialFormState(), true);
    expect(officersLimit(form)).toBe(8);
    form = { ...form, branchesTitle: "  Tus oficiales " };
    form = withOfficerPlace(form, 0, `${BRANCH_PIN} Rosario`);
    const values = valuesOfForm(form, CONTEXT);
    expect(values.sedes).toBe(true);
    expect(values.sedesTit).toBe("Tus oficiales");
    expect(values.ubic1).toBe(`${BRANCH_PIN} Rosario`);
    expect(values.ubic2, "the pin alone").toBe("");
  });

  it("off, the flyer gets nothing of it", () => {
    const form = withOfficerPlace({ ...initialFormState(), branchesTitle: "T" }, 0, "Rosario");
    const values = valuesOfForm(form, CONTEXT);
    expect(values.sedes).toBe(false);
    expect(values.sedesTit).toBe("");
    expect(values.ubic1).toBe("");
  });

  it("the title, a place or an officer past the fourth would be lost", () => {
    const on = withBranches(initialFormState(), true);
    expect(branchesHaveData({ ...on, branchesTitle: " T " })).toBe(true);
    expect(branchesHaveData(withOfficerPlace(on, 2, "Rosario"))).toBe(true);
    expect(branchesHaveData(withOfficerField(on, 5, "nombre", "Ana"))).toBe(true);
    expect(branchesHaveData(withOfficerField(on, 3, "nombre", "Ana")), "the fourth stays").toBe(
      false,
    );
  });

  it("turning it off erases all of that and goes back to the usual four", () => {
    let form = withBranches(initialFormState(), true);
    form = { ...form, branchesTitle: "T" };
    form = withOfficerPlace(form, 0, "Rosario");
    form = withOfficerField(withOfficerAdded(form, 1), 1, "nombre", "Luis");
    form = withOfficerField(withOfficerAdded(form, 7), 7, "nombre", "Carla");
    form = withBranches(form, false);
    expect(form.branches).toBe(false);
    expect(form.branchesTitle).toBe("");
    expect(officer(form).ubic).toBe(`${BRANCH_PIN} `);
    expect(officer(form, 1).nombre, "the second one stays").toBe("Luis");
    expect(officer(form, 7)).toMatchObject({ nombre: "", on: false, shown: false });
    expect(officersLimit(form)).toBe(4);
  });

  it("emptying an officer leaves the pin, for the next one", () => {
    const form = withOfficerPlace(initialFormState(), 0, "Rosario");
    expect(officer(withOfficerEmptied(form, 0)).ubic).toBe(`${BRANCH_PIN} `);
  });
});

const named = (fields: { celular?: string; email?: string }, position = 0) => {
  let form = withOfficerField(initialFormState(), position, "nombre", "Ana");
  form = withOfficerAdded(form, position);
  form = withOfficerField(form, position, "celular", fields.celular ?? "11 3617 9603");
  return withOfficerField(form, position, "email", fields.email ?? "ana@bancogalicia.com.ar");
};

describe("what is wrong and goes on the flyer", () => {
  it("says which field of whom, and only what is invalid", () => {
    expect(problemsOnFlyer(named({}))).toEqual([]);
    expect(problemsOnFlyer(named({ celular: "123" }))).toEqual(["el celular de Ana"]);
    expect(problemsOnFlyer(named({ email: "no-es-mail" }))).toEqual(["el mail de Ana"]);
    expect(problemsOnFlyer(named({ email: "ana@otro.com" })), "a warning stops nothing").toEqual(
      [],
    );
  });

  it("with no name, with the switch off or out of the flyer, there is nothing to say", () => {
    const noName = withOfficerField(initialFormState(), 0, "celular", "123");
    expect(problemsOnFlyer(noName)).toEqual([]);
    expect(problemsOnFlyer({ ...named({ celular: "123" }), officersOn: false })).toEqual([]);
    const beyond = named({ celular: "123" }, 5);
    expect(problemsOnFlyer(beyond), "the sixth, without Oficiales por sede").toEqual([]);
    expect(problemsOnFlyer(withBranches(beyond, true))).toEqual(["el celular de Ana"]);
  });
});

describe("bringing a company", () => {
  const WITH_TWO = company({
    empresa: "Transportes S.R.L.",
    config: "Config 2",
    asesores: [
      { nombre: "Uno Primero", celular: "11 1", email: "uno@bancogalicia.com.ar" },
      { nombre: "Dos Segundo", celular: "11 2", email: "" },
    ],
  });

  it("fills everything, with the name of the file and its cashback", () => {
    const form = withCompanyBrought(initialFormState(), WITH_TWO, 2);
    expect(form.empresa).toBe("Transportes S.R.L.");
    expect(form.fileName).toBe("Flyer_Transportes S.R.L.");
    expect(form.cashback).toBe(2);
    expect(form.chosen).toBe(WITH_TWO);
    expect(officer(form).email, "the mail of the list").toBe("uno@bancogalicia.com.ar");
    expect(officer(form).mailByHand).toBe(true);
    expect(officer(form, 1).email, "without one it is deduced").toBe(
      "dos.segundo@bancogalicia.com.ar",
    );
    expect(officer(form, 1).mailByHand).toBe(false);
    expect(officer(form, 1).shown).toBe(true);
  });

  it("the list rules: without officers the fields are emptied, not dragged", () => {
    const before = withOfficerAdded(
      withOfficerField(
        withOfficerField(initialFormState(), 0, "nombre", "Vieja Oficial"),
        1,
        "nombre",
        "Otra Persona",
      ),
      1,
    );
    const form = withCompanyBrought(before, company({ empresa: "SOLA SA" }), 0);
    expect(officer(form).nombre).toBe("");
    expect(officer(form).shown, "the first stays open").toBe(true);
    expect(officer(form, 1).nombre).toBe("");
    expect(officer(form, 1).shown).toBe(false);
  });

  it("turns the officers on and closes the boxes for pasting", () => {
    const before = { ...initialFormState(), officersOn: false, pasting: [0, 1] };
    const form = withCompanyBrought(before, WITH_TWO, 0);
    expect(form.officersOn).toBe(true);
    expect(form.pasting).toEqual([]);
  });

  it("without a valid cashback the amounts go blank, and the one chosen stays", () => {
    const before = withCashback(initialFormState(), 3);
    const form = withCompanyBrought(before, company({ empresa: "SIN", config: "" }), -1);
    expect(form.noCashback).toBe(true);
    expect(form.cashback).toBe(3);
    expect(withCompanyBrought(form, WITH_TWO, 1).noCashback).toBe(false);
  });

  it("the caps come only with a category", () => {
    const withCaps = company({
      empresa: "TOPES",
      rubro: { opcion: 8, importe: "50000", importe2: "30000" },
    });
    const form = withCompanyBrought(initialFormState(), withCaps, 0);
    expect(form.cap).toBe("50.000");
    expect(form.secondCap).toBe("30.000");

    const same = withCompanyBrought(
      initialFormState(),
      company({ empresa: "IGUAL", rubro: { opcion: 8, importe: "50000", importe2: "50000" } }),
      0,
    );
    expect(same.secondCap).toBe("");
    const noCap = withCompanyBrought(
      initialFormState(),
      company({ empresa: "SIN TOPE", rubro: { opcion: 8 } }),
      0,
    );
    expect(noCap.cap, "the one of the form stays").toBe("24.000");
    const none = withCompanyBrought(form, WITH_TWO, 0);
    expect(none.cap, "no category: nothing is touched").toBe("50.000");
  });

  it("Restaurar cuts the bond with the list", () => {
    const form = restoredForm();
    expect(form.chosen).toBeNull();
    expect(form.fileName).toBe(DEFAULT_FILE_NAME);
    expect(form.officersOn).toBe(true);
  });
});

describe("what the changes of a company are compared against", () => {
  it("an officer off, or all of them with the switch off, count as empty", () => {
    let form = withOfficerField(initialFormState(), 0, "nombre", " Ana Perez ");
    form = withOfficerField(form, 0, "celular", " 11 1 ");
    expect(officersForReview(form)[0]).toEqual({
      nombre: "Ana Perez",
      celular: "11 1",
      email: "ana.perez@bancogalicia.com.ar",
    });
    expect(officersForReview({ ...form, officersOn: false })[0]).toEqual({
      nombre: "",
      celular: "",
      email: "",
    });
    expect(officersForReview(form)).toHaveLength(4);
  });

  it("the category is said only in Rubros", () => {
    const form = { ...initialFormState(), cap: "50.000", secondCap: "30.000" };
    expect(categoryForReview(form, "flyer", 8)).toBeNull();
    expect(categoryForReview(form, "rubros", 8)).toMatchObject({
      opcion: 8,
      importe: "50000",
      importe2: "30000",
    });
    expect(categoryForReview({ ...form, secondCap: "50.000" }, "rubros", 8)?.importe2).toBe("");
  });
});

describe("the amount printed", () => {
  const AMOUNTS = ["$180.000", "$250.000", "$80.000", "$30.000"];

  it("is marked only where a single one goes", () => {
    expect(amountOnFlyer(AMOUNTS, { noCashback: false }, "sueldo")).toBe(1);
    expect(amountOnFlyer(AMOUNTS, { noCashback: false }, "flyer")).toBe(-1);
    expect(amountOnFlyer(AMOUNTS, { noCashback: true }, "sueldo")).toBe(-1);
    expect(amountOnFlyer(["—", "—"], { noCashback: false }, "sueldo")).toBe(-1);
  });
});
