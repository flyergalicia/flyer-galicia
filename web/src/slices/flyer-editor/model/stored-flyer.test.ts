import { describe, expect, it } from "vitest";
import type { FlyerValues } from "@/shared/flyer-engine/index.ts";
import {
  BRANCH_PIN,
  initialFormState,
  withBranches,
  withOfficerAdded,
  withOfficerField,
  withPastedOfficer,
} from "./form-state.ts";
import { formOfStored } from "./stored-flyer.ts";

function stored(values: Partial<FlyerValues>, ac = 0) {
  return { v: { empresa: "ACME SA", ...values }, ac };
}

const officer = (form: ReturnType<typeof initialFormState>, position = 0) => {
  const found = form.officers[position];
  if (!found) throw new Error("There is no such officer");
  return found;
};

describe("a stored flyer back in the form", () => {
  it("brings its company and officers, without the Cel: the flyer draws", () => {
    const form = formOfStored(
      initialFormState(),
      stored({
        has1: true,
        nombre: "Ana",
        celular: "Cel: 11 4444 5555",
        email: "ana@b.com",
        has2: true,
        nombre2: "Luis",
      }),
    );
    expect(form.empresa).toBe("ACME SA");
    expect(officer(form)).toMatchObject({
      nombre: "Ana",
      celular: "11 4444 5555",
      email: "ana@b.com",
    });
    expect(officer(form, 1)).toMatchObject({ nombre: "Luis", on: true, shown: true });
  });

  it("the officers of the flyer before do not stay stuck", () => {
    let before = withPastedOfficer(initialFormState(), 1, {
      nombre: "Otro",
      celular: "1",
      email: "",
    });
    before = withOfficerField(withOfficerAdded(before, 2), 2, "nombre", "Tercero");
    const form = formOfStored(before, stored({ has1: true, nombre: "Ana" }));
    expect(officer(form, 1)).toMatchObject({ nombre: "", celular: "", on: false, shown: false });
    expect(officer(form, 2).nombre).toBe("");
  });

  it("the first block stays open even with nobody in it", () => {
    const form = formOfStored(initialFormState(), stored({ has1: false, nombre: "" }));
    expect(officer(form)).toMatchObject({ nombre: "", on: true, shown: true });
  });

  it("from before each officer had its switch, the name says it", () => {
    const form = formOfStored(initialFormState(), stored({ nombre: "Ana" }));
    expect(officer(form).nombre).toBe("Ana");
  });

  it("stored with the officers off, the names come back with the switch off", () => {
    const form = formOfStored(
      initialFormState(),
      stored({ sinOficiales: true, has1: false, nombre: "Ana", has2: false, nombre2: "Luis" }),
    );
    expect(form.officersOn).toBe(false);
    expect(officer(form, 1)).toMatchObject({ nombre: "Luis", shown: true });
  });

  it("with Oficiales por sede it brings the eight, their places and the title", () => {
    const form = formOfStored(
      initialFormState(),
      stored({
        sedes: true,
        sedesTit: "Tus oficiales",
        has1: true,
        nombre: "Ana",
        ubic1: "Rosario",
        has8: true,
        nombre8: "Carla",
      }),
    );
    expect(form.branches).toBe(true);
    expect(form.branchesTitle).toBe("Tus oficiales");
    expect(officer(form).ubic).toBe("Rosario");
    expect(officer(form, 1).ubic, "the pin, ready to complete").toBe(`${BRANCH_PIN} `);
    expect(officer(form, 7)).toMatchObject({ nombre: "Carla", shown: true });
  });

  it("without it, it turns off, and a flyer of four never opens the rest", () => {
    const on = withBranches(initialFormState(), true);
    const form = formOfStored(
      { ...on, branchesTitle: "T" },
      stored({ has5: true, nombre5: "Quinto" }),
    );
    expect(form.branches).toBe(false);
    expect(form.branchesTitle).toBe("");
    expect(officer(form, 4)).toMatchObject({ nombre: "", shown: false });
  });

  it("the cashback it had, or none if it was without", () => {
    expect(formOfStored(initialFormState(), stored({}, 2))).toMatchObject({
      cashback: 2,
      noCashback: false,
    });
    const before = { ...initialFormState(), cashback: 3 };
    expect(formOfStored(before, stored({ nocb: true }, 1))).toMatchObject({
      cashback: 3,
      noCashback: true,
    });
  });

  it("in Rubros, the sign: written by hand if it differs from the company", () => {
    const form = formOfStored(
      initialFormState(),
      stored({ benef: true, benefNombre: "Otra", importe: "$10.000", importe2: "$20.000" }),
    );
    expect(form).toMatchObject({
      benefitName: "Otra",
      benefitNameByHand: true,
      cap: "10.000",
      secondCap: "20.000",
    });
    const same = formOfStored(
      initialFormState(),
      stored({ benef: true, benefNombre: "ACME SA", importe: "$10.000", importe2: "$10.000" }),
    );
    expect(same).toMatchObject({ benefitNameByHand: false, secondCap: "" });
    const empty = formOfStored(initialFormState(), stored({ benef: true }));
    expect(empty).toMatchObject({ benefitName: "", benefitNameByHand: true, cap: "" });
  });

  it("outside Rubros the sign is not touched", () => {
    const before = { ...initialFormState(), benefitName: "Mio", cap: "5.000" };
    expect(formOfStored(before, stored({}))).toMatchObject({ benefitName: "Mio", cap: "5.000" });
  });

  it("no row of the list of companies stays tied to it, and the name of the file stays", () => {
    const before = {
      ...initialFormState(),
      note: "Una nota",
      fileName: "Mi nombre",
      fileNameByHand: true,
    };
    const form = formOfStored(before, stored({}));
    expect(form).toMatchObject({
      chosen: null,
      note: "",
      fileName: "Mi nombre",
      fileNameByHand: true,
    });
  });

  it("what was said about the mail stays as it was", () => {
    const before = withOfficerField(initialFormState(), 0, "email", "mio@b.com");
    const form = formOfStored(before, stored({ has1: true, nombre: "Ana", email: "otro@b.com" }));
    expect(officer(form).mailByHand).toBe(true);
  });
});
