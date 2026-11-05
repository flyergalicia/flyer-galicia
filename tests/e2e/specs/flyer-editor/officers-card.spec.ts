// Protects the rules of the Oficiales card that only a text check guarded in _build.mjs.
import { expect, test } from "../../support/test.ts";

const ANA = { name: "Ana Perez", phone: "11 4444 5555", email: "ana.p@bancogalicia.com.ar" };
const LUIS = { name: "Luis Gomez", phone: "11 4444 6666", email: "luis.g@bancogalicia.com.ar" };
const CARLA = { name: "Carla Diaz", phone: "11 4444 7777", email: "carla.d@bancogalicia.com.ar" };
const SOL = { name: "Sol Ruiz", phone: "11 4444 8888", email: "sol.r@bancogalicia.com.ar" };
const PEOPLE = [ANA, LUIS, CARLA, SOL];
const EMPTY = { name: "", phone: "", email: "" };

test.describe("the officers of a flyer", { tag: "@react" }, () => {
  test("the form starts empty, with one officer and a way to add three more", async ({
    openApp,
  }) => {
    const { officers, flyerEditor, flyerDrawing } = await openApp();

    expect.soft(await flyerEditor.companyName(), "no sample company").toBe("");
    expect.soft(await officers.read(1), "no sample officer").toEqual(EMPTY);
    expect.soft(await officers.shownBlocks(), "only the first one").toEqual([1]);
    expect.soft(await officers.addButtonLabel()).toBe("+ Agregar asesor");

    for (const [position, expected] of [
      [2, [1, 2]],
      [3, [1, 2, 3]],
    ] as const) {
      await officers.pressAdd();
      expect.soft(await officers.shownBlocks(), `officer ${String(position)}`).toEqual(expected);
    }
    await officers.pressAdd();
    expect.soft(await officers.shownBlocks()).toEqual([1, 2, 3, 4]);
    expect.soft(await officers.addButtonLabel(), "four is the limit").toBeNull();

    const drawn = await flyerDrawing.draw();
    expect
      .soft(drawn.texts.map(({ text }) => text).join(" "), "empty fields draw no filler text")
      .not.toMatch(/Nombre de la empresa|Nombre Apellido|Asesor/);
  });

  test("the first one is emptied, the others go away and do not bring their data back", async ({
    openApp,
  }) => {
    const { officers } = await openApp();
    await officers.fill(1, ANA);
    await officers.pressAdd();
    await officers.fill(2, LUIS);

    const labels = (await officers.controls(1)).map(({ label }) => label);
    expect.soft(labels.join(" "), "the first says Borrar").toMatch(/Borrar/);
    expect.soft((await officers.controls(2)).map(({ label }) => label).join(" ")).toMatch(/Quitar/);

    await officers.pressRemove(2);
    expect.soft(await officers.shownBlocks(), "the second goes away").toEqual([1]);
    await officers.pressAdd();
    expect.soft(await officers.read(2), "and comes back empty").toEqual(EMPTY);

    await officers.pressRemove(1);
    expect.soft(await officers.read(1), "the first is emptied").toEqual(EMPTY);
    expect.soft(await officers.shownBlocks(), "and stays").toContain(1);
  });

  test("the mail follows the name until it is written by hand", async ({ openApp }) => {
    const { officers } = await openApp();

    await officers.fill(1, { name: "Julian" });
    expect.soft((await officers.read(1)).email, "one word is not enough").toBe("");
    await officers.fill(1, { name: "Julian Rojas" });
    expect.soft((await officers.read(1)).email).toBe("julian.rojas@bancogalicia.com.ar");
    await officers.fill(1, { name: "Julian De la Vega" });
    expect
      .soft((await officers.read(1)).email, "particles join the surname")
      .toBe("julian.delavega@bancogalicia.com.ar");

    await officers.fill(1, { email: "otro@bancogalicia.com.ar" });
    await officers.fill(1, { name: "Julian Otro" });
    expect
      .soft((await officers.read(1)).email, "by hand it stays")
      .toBe("otro@bancogalicia.com.ar");

    await officers.fill(1, { email: "" });
    await officers.fill(1, { name: "Julian Rojas" });
    expect
      .soft((await officers.read(1)).email, "emptied, it suggests again")
      .toBe("julian.rojas@bancogalicia.com.ar");
  });

  test("the flyer grows with four officers and three share a wide band", async ({ openApp }) => {
    const { officers, flyerDrawing } = await openApp();
    await officers.fill(1, ANA);
    const oneOfficer = await flyerDrawing.draw();

    await officers.pressAdd();
    await officers.fill(2, LUIS);
    await officers.pressAdd();
    await officers.fill(3, CARLA);
    const three = await flyerDrawing.draw();
    const column = (name: string) => three.texts.find(({ text }) => text === name)?.x ?? 0;
    const first = column(ANA.name);
    const second = column(LUIS.name);
    const third = column(CARLA.name);
    expect.soft(second, "in order").toBeGreaterThan(first);
    expect.soft(third, "in order").toBeGreaterThan(second);
    expect
      .soft(Math.abs(third - second - (second - first)), "evenly spread")
      .toBeLessThanOrEqual(2);
    expect.soft(third - first, "over most of the flyer").toBeGreaterThan(three.width * 0.55);

    await officers.pressAdd();
    await officers.fill(4, SOL);
    const four = await flyerDrawing.draw();
    expect
      .soft(four.height, "a second row makes the flyer taller")
      .toBeGreaterThan(oneOfficer.height);
    const drawn = four.texts.map(({ text }) => text);
    for (const { name } of PEOPLE) {
      expect.soft(drawn, `${name} is on the flyer`).toContain(name);
    }
    const row = (name: string) => four.texts.find(({ text }) => text === name)?.y ?? 0;
    expect.soft(row(ANA.name), "two by two").toBe(row(LUIS.name));
    expect.soft(row(CARLA.name)).toBeGreaterThan(row(ANA.name));
  });

  test("the switch hides them without erasing and Restaurar turns it back on", async ({
    openApp,
  }) => {
    const { officers, flyerDrawing, flyerEditor } = await openApp();
    await officers.fill(1, ANA);
    const names = async () => (await flyerDrawing.draw()).texts.map(({ text }) => text);
    expect.soft(await names()).toContain(ANA.name);

    await officers.pressSwitch();
    expect.soft(await officers.switchIsOn()).toBe(false);
    expect.soft(await officers.blocksHiddenBySwitch(), "the card says so").toBe(true);
    expect.soft(await names(), "out of the flyer").not.toContain(ANA.name);

    await officers.pressSwitch();
    expect.soft(await names(), "back with its data").toContain(ANA.name);
    expect.soft(await officers.read(1)).toEqual(ANA);

    await officers.pressSwitch();
    await flyerEditor.restoreDefaults();
    expect.soft(await officers.switchIsOn(), "Restaurar turns it on").toBe(true);
  });

  test("touch screens get bigger targets for Pegar and Borrar", async ({ cloud, openApp }) => {
    cloud.setPermissions("asesor", { pegar_oficial: true });
    const { officers } = await openApp({ touch: true, viewport: { width: 390, height: 844 } });

    const controls = await officers.controls(1);
    expect.soft(controls.length, "Pegar and Borrar").toBe(2);
    for (const { label, height, isKeyboardButton } of controls) {
      expect.soft(height, `${label} can be touched`).toBeGreaterThanOrEqual(32);
      expect.soft(isKeyboardButton, `${label} is a button for the keyboard`).toBe(true);
    }
  });

  test("saved advisors live in the cloud and work on any of the four slots", async ({
    cloud,
    openApp,
  }) => {
    cloud.setPermissions("asesor", { asesores_guardados: true });
    cloud.savedAdvisors = [
      { id: "a1", name: "Ana de sucursal", nombre: "Ana Perez", celular: "11 1", email: "a@b.com" },
    ];
    const { officers, page } = await openApp();
    const replaced: unknown[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/rpc/asesores_replace")) replaced.push(request.postDataJSON());
    });
    await officers.pressAdd();
    await officers.pressAdd();
    await officers.fill(3, CARLA);

    await officers.openSavedAdvisors(3);
    expect
      .soft(await officers.advisorsListTitle(), "the list says which officer")
      .toMatch(/Asesor 3/);
    expect.soft(await officers.savedAdvisors(), "what the cloud has").toEqual(["Ana de sucursal"]);

    await officers.saveCurrentAdvisorAs("Carla");
    await expect.poll(() => replaced.length, "it goes to the cloud").toBe(1);
    expect
      .soft(JSON.stringify(replaced[0]), "with the officer of that slot, not the first")
      .toContain(CARLA.phone);

    await officers.openSavedAdvisors(3);
    await officers.chooseSavedAdvisor("Ana de sucursal");
    expect.soft((await officers.read(3)).name, "choosing fills that slot").toBe("Ana Perez");
    expect.soft((await officers.read(1)).name, "and no other").toBe("");
  });
});
