import { describe, expect, it } from "vitest";
import { parsePeople, peopleReady } from "./people-paste.ts";

describe("the pasted list of a data list", () => {
  it("without titles: one person per line, in any order of columns", () => {
    const rows = parsePeople(
      "Ana Pérez\t11 5555-1234\tLegajo 302\nramon@mail.com\tRamón Díaz\t27-11111111-7\nCarla Funes\nsólo un número\t\n\t11 4444-0000",
      false,
      [],
    );

    expect.soft(rows, "one person per line").toHaveLength(5);
    expect.soft(rows[0], "name, phone and reference in any order").toMatchObject({
      ok: true,
      nombre: "Ana Pérez",
      contacto: "11 5555-1234",
      referencia: "Legajo 302",
    });
    expect.soft(rows[1], "an email is a contact and 11 digits are a CUIL").toMatchObject({
      ok: true,
      nombre: "Ramón Díaz",
      contacto: "ramon@mail.com",
      cuil: "27111111117",
    });
    expect.soft(rows[2], "the name is enough").toMatchObject({ ok: true, nombre: "Carla Funes" });
    expect.soft(rows[2]?.contacto, "the name is enough").toBeFalsy();
    expect
      .soft(rows[4], "no name: with problems")
      .toMatchObject({ ok: false, motivo: "sin nombre" });
  });

  it("with titles: each column by its title, and an empty name stays empty", () => {
    const rows = parsePeople(
      "Apellido y nombre\tCelular\tLegajo\nPaz, Inés\t1155551234\t1200\n\t11 2222-3333\tSector B",
      false,
      [],
    );

    expect.soft(rows, "the row of titles is skipped").toHaveLength(2);
    expect.soft(rows[0], "a short file number is a reference").toMatchObject({
      ok: true,
      nombre: "Paz, Inés",
      contacto: "1155551234",
      referencia: "1200",
    });
    expect
      .soft(rows[1], "another column does not become the name")
      .toMatchObject({ ok: false, motivo: "sin nombre", referencia: "Sector B" });
  });

  it("a text in the column of the CUIL does not become the name either", () => {
    const rows = parsePeople("Nombre\tCUIL\n\tSector B", false, []);

    expect(rows[0]).toMatchObject({ ok: false, nombre: null, referencia: "Sector B" });
  });

  it("the same number is a contact or a reference according to its title", () => {
    const rows = parsePeople("Nombre\tTeléfono\tDNI\nAna\t4444\t30123456", false, []);

    expect(rows[0]).toMatchObject({ contacto: "4444", referencia: "30123456" });
  });

  it("does not take a row with only one title as titles", () => {
    expect(parsePeople("Nombre\nAna", false, [])).toHaveLength(2);
  });

  it("titles only count on the first row", () => {
    const rows = parsePeople("Ana\t111\nNombre\tTeléfono", false, []);

    expect(rows).toHaveLength(2);
  });

  it("does not repeat a CUIL within the same list", () => {
    const rows = parsePeople("Juan Gil\t20-12345678-6\nPedro Ruiz\t20-12345678-6", false, [
      { cuil: "27111111117" },
    ]);

    expect.soft(rows[0]?.ok).toBe(true);
    expect.soft(rows[1]?.ok).toBe(false);
    expect.soft(rows[1]?.motivo).toMatch(/ya est/);
  });

  it("does not take a CUIL that was already there", () => {
    const rows = parsePeople("Ana\t27-11111111-7", false, [{ cuil: "27111111117" }]);

    expect(rows[0]?.motivo).toBe("ya está en la lista");
  });

  it("does not take a CUIL with a wrong check digit", () => {
    const rows = parsePeople("Ana\t20-12345678-0", false, []);

    expect(rows[0]).toMatchObject({ ok: false, motivo: "CUIL inválido" });
  });

  it("reads columns separated by two blanks or a semicolon when there is no tab", () => {
    expect
      .soft(parsePeople("Ana Pérez  11 5555-1234", false, [])[0]?.contacto)
      .toBe("11 5555-1234");
    expect.soft(parsePeople("Ana Pérez;Legajo 3", false, [])[0]?.referencia).toBe("Legajo 3");
  });

  it("skips empty lines and joins the blanks of a name", () => {
    const rows = parsePeople("\n  \nAna\t\nLuis\t\t \n", false, []);

    expect.soft(rows.map(({ nombre }) => nombre)).toEqual(["Ana", "Luis"]);
    expect.soft(parsePeople("Ana   María\tx", false, [])[0]?.nombre).toBe("Ana María");
  });

  it("cuts what is too long", () => {
    const long = "a".repeat(200);

    expect.soft(parsePeople(long, false, [])[0]?.nombre).toHaveLength(120);
    expect.soft(parsePeople(`Ana\t${long}`, false, [])[0]?.referencia).toHaveLength(120);
  });
});

describe("with packages", () => {
  it("places each cell and warns about repeated CUILs", () => {
    const rows = parsePeople(
      "Nombre\tCUIL\tPaquete\nAna Pérez\t20-12345678-6\tPlus Gold\nEminent Black\tLuis Gómez\nPedro Sin\t27-11111111-7\nJuan Black",
      true,
      [{ cuil: "27111111117" }],
    );

    expect.soft(rows, "the row of titles is skipped").toHaveLength(4);
    expect
      .soft(rows[0], "name, CUIL and package in their place")
      .toMatchObject({ ok: true, nombre: "Ana Pérez", cuil: "20123456786", paquete: "gold" });
    expect
      .soft(rows[1], "the package may come before the name")
      .toMatchObject({ ok: true, nombre: "Luis Gómez", paquete: "black" });
    expect.soft(rows[2]?.ok, "a CUIL already on the list is not taken").toBe(false);
    expect.soft(rows[2]?.motivo, "and it says so").toMatch(/ya est/);
    expect
      .soft(rows[3], "a surname that looks like a package stays as the name")
      .toMatchObject({ ok: true, nombre: "Juan Black", paquete: null });
  });

  it("does not read packages on a data list", () => {
    expect(parsePeople("Ana\tPlus", false, [])[0]).toMatchObject({
      paquete: null,
      referencia: "Plus",
    });
  });
});

describe("the people that are ready", () => {
  it("are the good ones, up to the most a list has", () => {
    const lines = Array.from({ length: 1005 }, (_, index) => `Persona ${String(index)}`);

    expect.soft(peopleReady(lines.join("\n"))).toHaveLength(1000);
    expect.soft(peopleReady("Ana\n\t111")).toHaveLength(1);
  });
});
