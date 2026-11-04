// Replaces pruebas/t04_logos_mover_tamano.cjs.
import { expect, test } from "../../support/test.ts";
import { adjustBar, picker } from "./editor-toolbars.ts";

const FIRST_LOGO = { x: 850, y: 2708 };
const ANOTHER_LOGO = { x: 1012, y: 2720 };
const DOWNLOAD_REGION = { x: 450, y: 2620, width: 700, height: 200 };
// A drag sticks to a guide that is this close, in screen pixels.
const SNAP_PIXELS = 6;

test(
  "a logo just put can be resized, dragged, nudged, centered and changed",
  { tag: "@react" },
  async ({ openApp }) => {
    const app = await openApp();
    const original = await app.flyerEditor.downloadRegionDigest(DOWNLOAD_REGION);
    await app.flyerEditor.setZoom(1.6);
    await app.logoEditor.enter();

    await app.logoEditor.replaceWithBrand(FIRST_LOGO, "farmacia del pueblo");
    const placedLogo = async () => {
      const [logo] = await app.logoEditor.placements();
      if (!logo?.box) throw new Error("The brand was not put on the flyer");
      return { percent: logo.sizePercent, box: logo.box, place: logo.place };
    };
    const put = await placedLogo();
    expect.soft((await app.logoEditor.selection()).main, "it stays chosen").toBe(0);
    expect.soft(put.percent, "it starts at its full size").toBe(100);
    await expect.soft(adjustBar(app.page), "the adjust bar shows up").toBeVisible();

    // "+" twice
    const bigger = adjustBar(app.page).getByRole("button", { name: "Más grande" });
    await bigger.click();
    await bigger.click();
    const grown = await placedLogo();
    expect.soft(grown.percent, "each + adds 10%").toBe(120);
    expect.soft(grown.box.width / put.box.width, "the logo is that much wider").toBeCloseTo(1.2, 5);
    expect
      .soft(grown.box.x + grown.box.width / 2, "it grows from its center")
      .toBeCloseTo(put.box.x + put.box.width / 2, 5);

    // The slider at 80%
    await adjustBar(app.page).getByRole("slider", { name: "Tamaño del logo" }).fill("80");
    const small = await placedLogo();
    expect.soft(small.percent, "the slider sets the size").toBe(80);
    expect.soft(small.box.width / put.box.width, "the logo is that wide").toBeCloseTo(0.8, 5);

    // Dragged 40 pixels of the flyer to the left and 10 down
    const from = await app.logoEditor.placedOnScreen(0);
    const { scale } = await app.logoEditor.screenPoint(FIRST_LOGO);
    await app.page.mouse.move(from.x, from.y);
    await app.page.mouse.down();
    await app.page.mouse.move(from.x - 20 * scale, from.y + 5 * scale, { steps: 4 });
    await app.page.mouse.move(from.x - 40 * scale, from.y + 10 * scale, { steps: 4 });
    await app.page.mouse.up();
    const dragged = await placedLogo();
    expect
      .soft(Math.abs(dragged.box.x - small.box.x + 40), "the drag moves it 40 pixels left")
      .toBeLessThanOrEqual(SNAP_PIXELS / scale);
    expect
      .soft(Math.abs(dragged.box.y - small.box.y - 10), "and 10 down")
      .toBeLessThanOrEqual(SNAP_PIXELS / scale);
    await expect.soft(picker(app.page), "a drag opens no window").toBeHidden();

    // Arrows: 1 pixel, 10 with Shift
    await app.page.keyboard.press("ArrowRight");
    await app.page.keyboard.press("Shift+ArrowUp");
    await app.logoEditor.waitUntilSettled();
    const nudged = await placedLogo();
    expect.soft(nudged.box.x - dragged.box.x, "the arrow moves it 1 pixel").toBeCloseTo(1, 5);
    expect.soft(nudged.box.y - dragged.box.y, "Shift moves it 10 pixels").toBeCloseTo(-10, 5);
    const beforeCentering = await app.flyerEditor.downloadRegionDigest(DOWNLOAD_REGION);
    expect.soft(beforeCentering, "the download carries the new logo").not.toBe(original);

    // Centrar
    await adjustBar(app.page).getByRole("button", { name: "Centrar" }).click();
    const centered = await placedLogo();
    expect
      .soft(centered.box.x + centered.box.width / 2, "Centrar goes to the middle of its place")
      .toBeCloseTo((put.place?.x ?? 0) + (put.place?.width ?? 0) / 2, 5);
    expect
      .soft(centered.box.y + centered.box.height / 2, "both ways")
      .toBeCloseTo((put.place?.y ?? 0) + (put.place?.height ?? 0) / 2, 5);
    expect
      .soft(
        await app.flyerEditor.downloadRegionDigest(DOWNLOAD_REGION),
        "the download carries the position and size",
      )
      .not.toBe(beforeCentering);

    // Cambiar from the bar
    await adjustBar(app.page).getByRole("button", { name: "Cambiar", exact: true }).click();
    await expect.soft(picker(app.page), "Cambiar opens the window").toBeVisible();
    await app.page.keyboard.press("Escape");

    // Touching another logo lets this one go and opens the window
    await app.logoEditor.touch(ANOTHER_LOGO);
    await expect.soft(picker(app.page), "another logo opens the window").toBeVisible();
    expect.soft((await app.logoEditor.selection()).main, "with nothing chosen").toBe(-1);
    await app.page.keyboard.press("Escape");
  },
);
