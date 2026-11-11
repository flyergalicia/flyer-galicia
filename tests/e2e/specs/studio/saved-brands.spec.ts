// Replaces pruebas/t70_marcas_guardadas.cjs.
import { designData } from "../../support/cloud/designs.ts";
import { type FlyerLayout, type PlacementBar } from "../../support/driver/saved-brands.ts";
import { expect, test } from "../../support/test.ts";

const STRIP_BOX = { x: 140, y: 2650, width: 1000, height: 230 };
const COTO = { x: 730, y: 1310 };
const VEA = { x: 905, y: 1310 };
const TOLEDO = { x: 710, y: 1465 };
const SET_NAME = "Neuquén prueba";
const OTHER_PROVINCE = "ZZZ PRUEBA";
const COTO_NAME = /coto/i;
const MOVED_STRIP_Y = 700;
const STRIP_SECTION_Y = 2590;
const GRID_SHIFT = 720;
const NEW_STRIP_BOX = { x: 140, y: 2000, width: 1000, height: 230 };
const NEAR_PX = 4;
const MOVED_NEAR_PX = 14;

const near = (value: number, target: number, margin: number) =>
  Math.abs(Math.round(value) - target) < margin;
const isClean = (traces: { placing: boolean; bar: boolean; marks: boolean }) =>
  !traces.placing && !traces.bar && !traces.marks;

test("a set of brands is saved and applied, wherever the new model has those things", async ({
  cloud,
  openApp,
}) => {
  test.setTimeout(180_000);
  // A flyer to go to while something is being placed.
  cloud.addFlyerOption({
    option: 11,
    name: "Once",
    image: "flyer_t7.jpg?v=11",
    legal: "Legal 11",
  });
  cloud.setPermissions("admin", { opcion_11: true });
  const app = await openApp({ user: "admin" });
  const brands = app.savedBrands;
  let bar: PlacementBar;
  let layout: FlyerLayout;
  await app.logoEditor.enter();
  await app.logoEditor.waitForBrandCatalog();
  expect
    .soft(await brands.buttonVisible(), 'the button "Marcas guardadas" is in the bar')
    .toBe(true);

  const { stripBrands, original, originalStrip, originalCoto } =
    await test.step("a flyer is prepared with a strip, supermarkets and an empty place", async () => {
      // A strip of 3 brands, Jumbo→Coto and Disco→Vea with their days, Toledo empty
      const chosenBrands = await brands.buildStrip(STRIP_BOX, 3);
      await brands.putSupermarket(COTO, "coto");
      await brands.putSupermarket(VEA, "vea");
      await brands.emptyPlace(TOLEDO);
      await brands.finishChanges();
      const layoutBefore = await brands.layout(COTO_NAME);
      const stripBefore = layoutBefore.strip ?? { x: 0, y: 0, width: 0, height: 0 };
      const cotoBefore = layoutBefore.brand ?? { centerX: 0, centerY: 0 };
      // The second brand of the strip only has a promotion in another province, for the warning
      await brands.brandOnlyInProvince(chosenBrands[1] ?? "", OTHER_PROVINCE);
      return {
        stripBrands: chosenBrands,
        original: layoutBefore,
        originalStrip: stripBefore,
        originalCoto: cotoBefore,
      };
    });

  const { id, province } =
    await test.step("it is saved as a new one, with a province", async () => {
      // Saving a new one, with a chosenProvince
      await brands.openSaveWindow();
      expect
        .soft((await brands.saveWindow()).replacing, "the first time it does not offer to replace")
        .toBeNull();
      const chosenProvince = await brands.pickProvinceOtherThan(OTHER_PROVINCE);
      expect.soft(chosenProvince, "a chosenProvince can be chosen").not.toBe("");
      await brands.saveAs(SET_NAME);
      const row = cloud.designs.find(({ nombre }) => nombre === SET_NAME);
      expect.soft(row?.tipo, "it is saved as a combination").toBe("combinacion");
      const data = designData(row);
      const stripItem = data.items.find(({ tipo }) => tipo === "franja");
      expect
        .soft(data.grupos, "the supermarkets and the empty place make one group")
        .toHaveLength(1);
      expect.soft(data.grupos?.[0]?.items, "of 3 items").toHaveLength(3);
      expect
        .soft(data.grupos?.[0]?.ctx.length, "with what surrounds them")
        .toBeGreaterThanOrEqual(6);
      expect
        .soft(stripItem?.ctx?.length, "the strip is saved with the boxes of its logos")
        .toBeGreaterThanOrEqual(3);
      expect.soft(data.prov, "it keeps the chosenProvince").toBe(chosenProvince);
      expect.soft(data.resumen, "what it holds").toMatch(/franja/);
      expect.soft(data.flyer, "and of which flyer").toBeTruthy();
      expect
        .soft(
          data.items.map(({ tipo }) => tipo),
          "the items it holds",
        )
        .toEqual(["franja", "logo", "logo", "vacio"]);

      return { id: row?.id ?? "", province: chosenProvince };
    });

  await test.step("the list shows what each one holds", async () => {
    // The list: thumbnail, what it holds, which flyer; the old ones with a warning
    const row = cloud.designs.find((design) => design.id === id);
    if (row) {
      cloud.designs.push({
        ...row,
        id: "d900-0000-4000-8000-000000000000",
        nombre: "Vieja",
        datos: { v: 1, ancho: 1240, alto: 3000, items: [] },
        miniatura: "",
        updated_at: "2026-10-22T10:00:00.000Z",
      });
    }
    const list = await brands.readList();
    const saved = list.find(({ title }) => title === SET_NAME);
    const old = list.find(({ title }) => title === "Vieja");
    expect.soft(saved?.hasImage, "the row has a thumbnail").toBe(true);
    expect.soft(saved?.content, "what it holds").toMatch(/1 franja, 2 logos, 1 lugar vac.o/);
    expect.soft(saved?.content, "and which flyer").toMatch(/del flyer/);
    expect.soft(saved?.isOutdated, "with no warning").toBe(false);
    expect.soft(old?.isOutdated, "one saved with the earlier version warns").toBe(true);
    expect.soft(old?.hasImage, "and has no thumbnail").toBe(false);
    cloud.designs.splice(
      cloud.designs.findIndex(({ nombre }) => nombre === "Vieja"),
      1,
    );
    await brands.closeList();
  });

  await test.step("on the same flyer it is seen placed before deciding", async () => {
    // 1) The same flyer: "Así queda", seen placed before deciding
    await brands.clearFlyer();
    bar = await brands.apply(id);
    expect.soft(bar.mode, "it found everything: it shows it placed").toBe("preview");
    expect.soft(bar.title, 'under "Así queda"').toMatch(/As. queda/);
    expect.soft(bar.markedOnFlyer, "with each thing marked").toBeGreaterThanOrEqual(4);
    expect
      .soft(bar.buttons, "offering to keep, to review or to go back")
      .toEqual(["restore", "review", "keep"]);
    expect
      .soft(bar.text, "it warns of the brand with no promo in that province")
      .toMatch(/sin promo en/i);
    layout = await brands.layout(COTO_NAME);
    expect
      .soft(near(layout.strip?.x ?? -999, originalStrip.x, NEAR_PX), "the strip comes back at x")
      .toBe(true);
    expect
      .soft(near(layout.strip?.y ?? -999, originalStrip.y, NEAR_PX), "the strip comes back at y")
      .toBe(true);
    expect.soft(layout.stripBrands, "with its brands in order").toEqual(stripBrands);
    expect
      .soft(near(layout.brand?.centerX ?? -999, originalCoto.centerX, NEAR_PX), "Coto at x")
      .toBe(true);
    expect
      .soft(near(layout.brand?.centerY ?? -999, originalCoto.centerY, NEAR_PX), "Coto at y")
      .toBe(true);
    expect.soft(layout.texts, "Coto and Vea with their days").toEqual(original.texts);
    expect.soft(layout.emptyPlaces, "and the empty place").toBe(1);
    const marks = await brands.marks();
    const yellow = marks.find(({ image }) => image === stripBrands[1]);
    expect
      .soft(yellow?.outOfProvince, "the brand with no promo in the province is yellow")
      .toBe(true);
    expect.soft(yellow?.note, "and says so").toMatch(/^Sin promo en /);
  });

  await test.step('"Volver a como estaba" and "Dejar así"', async () => {
    await brands.press("restore");
    layout = await brands.layout(COTO_NAME);
    expect.soft(layout.changes, '"Volver a como estaba" takes everything out').toBe(0);
    expect.soft(isClean(await brands.traces()), "and closes the bar").toBe(true);

    await brands.apply(id);
    await brands.press("keep");
    layout = await brands.layout(COTO_NAME);
    expect.soft(layout.changes, '"Dejar así" leaves it placed').toBeGreaterThan(0);
    expect.soft((await brands.traces()).placing, "and the placement ends").toBe(false);
    await brands.undoOnce();
    expect
      .soft((await brands.layout(COTO_NAME)).changes, "it is undone all at once (Ctrl+Z)")
      .toBe(0);
  });

  await test.step('leaving the editor during "Así queda" keeps it', async () => {
    // Leaving the editor with "Así queda" open: what was placed stays and the bar closes
    await brands.apply(id);
    await brands.leaveEditor();
    expect
      .soft((await brands.layout(COTO_NAME)).changes, 'leaving during "Así queda" keeps it placed')
      .toBeGreaterThan(0);
    expect.soft(isClean(await brands.traces()), "and closes the bar").toBe(true);
    await brands.reenterEditorClean();
  });

  await test.step("on a model with another layout it finds everything", async () => {
    // 2) A model with another layout: the strip up (y=700) and the supermarkets lower (+720)
    await brands.useArtworkWithMovedBands([
      { fromY: STRIP_SECTION_Y, height: 330, toY: MOVED_STRIP_Y },
      { fromY: 1230, height: 500, toY: 1230 + GRID_SHIFT },
    ]);
    bar = await brands.apply(id);
    expect
      .soft(
        bar.mode,
        "with those in another place it finds them anyway: it searches the whole flyer",
      )
      .toBe("preview");
    if (bar.mode === "preview") await brands.press("keep");
    else await brands.acceptAll();
    layout = await brands.layout(COTO_NAME);
    expect
      .soft(
        near(
          layout.strip?.y ?? -999,
          originalStrip.y - STRIP_SECTION_Y + MOVED_STRIP_Y,
          MOVED_NEAR_PX,
        ),
        "the strip goes to its new place",
      )
      .toBe(true);
    expect
      .soft(
        near(layout.brand?.centerY ?? -999, originalCoto.centerY + GRID_SHIFT, MOVED_NEAR_PX),
        "Coto goes to the moved supermarkets",
      )
      .toBe(true);
    expect.soft(layout.texts, "with their days").toHaveLength(2);
  });

  await test.step("step by step, on a model where the strip is not there", async () => {
    // 3) Step by step, on a model where the strip is not there
    await brands.useArtworkWithBlankBand(STRIP_SECTION_Y, 330);
    bar = await brands.apply(id);
    expect.soft(bar.mode, "if something is missing it goes one by one").toBe("steps");
    expect.soft(bar.progress, '"1 of 4"').toMatch(/1 de 4/);
    expect.soft(bar.title, "starting with the strip").toMatch(/Franja/);
    expect.soft(bar.suggestionShown, 'with "¿Va acá?"').toBe(true);
    expect.soft(bar.suggestionUncertain, "as an uncertain place").toBe(true);
    expect
      .soft(bar.buttons, "the bar offers its buttons")
      .toEqual(["placeSure", "back", "skip", "place", "finish"]);
    expect.soft(bar.disabledButtons, "with Atrás off on the first step").toEqual(["back"]);
  });

  await test.step("it is placed with a dragged box and Ctrl+Z goes back", async () => {
    // Placing it with a dragged box
    await brands.placeAt(NEW_STRIP_BOX);
    bar = await brands.bar();
    layout = await brands.layout(COTO_NAME);
    expect.soft(bar.progress, "dragging a box goes on to the next one").toMatch(/2 de 4/);
    expect
      .soft(near(layout.strip?.y ?? -999, NEW_STRIP_BOX.y, NEAR_PX), "and puts the strip there")
      .toBe(true);

    // Ctrl+Z = Atrás: back to step 1 as it was
    await brands.pressKey("Control+z");
    bar = await brands.bar();
    layout = await brands.layout(COTO_NAME);
    expect.soft(bar.progress, "Ctrl+Z goes back a step").toMatch(/1 de 4/);
    expect.soft(layout.strip, "and takes out what was placed").toBeNull();
    await brands.placeAt(NEW_STRIP_BOX);
  });

  await test.step("touching another logo and the dots of the steps", async () => {
    // Coto: touching ANOTHER logo (Toledo, on the row below)
    await brands.placeAt({ x: 710, y: 1468, width: 0, height: 0 });
    layout = await brands.layout(COTO_NAME);
    bar = await brands.bar();
    expect
      .soft(
        near(layout.brand?.centerY ?? -999, 1468, 30),
        "touching another logo puts it on that one",
      )
      .toBe(true);
    expect.soft(bar.progress, "and goes on").toMatch(/3 de 4/);

    // A dot of what is missing: that one becomes the current one
    const thirdTitle = bar.title;
    await brands.touchStep(3);
    bar = await brands.bar();
    expect.soft(bar.progress, "touching a missing dot makes it current").toMatch(/3 de 4/);
    expect.soft(bar.title, "with another title").not.toBe(thirdTitle);
    expect.soft(bar.title, "the empty place").toMatch(/Lugar vac/);
    await brands.press("skip");
    bar = await brands.bar();
    expect.soft(bar.progress, '"Saltar" goes to what was left').toMatch(/4 de 4/);
    expect.soft(bar.title, "the one that was third").toBe(thirdTitle);
  });

  await test.step("a dot already done goes back there as it was", async () => {
    // A dot already done: back there as it was
    await brands.touchStep(0);
    bar = await brands.bar();
    layout = await brands.layout(COTO_NAME);
    expect
      .soft(bar.progress, "touching the first dot goes back to the beginning")
      .toMatch(/1 de 4/);
    expect.soft(layout.changes, "with the flyer as it was").toBe(0);
  });

  await test.step('"Poner de una" places what was found for sure', async () => {
    // "Poner de una" what was found for sure; the strip remains
    await brands.press("placeSure");
    bar = await brands.bar();
    layout = await brands.layout(COTO_NAME);
    expect.soft(bar.progress, '"Poner de una" places the 3 sure ones').toMatch(/4 de 4/);
    expect.soft(bar.title, "and leaves the strip for last").toMatch(/Franja/);
    expect
      .soft(near(layout.brand?.centerY ?? -999, originalCoto.centerY, 6), "Coto is in its place")
      .toBe(true);
    expect.soft(layout.texts, "with the days").toHaveLength(2);
    expect.soft(layout.emptyPlaces, "and the empty place").toBe(1);
  });

  await test.step("the end of the placement can still go back", async () => {
    await brands.pressKey("Enter");
    bar = await brands.bar();
    expect.soft(bar.mode, "at the end it is still step by step").toBe("steps");
    expect.soft(bar.title, 'with "Listo"').toMatch(/Listo/);
    expect.soft(bar.buttons, "and it can still go back").toEqual(["back", "finish"]);
    expect.soft(bar.markedOnFlyer, "with what was placed marked").toBeGreaterThanOrEqual(4);
    await brands.press("back");
    bar = await brands.bar();
    expect.soft(bar.progress, 'Atrás from "Listo" goes to the last step').toMatch(/4 de 4/);
    expect.soft((await brands.layout(COTO_NAME)).strip, "without the strip").toBeNull();
    await brands.pressKey("Enter");
    await brands.pressKey("Enter");
    const traces = await brands.traces();
    expect.soft(isClean(traces), '"Listo" (Enter) closes the bar').toBe(true);
    expect.soft(traces.suggestion, "and the boxes").toBe(false);
  });

  await test.step("× ends in the middle and what was placed stays", async () => {
    // × ends in the middle and what was placed stays
    await brands.clearFlyer();
    await brands.apply(id);
    await brands.placeAt(NEW_STRIP_BOX);
    const placedBefore = (await brands.layout(COTO_NAME)).changes;
    await brands.press("finish");
    expect.soft(placedBefore, "× has something to keep").toBeGreaterThan(0);
    expect
      .soft((await brands.layout(COTO_NAME)).changes, "× keeps what was placed")
      .toBe(placedBefore);
    expect.soft((await brands.traces()).placing, "and ends").toBe(false);
  });

  await test.step("changing the flyer in the middle cuts the placement", async () => {
    // Changing the flyer in the middle cuts the placement
    await brands.apply(id);
    await brands.changeArtworkDuringPlacement();
    const cut = await brands.traces();
    expect.soft(cut.placing, "if the flyer changes the placement ends by itself").toBe(false);
    expect.soft(cut.bar, "and the bar does not stay").toBe(false);
  });

  await test.step("a brand that expired is shown in red", async () => {
    // 4) A brand that expired is shown in red
    await brands.restoreArtwork();
    await brands.brandExpired(stripBrands[0] ?? "");
    bar = await brands.apply(id);
    if (bar.mode === "preview") await brands.press("keep");
    else await brands.acceptAll();
    expect
      .soft(await brands.expiredMarks(), "the brand that expired is red")
      .toBeGreaterThanOrEqual(1);
  });

  await test.step("saving again offers to replace the one applied", async () => {
    // 5) Saving again: it offers to replace the one applied
    const combinations = () => cloud.designs.filter(({ tipo }) => tipo === "combinacion").length;
    const before = combinations();
    await brands.openSaveWindowDirectly();
    const window = await brands.saveWindow();
    expect.soft(window.replacing, "after applying, it offers to replace that one").toBe(id);
    expect.soft(window.name, "with its name").toBe(SET_NAME);
    expect.soft(window.confirmLabel, "and the button says so").toMatch(/Reemplazar/);
    expect.soft(window.province, "keeping its province").toBe(province);
    const updatedBefore = cloud.designs.find((design) => design.id === id)?.updated_at;
    await app.page.waitForTimeout(50);
    await brands.confirmSaveWindow();
    expect.soft(combinations(), "it replaces that one, adding none").toBe(before);
    expect
      .soft(cloud.designs.find((design) => design.id === id)?.updated_at, "and the row is updated")
      .not.toBe(updatedBefore);
  });

  expect.soft(app.pageErrors(), "no JavaScript errors").toEqual([]);
});

test("the list of designs of Estudio leaves a saved set out", async ({ cloud, openApp }) => {
  const app = await openApp({ user: "admin" });
  const brands = app.savedBrands;
  await app.logoEditor.enter();
  await app.logoEditor.waitForBrandCatalog();
  await brands.buildStrip(STRIP_BOX, 3);
  await brands.finishChanges();
  await brands.openSaveWindow();
  await brands.saveAs(SET_NAME);
  expect.soft(cloud.designs.at(-1)?.tipo, "it is saved as a combination").toBe("combinacion");
  await app.studio.reloadList();
  expect
    .soft(await app.studio.listedDesigns(), "the list of designs of Estudio leaves it out")
    .not.toContain(SET_NAME);
  expect.soft(app.pageErrors(), "no JavaScript errors").toEqual([]);
});

test("a saved set is applied from Estudio on the flyer on screen", async ({ cloud, openApp }) => {
  const app = await openApp({ user: "admin" });
  const brands = app.savedBrands;
  await app.logoEditor.enter();
  await app.logoEditor.waitForBrandCatalog();
  await brands.buildStrip(STRIP_BOX, 3);
  await brands.finishChanges();
  await brands.openSaveWindow();
  await brands.saveAs(SET_NAME);
  expect.soft(cloud.designs.at(-1)?.tipo, "it is saved").toBe("combinacion");

  await app.studio.open();
  await app.page.getByRole("button", { name: "Aplicar en el flyer" }).first().click();
  await expect
    .soft(app.page.getByRole("button", { name: "Dejar así" }), "it goes to the flyer and shows it")
    .toBeVisible();
  expect.soft(app.pageErrors(), "no JavaScript errors").toEqual([]);
});
