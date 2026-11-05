// Protects the "pegar:" and "portapapeles" rules that only a text check guarded in _build.mjs.
import { type Cloud } from "../../support/cloud/index.ts";
import { type OpenedApp } from "../../support/open-app.ts";
import { expect, test } from "../../support/test.ts";

async function openWithPaste(cloud: Cloud, openApp: (o?: object) => Promise<OpenedApp>) {
  cloud.setPermissions("asesor", { pegar_oficial: true });
  return openApp();
}

test.describe("pasting the data of an officer", { tag: "@react" }, () => {
  test("a signature gives name, phone and mail, with every digit as it came", async ({
    cloud,
    openApp,
  }) => {
    const { officers } = await openWithPaste(cloud, openApp);
    await officers.pressPaste(1);

    const outcome = await officers.pasteText(
      1,
      "Julieta A. De Santis\nEjecutiva de cuentas\nCel: 11 3617-9603\njulieta.desantis@bancogalicia.com.ar",
    );

    expect.soft(outcome.recognized).toEqual({ name: true, phone: true, email: true });
    const fields = await officers.read(1);
    expect.soft(fields.name, "the name is found through the mail").toBe("Julieta A. De Santis");
    expect.soft(fields.phone, "the phone keeps its digits").toBe("11 3617-9603");
    expect.soft(fields.email).toBe("julieta.desantis@bancogalicia.com.ar");
  });

  test("the mail of the bank wins over any other, and another one is warned about", async ({
    cloud,
    openApp,
  }) => {
    const { officers } = await openWithPaste(cloud, openApp);
    await officers.pressPaste(1);

    const both = await officers.pasteText(
      1,
      "Ana Perez ana@gmail.com ana.perez@bancogalicia.com.ar 11 4444 5555",
    );
    expect
      .soft((await officers.read(1)).email, "the one of the bank")
      .toBe("ana.perez@bancogalicia.com.ar");
    expect.soft(both.text, "it says what it left out").toMatch(/1 mail\(s\) ajenos a Galicia/);

    const foreign = await officers.pasteText(1, "Ana Perez ana@gmail.com 11 4444 5555");
    expect.soft((await officers.read(1)).email, "taken as it came").toBe("ana@gmail.com");
    expect.soft(foreign.text, "and warned about").toMatch(/no termina en @bancogalicia\.com\.ar/);
  });

  test("the mail is never deduced from the name", async ({ cloud, openApp }) => {
    const { officers } = await openWithPaste(cloud, openApp);
    await officers.pressPaste(1);

    const outcome = await officers.pasteText(1, "Oficial: Ana Perez\n11 4444 5555");

    expect.soft((await officers.read(1)).name).toBe("Ana Perez");
    expect.soft((await officers.read(1)).email, "no arroba in the text, no mail").toBe("");
    expect.soft(outcome.recognized.email).toBe(false);
    expect.soft(outcome.text).toMatch(/no ven.a en el texto/);
  });

  test("what looks like a mail without its at sign is not a mail", async ({ cloud, openApp }) => {
    const { officers } = await openWithPaste(cloud, openApp);
    await officers.pressPaste(1);

    const outcome = await officers.pasteText(
      1,
      "Oficial: Ana Perez\nana.perez.bancogalicia.com.ar\n11 4444 5555",
    );

    expect.soft((await officers.read(1)).email).toBe("");
    expect.soft(outcome.recognized.email).toBe(false);
  });

  test("an employee code mixed with letters does not reach the name or the phone", async ({
    cloud,
    openApp,
  }) => {
    const { officers } = await openWithPaste(cloud, openApp);
    await officers.pressPaste(1);

    await officers.pasteText(1, "Oficial: Maria Lopez EMREN050215 SUC0082\n11 5555 6666");

    const fields = await officers.read(1);
    expect.soft(fields.name, "no EMREN or SUC in the name").toBe("Maria Lopez");
    expect
      .soft(fields.phone, "the code does not join the phone of the next line")
      .toBe("11 5555-6666");
  });

  test("phone numbers are told from tax ids and dates, and read in groups of digits", async ({
    cloud,
    openApp,
  }) => {
    const { officers } = await openWithPaste(cloud, openApp);
    await officers.pressPaste(1);

    const taxId = await officers.pasteText(
      1,
      "Ana Perez ana.perez@bancogalicia.com.ar CUIT 30-71234567-8 fecha 12/10/2026",
    );
    expect.soft((await officers.read(1)).phone, "a CUIT is not a phone").toBe("");
    expect.soft(taxId.text, "it says what it ignored").toMatch(/un CUIT/);
    expect.soft(taxId.text).toMatch(/una fecha/);

    await officers.pasteText(1, "Ana Perez ana.perez@bancogalicia.com.ar +54 9 11 4444-5555");
    expect.soft((await officers.read(1)).phone, "prefixes go, digits stay").toBe("11 4444-5555");

    await officers.pasteText(1, "Ana Perez ana.perez@bancogalicia.com.ar 11.4444.5555");
    expect.soft((await officers.read(1)).phone, "any separator inside").toBe("11 4444-5555");

    const twoLines = await officers.pasteText(
      1,
      "Ana Perez ana.perez@bancogalicia.com.ar\nTel: 11 4000 0000\nCel: 11 4444 5555",
    );
    expect.soft((await officers.read(1)).phone, "labelled mobile wins").toBe("11 4444-5555");
    expect.soft(twoLines.text, "two lines are two numbers").toMatch(/otro n.mero/);
  });

  test("a phone without area code is read as 15 plus eight digits", async ({ cloud, openApp }) => {
    const { officers } = await openWithPaste(cloud, openApp);
    await officers.pressPaste(1);

    await officers.pasteText(1, "Ana Perez ana.perez@bancogalicia.com.ar 15 4444 5555");

    expect
      .soft((await officers.read(1)).phone, "the 15 goes and Buenos Aires comes")
      .toBe("11 4444-5555");
  });

  test("it completes what it finds, cleans the rest and can be undone", async ({
    cloud,
    openApp,
  }) => {
    const { officers } = await openWithPaste(cloud, openApp);
    await officers.fill(1, { name: "Antes Viejo", phone: "11 1111 1111", email: "a@b.com" });
    await officers.pressPaste(1);

    const person = await officers.pasteText(1, "Oficial: Ana Perez");
    expect.soft(await officers.read(1), "a person leaves no data of another person").toEqual({
      name: "Ana Perez",
      phone: "",
      email: "",
    });
    expect.soft(person.text, "and says what it emptied").toMatch(/lo dej. vac.o/);

    await officers.undoPaste(1);
    expect.soft(await officers.read(1), "Deshacer brings back what was there").toEqual({
      name: "Antes Viejo",
      phone: "11 1111 1111",
      email: "a@b.com",
    });

    await officers.pasteText(1, "11 4444 5555");
    expect.soft(await officers.read(1), "a lone phone touches only the phone").toEqual({
      name: "Antes Viejo",
      phone: "11 4444-5555",
      email: "a@b.com",
    });
  });

  test("the button comes with the faculty, one per officer, also with the keyboard", async ({
    cloud,
    openApp,
  }) => {
    const { officers } = await openWithPaste(cloud, openApp);
    await officers.pressAdd();

    expect.soft(await officers.pasteOffered(), "one per officer in sight").toEqual([1, 2]);

    await officers.pressPasteWithKeyboard(2);
    expect.soft(await officers.pasteBoxOpen(2), "Enter opens it").toBe(true);
    expect.soft(await officers.pasteBoxOpen(1), "and only that one").toBe(false);
  });

  test("without the faculty there is no button", async ({ cloud, openApp }) => {
    cloud.setPermissions("asesor", { pegar_oficial: false });
    const { officers } = await openApp();

    expect.soft(await officers.pasteOffered()).toEqual([]);
  });

  test("the box closes when a company of the registry fills the officers", async ({
    cloud,
    openApp,
  }) => {
    // Bringing a company takes the search, which comes with its own faculty.
    cloud.setPermissions("asesor", { padron_buscar: true });
    const { officers, companyRegistry } = await openWithPaste(cloud, openApp);
    await officers.pressPaste(1);
    expect.soft(await officers.pasteBoxOpen(1)).toBe(true);

    await companyRegistry.applyCompany({
      name: "ACME SA",
      cashback: "BAU",
      officers: [{ name: "Ana Perez", phone: "11 4444 5555" }],
    });

    expect
      .soft(await officers.pasteBoxOpen(1), "it no longer serves and hides the form")
      .toBe(false);
  });
});
