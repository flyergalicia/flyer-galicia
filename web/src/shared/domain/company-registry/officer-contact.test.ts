import { describe, expect, it } from "vitest";
import { parseContact } from "./officer-contact.ts";

describe("the phone of a pasted text", () => {
  const cases: readonly (readonly [string, string])[] = [
    ["11 3617-9603", "11 3617-9603"],
    ["+54 9 11 3617 9603", "11 3617-9603"],
    ["0054 11 3617 9603", "11 3617-9603"],
    ["011 3617 9603", "11 3617-9603"],
    ["11 15 3617 9603", "11 3617-9603"],
    ["15 3617-9603", "11 3617-9603"],
    ["(351) 615-1234", "351 615-1234"],
    ["2966 123456", "2966 12-3456"],
  ];
  for (const [text, phone] of cases) {
    it(`"${text}" is ${phone}`, () => {
      expect(parseContact(text).celular).toBe(phone);
    });
  }

  it("a code stuck to letters is not a phone, nor is it glued to the next one", () => {
    expect(parseContact("EMREN050215\n11 3617-9603").celular).toBe("11 3617-9603");
  });

  it("a tax id is not a phone", () => {
    const contact = parseContact("CUIT 30-71234567-8");
    expect(contact.celular).toBe("");
    expect(contact.ignorado).toContain("un CUIT");
    expect(parseContact("cuit: 30712345678").celular).toBe("");
  });

  it("a date is not a phone", () => {
    const contact = parseContact("Reunión 12/10/2026");
    expect(contact.celular).toBe("");
    expect(contact.ignorado).toContain("una fecha");
  });

  it("two lines are two numbers", () => {
    const contact = parseContact("11 3617 9603\n11 4444 5555");
    expect(contact.celular).toBe("11 3617-9603");
    expect(contact.ignorado.join(" ")).toMatch(/otro número \(11 4444 5555\)/);
  });

  it("the one labelled as a mobile wins over a landline", () => {
    expect(parseContact("Tel: 11 4444 5555\nCel: 11 3617 9603").celular).toBe("11 3617-9603");
  });

  it("the same number twice is one", () => {
    expect(parseContact("11 3617 9603, 11 3617 9603").ignorado).toEqual([]);
  });

  it("what looks like a phone and is not one is said", () => {
    const contact = parseContact("Interno 1234567");
    expect(contact.celular).toBe("");
    expect(contact.avisos.join(" ")).toMatch(/"1234567" no parece un celular argentino/);
  });

  it("too many digits are not a phone", () => {
    expect(parseContact("1234567890123456").celular).toBe("");
  });

  it("no digit is ever changed", () => {
    const phone = "11 1536 1796";
    expect(parseContact(phone).celular.replaceAll(/\D/g, "")).toBe(phone.replaceAll(/\D/g, ""));
  });
});

describe("the mail of a pasted text", () => {
  it("the one of the bank goes first, whatever the order", () => {
    const contact = parseContact("x@gmail.com ana.perez@BancoGalicia.com.ar");
    expect(contact.email).toBe("ana.perez@bancogalicia.com.ar");
    expect(contact.ignorado.join(" ")).toMatch(/1 mail\(s\) ajenos a Galicia/);
  });

  it("two of the bank: the first, and it says so", () => {
    const contact = parseContact("a.b@bancogalicia.com.ar c.d@bancogalicia.com.ar");
    expect(contact.email).toBe("a.b@bancogalicia.com.ar");
    expect(contact.avisos.join(" ")).toMatch(/hay 2 mails de Galicia/);
  });

  it("another one is taken, and it says to look at it", () => {
    const contact = parseContact("ana@gmail.com");
    expect(contact.email).toBe("ana@gmail.com");
    expect(contact.avisos.join(" ")).toMatch(/no termina en @bancogalicia.com.ar/);
  });

  it("no mail is no mail: it is not deduced", () => {
    expect(parseContact("Ana Perez").email).toBe("");
  });
});

describe("the name of a pasted text", () => {
  it("the mail tells where it is", () => {
    const contact = parseContact(
      "Hola, te paso los datos: Julieta De Santis, 11 3617-9603, julieta.desantis@bancogalicia.com.ar",
    );
    expect(contact.nombre).toBe("Julieta De Santis");
    expect(contact.avisos).toContain("ubicado por el mail");
  });

  it("the mail may say nothing about the name: then it is deduced from the text", () => {
    const contact = parseContact("Ana Perez\nxyz@bancogalicia.com.ar");
    expect(contact.nombre).toBe("Ana Perez");
    expect(contact.avisos).toContain("deducido del texto — verificalo");
  });

  it("each word gets its capital, and an initial stays one", () => {
    expect(parseContact("JULIETA a. DE SANTIS").nombre).toBe("Julieta A. De Santis");
  });

  it("a role in front is not part of the name", () => {
    expect(parseContact("Mi asesor es: Ana Perez").nombre).toBe("Ana Perez");
    expect(parseContact("Oficial: Luis Gomez, 11 3617 9603").nombre).toBe("Luis Gomez");
  });

  it("a line with a role wins over one that is first", () => {
    expect(parseContact("Empresa Sur\nCarla Gomez\nContacto: Luis Perez").nombre).toBe(
      "Luis Perez",
    );
  });

  it("a phrase is not a name", () => {
    expect(parseContact("Hola buenas tardes").nombre).toBe("");
    expect(parseContact("gracias").nombre).toBe("");
    expect(parseContact("de la").nombre).toBe("");
    expect(parseContact("uno dos tres cuatro cinco seis").nombre).toBe("");
  });

  it("a code does not stay as a surname", () => {
    expect(parseContact("Ana Perez EMREN050215").nombre).toBe("Ana Perez");
  });

  it("nothing recognizable leaves everything empty", () => {
    expect(parseContact("???")).toEqual({
      nombre: "",
      celular: "",
      email: "",
      avisos: [],
      ignorado: [],
    });
  });

  it("particles alone in the mail's window are skipped", () => {
    expect(parseContact("de la Ana Perez ana.perez@bancogalicia.com.ar").nombre).toBe("Ana Perez");
  });

  it("the shortest window around the mail wins", () => {
    expect(parseContact("Ana Perez Lopez Diaz ana.perez@bancogalicia.com.ar").nombre).toBe(
      "Ana Perez",
    );
  });
});
