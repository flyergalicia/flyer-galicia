import { describe, expect, it } from "vitest";
import { initialFormState, type OfficerDraft } from "./form-state.ts";
import { pasteOutcome } from "./paste-officer.ts";

const EMPTY: OfficerDraft = (() => {
  const [first] = initialFormState().officers;
  if (!first) throw new Error("There is no first officer");
  return first;
})();
const FULL: OfficerDraft = {
  ...EMPTY,
  nombre: "Antes Viejo",
  celular: "11 1111 1111",
  email: "a@b.com",
};

describe("what is pasted", () => {
  it("a person fills what it finds", () => {
    const outcome = pasteOutcome(
      "Julieta A. De Santis\nCel: 11 3617-9603\njulieta.desantis@bancogalicia.com.ar",
      EMPTY,
    );
    expect(outcome.change).toEqual({
      kind: "person",
      nombre: "Julieta A. De Santis",
      celular: "11 3617-9603",
      email: "julieta.desantis@bancogalicia.com.ar",
    });
    expect(outcome.recognized).toEqual({ nombre: true, celular: true, email: true });
  });

  it("empties what it does not find, and says so", () => {
    const outcome = pasteOutcome("Oficial: Ana Perez", FULL);
    expect(outcome.change).toEqual({ kind: "person", nombre: "Ana Perez", celular: "", email: "" });
    expect(outcome.lines.join(" ")).toMatch(/Celular: no encontré — lo dejé vacío/);
    expect(outcome.lines.join(" ")).toMatch(/Mail: no venía en el texto — lo dejé vacío/);
  });

  it("with no name either, it says it left it empty", () => {
    const outcome = pasteOutcome("ana@bancogalicia.com.ar", FULL);
    expect(outcome.lines.join(" ")).toMatch(/Nombre: no encontré — lo dejé vacío/);
  });

  it("the mail is never deduced from the name", () => {
    const outcome = pasteOutcome("Oficial: Ana Perez\n11 4444 5555", EMPTY);
    expect(outcome.change).toMatchObject({ email: "" });
    expect(outcome.lines.join(" ")).toMatch(/Mail: no venía en el texto — cargalo a mano/);
  });

  it("a lone phone touches only the phone", () => {
    const outcome = pasteOutcome("11 4444 5555", FULL);
    expect(outcome.change).toEqual({ kind: "phone", celular: "11 4444-5555" });
    expect(outcome.lines).toEqual([]);
  });

  it("nothing recognized is nothing", () => {
    const outcome = pasteOutcome("???", FULL);
    expect(outcome.change).toEqual({ kind: "nothing" });
  });

  it("tells what it took out of the phone", () => {
    const outcome = pasteOutcome("Ana Perez +54 9 11 4444-5555", EMPTY);
    expect(outcome.lines.join(" ")).toMatch(
      /Celular: pegaste "\+54 9 11 4444-5555" → quedó "11 4444-5555" \(saqué: \+54 9\)/,
    );
    const same = pasteOutcome("Ana Perez 11 4444 5555", EMPTY);
    expect(same.lines.join(" "), "the same digits say nothing").not.toMatch(/pegaste/);
  });

  it("capitalizes what it says, and tells what it ignored", () => {
    const outcome = pasteOutcome("Ana Perez ana@gmail.com ana.perez@bancogalicia.com.ar", EMPTY);
    expect(outcome.ignored).toEqual(["1 mail(s) ajenos a Galicia"]);
    expect(outcome.lines[0]?.charAt(0)).toBe(outcome.lines[0]?.charAt(0).toUpperCase());
  });
});
