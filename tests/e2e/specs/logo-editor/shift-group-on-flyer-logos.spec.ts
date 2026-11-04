// Replaces pruebas/t61_shift_grupo.cjs.
import { type FlyerBox } from "../../support/driver/logo-editor.ts";
import { expect, test } from "../../support/test.ts";
import { button, groupBar } from "./editor-toolbars.ts";

const STRIP = { x: 160, y: 2670, width: 960, height: 190 };
const SAME_ROW = 20;

const middleOf = ({ x, y, width, height }: FlyerBox) => ({
  x: x + width / 2,
  y: y + height / 2,
});

test(
  "Shift + click on logos of the flyer offers replacing and deleting them",
  { tag: "@react" },
  async ({ openApp }) => {
    const app = await openApp();
    await app.logoEditor.enter();
    await app.logoEditor.waitForBrandCatalog();
    const logos = await app.logoEditor.flyerLogosIn(STRIP);

    // Chosen from right to left, to see that they get sorted by themselves
    const chosen = logos.slice(0, 3).toReversed();
    for (const logo of chosen) await app.logoEditor.shiftTouch(middleOf(logo));
    expect
      .soft((await app.logoEditor.selection()).flyerLogos, "Shift + click on 3 logos marks them")
      .toBe(3);
    await expect.soft(groupBar(app.page), "and the group bar appears").toBeVisible();
    expect
      .soft(
        (await app.logoEditor.markers()).filter(({ onFlyerLogo }) => onFlyerLogo),
        "the 3 can be seen",
      )
      .toHaveLength(3);
    expect.soft(await app.logoEditor.placements(), "choosing changes nothing yet").toEqual([]);

    // Shift + click again takes it out
    const [firstChosen] = chosen;
    if (!firstChosen) throw new Error("The flyer has no logos on that strip");
    await app.logoEditor.shiftTouch(middleOf(firstChosen));
    expect
      .soft((await app.logoEditor.selection()).flyerLogos, "Shift + click again takes it out")
      .toBe(2);
    await app.logoEditor.shiftTouch(middleOf(firstChosen));

    // Reemplazar: 3 brands in order
    await groupBar(app.page).getByRole("button", { name: "Reemplazar" }).click();
    await app.logoEditor.waitForBrandList();
    await expect
      .soft(app.page.getByRole("dialog", { name: "Reemplazar 3 lugares" }), "the title says so")
      .toBeVisible();
    await expect
      .soft(button(app.page, "Mover o agrandar lo que hay"), 'with no "Mover lo que hay"')
      .toBeHidden();

    const { images, numbers } = await app.logoEditor.pickBrandsInOrder(3);
    expect.soft(numbers, "the brands carry their number").toEqual(["1", "2", "3"]);
    const put = button(app.page, /Poner 3 de 3/);
    await expect.soft(put, 'the button says "Poner 3 de 3"').toBeVisible();
    await put.click();
    await app.logoEditor.waitForPickerClosed();

    const placed = (await app.logoEditor.placements())
      .filter(({ kind }) => kind === "brand")
      .toSorted((one, other) => {
        const [a, b] = [one.place, other.place];
        if (!a || !b) return 0;
        return Math.abs(a.y - b.y) < SAME_ROW ? a.x - b.x : a.y - b.y;
      });
    expect.soft(placed.length, "the 3 brands are put").toBe(3);
    expect
      .soft(
        placed.map(({ image }) => images.indexOf(image)),
        "in reading order",
      )
      .toEqual([0, 1, 2]);
    expect
      .soft((await app.logoEditor.selection()).flyerLogos, "then what was chosen is let go")
      .toBe(0);

    // Borrar several with Shift
    for (const logo of logos.slice(3, 5)) await app.logoEditor.shiftTouch(middleOf(logo));
    await groupBar(app.page).getByRole("button", { name: "Borrar" }).click();
    const empty = (await app.logoEditor.placements()).filter(
      ({ kind, coversFlyer }) => kind === "empty" && coversFlyer,
    );
    expect.soft(empty, "Borrar leaves the 2 places chosen empty").toHaveLength(2);
  },
);
