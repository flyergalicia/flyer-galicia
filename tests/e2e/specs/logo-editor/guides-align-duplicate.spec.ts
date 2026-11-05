// Replaces pruebas/t38_guias_alinear_duplicar.cjs.
import { type FlyerBox, type PlacedLogo } from "../../support/driver/logo-editor.ts";
import { type OpenedApp } from "../../support/open-app.ts";
import { expect, test } from "../../support/test.ts";
import { adjustBar, button, cleanPreviewButton } from "./editor-toolbars.ts";

// Three logos at different heights and sizes.
const LOGOS = [
  { x: 250, y: 2680, width: 140, height: 60 },
  { x: 560, y: 2700, width: 120, height: 50 },
  { x: 880, y: 2720, width: 160, height: 70 },
];

function boxes(placed: readonly PlacedLogo[]): FlyerBox[] {
  return placed.map(({ box }) => {
    if (!box) throw new Error("A logo with nothing drawn");
    return box;
  });
}

async function boxesOf(app: OpenedApp): Promise<FlyerBox[]> {
  return boxes(await app.logoEditor.placements());
}

function middleY({ y, height }: FlyerBox): number {
  return y + height / 2;
}

function boxAt(all: readonly FlyerBox[], index: number): FlyerBox {
  const box = all[index];
  if (!box) throw new Error(`There is no logo number ${index}`);
  return box;
}

test.describe("Cambiar logos", () => {
  test("dragging snaps to guides, unless Alt is held", { tag: "@react" }, async ({ openApp }) => {
    const app = await openApp();
    await app.flyerEditor.setZoom(1.3);
    await app.logoEditor.enter();
    await app.logoEditor.placeBrands(LOGOS);
    await app.logoEditor.bringIntoView({ x: 0, y: 2720 });

    // Take logo 2 almost to the height of the middle of logo 1, 3 pixels past it
    const start = await boxesOf(app);
    const from = await app.logoEditor.placedOnScreen(1);
    const { scale } = await app.logoEditor.screenPoint({ x: 0, y: 0 });
    const down = middleY(boxAt(start, 0)) - middleY(boxAt(start, 1)) + 3;
    await app.page.mouse.move(from.x, from.y);
    await app.page.mouse.down();
    await app.page.mouse.move(from.x + 5, from.y + down * scale, { steps: 6 });
    const whileDragging = await app.logoEditor.guides();
    await app.page.mouse.up();
    await app.logoEditor.waitUntilSettled();

    expect
      .soft(
        whileDragging.map(({ axis }) => axis),
        "while dragging the horizontal guide shows",
      )
      .toContain("horizontal");

    const placed = await app.logoEditor.placements();
    const [moved, others] = [boxAt(boxes(placed), 1), [placed[0], placed[2]]];
    const lines = [(placed[1]?.place?.y ?? 0) + (placed[1]?.place?.height ?? 0) / 2];
    for (const other of others) {
      const box = other?.box;
      if (box) lines.push(box.y, middleY(box), box.y + box.height);
    }
    const edges = [moved.y, middleY(moved), moved.y + moved.height];
    expect
      .soft(
        edges.some((edge) => lines.some((line) => Math.abs(edge - line) < 0.001)),
        "it ends exactly on a line: an edge or the middle of another logo",
      )
      .toBe(true);
    expect.soft(await app.logoEditor.guides(), "on releasing, the guides go").toEqual([]);

    // With Alt it does not snap
    const again = await app.logoEditor.placedOnScreen(1);
    await app.page.keyboard.down("Alt");
    await app.page.mouse.move(again.x, again.y);
    await app.page.mouse.down();
    await app.page.mouse.move(again.x + 3, again.y + 2 * scale, { steps: 4 });
    await app.page.mouse.up();
    await app.page.keyboard.up("Alt");
    await app.logoEditor.waitUntilSettled();
    const noSnap = await boxesOf(app);
    expect
      .soft(
        Math.abs(middleY(boxAt(noSnap, 0)) - middleY(boxAt(noSnap, 1))),
        "with Alt held it does not snap",
      )
      .toBeGreaterThan(0.5);
  });

  test(
    "three chosen logos can be aligned, spread and sized alike",
    { tag: "@react" },
    async ({ openApp }) => {
      const app = await openApp();
      await app.flyerEditor.setZoom(1.3);
      await app.logoEditor.enter();
      await app.logoEditor.placeBrands(LOGOS);

      await app.logoEditor.touchPlaced(0);
      await app.logoEditor.touchPlaced(1, { withShift: true });
      await app.logoEditor.touchPlaced(2, { withShift: true });
      const bar = adjustBar(app.page);
      const spread = bar.getByRole("button", { name: "Repartir" });
      const middle = bar.getByRole("button", { name: "Al medio" });
      await expect.soft(middle, "with 3 chosen Alinear shows").toBeVisible();
      await expect.soft(spread, "and Repartir").toBeVisible();
      const { main } = await app.logoEditor.selection();

      await middle.click();
      await app.logoEditor.waitUntilSettled();
      const aligned = await boxesOf(app);
      const reference = middleY(boxAt(aligned, main));
      for (const [index, box] of aligned.entries()) {
        expect
          .soft(
            Math.abs(middleY(box) - reference),
            `"Al medio" centers logo ${index} with the rest`,
          )
          .toBeLessThan(0.01);
      }

      await spread.click();
      await app.logoEditor.waitUntilSettled();
      const [left, center, right] = (await boxesOf(app)).toSorted((a, b) => a.x - b.x);
      if (!left || !center || !right) throw new Error("Three logos were expected");
      const firstGap = center.x - (left.x + left.width);
      const secondGap = right.x - (center.x + center.width);
      expect
        .soft(Math.abs(firstGap - secondGap), '"Repartir" leaves the same space between logos')
        .toBeLessThan(1);

      await bar.getByRole("button", { name: "Mismo tamaño" }).click();
      await app.logoEditor.waitUntilSettled();
      const sized = await boxesOf(app);
      const height = boxAt(sized, main).height;
      for (const [index, box] of sized.entries()) {
        expect
          .soft(Math.abs(box.height - height), `"Mismo tamaño" gives logo ${index} the same height`)
          .toBeLessThan(1);
      }

      await app.page.keyboard.press("Control+z");
      await expect
        .soft(button(app.page, "Rehacer"), 'Ctrl+Z undoes "Mismo tamaño" in one step')
        .toHaveAttribute("title", /Tamaño/);
    },
  );

  test(
    "Ctrl+C / Ctrl+V and Duplicar copy, and Supr deletes",
    { tag: "@react" },
    async ({ openApp }) => {
      const app = await openApp();
      await app.flyerEditor.setZoom(1.3);
      await app.logoEditor.enter();
      await app.logoEditor.placeBrands(LOGOS);
      const emptyPlaces = async () =>
        (await app.logoEditor.placements()).filter(
          ({ kind, coversFlyer }) => kind === "empty" && coversFlyer,
        ).length;

      await app.logoEditor.touchPlaced(0);
      const firstOnScreen = await app.logoEditor.placedOnScreen(0);
      await app.page.keyboard.press("Control+c");
      await app.page.keyboard.press("Control+v");
      await app.logoEditor.waitUntilSettled();
      const copied = await app.logoEditor.placements();
      const copy = copied[3];
      expect.soft(copied, "Ctrl+C / Ctrl+V create one more").toHaveLength(4);
      expect.soft(copy?.isCopy, "it is a copy").toBe(true);
      expect
        .soft((copy?.box?.x ?? 0) - (copied[0]?.box?.x ?? 0), "moved 16 pixels")
        .toBeCloseTo(16, 2);
      expect.soft((copy?.box?.y ?? 0) - (copied[0]?.box?.y ?? 0), "both ways").toBeCloseTo(16, 2);
      expect.soft(copy?.coversFlyer, "the copy covers nothing underneath").toBe(false);
      expect.soft(await app.logoEditor.changesInDownload(), "and goes in the download").toBe(4);

      await app.page.keyboard.press("Delete");
      await app.logoEditor.waitUntilSettled();
      expect.soft(await app.logoEditor.placements(), "Supr takes the copy out").toHaveLength(3);

      // On a logo changed, Supr deletes: the place stays empty, the original does not come back
      await app.page.mouse.click(firstOnScreen.x, firstOnScreen.y);
      await app.page.keyboard.press("Delete");
      await app.logoEditor.waitUntilSettled();
      expect.soft(await app.logoEditor.placements(), "Supr on a change keeps it").toHaveLength(3);
      expect.soft(await emptyPlaces(), "as an empty place").toBe(1);
      await app.page.keyboard.press("Control+z");
      expect.soft(await app.logoEditor.placements(), "Ctrl+Z gets it back").toHaveLength(3);
      expect.soft(await emptyPlaces(), "with its logo").toBe(0);

      // The Duplicar button
      await app.logoEditor.touchPlaced(2);
      await adjustBar(app.page).getByRole("button", { name: "Duplicar" }).click();
      expect.soft(await app.logoEditor.placements(), "Duplicar creates the copy").toHaveLength(4);

      // The clean preview hides the bar
      await cleanPreviewButton(app.page).click();
      await expect.soft(adjustBar(app.page), "Vista previa hides the bar").toBeHidden();
    },
  );

  test(
    "in a text field, Ctrl+V and Supr do not touch the logos",
    { tag: "@react" },
    async ({ openApp }) => {
      const app = await openApp();
      await app.logoEditor.enter();
      await app.logoEditor.placeBrands(LOGOS);
      await app.logoEditor.touchPlaced(2);
      await app.page.keyboard.press("Control+c");
      await app.page.keyboard.press("Control+v");
      await app.logoEditor.waitUntilSettled();

      await app.logoEditor.focusCompanyField();
      await app.page.keyboard.type("ACME");
      await app.page.keyboard.press("Backspace");
      await app.page.keyboard.press("Control+v");
      expect
        .soft(await app.logoEditor.placements(), "writing, Supr / Ctrl+V do not touch the logos")
        .toHaveLength(4);
      expect
        .soft(await app.logoEditor.companyFieldValue(), "they act on the field")
        .toMatch(/^ACM/);
    },
  );
});
