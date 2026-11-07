// Replaces pruebas/t05_logos_subir_pc.cjs.
import { fileURLToPath } from "node:url";
import { expect, test } from "../../support/test.ts";
import { button, picker } from "./editor-toolbars.ts";

const LOGO_FILE = fileURLToPath(new URL("../../../fixtures/data/gofarma_180.png", import.meta.url));
const SECOND_LOGO = { x: 668, y: 2708 };
const ANOTHER_LOGO = { x: 1012, y: 2720 };
const FREE_PLACE = { x: 95, y: 2872, width: 130, height: 56 };
const LOGOS_REGION = { x: 0, y: 2600, width: 1240, height: 360 };

test("a logo can come from the PC, and a free place takes a new one", async ({ openApp }) => {
  const app = await openApp();
  const original = await app.flyerEditor.downloadRegionDigest(LOGOS_REGION);
  await app.flyerEditor.setZoom(1.6);
  await app.logoEditor.enter();

  // A logo uploaded from the PC replaces the one touched
  await app.logoEditor.touch(SECOND_LOGO);
  await app.logoEditor.waitForPicker();
  await app.logoEditor.chooseLogoFile(LOGO_FILE);
  await app.logoEditor.waitForPickerClosed();
  const [uploaded] = await app.logoEditor.placements();
  expect.soft(uploaded?.title, "it takes the name of its file").toBe("gofarma_180");
  expect.soft(uploaded?.image, "it is kept as an upload").toMatch(/^pc:/);
  expect.soft(uploaded?.box?.width, "and is drawn").toBeGreaterThan(0);
  expect.soft(uploaded?.box?.height, "with some height").toBeGreaterThan(0);

  // A file that is not an image
  await app.logoEditor.touch(ANOTHER_LOGO);
  await app.logoEditor.waitForPicker();
  await app.logoEditor.chooseLogoFile({
    name: "nota.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("hola"),
  });
  await expect
    .soft(app.page.getByText("Ese archivo no es una imagen PNG o JPG."), "it warns")
    .toBeVisible();
  await expect.soft(picker(app.page), "the window stays open").toBeVisible();
  await app.page.keyboard.press("Escape");

  // A box on a free place, to the left of "+ 1000 promos"
  await app.logoEditor.drawBox(FREE_PLACE);
  await app.logoEditor.waitForBrandList();
  const addHere = app.page.getByRole("dialog", { name: "Agregar acá" });
  await expect.soft(addHere, 'the window is titled "Agregar acá"').toBeVisible();
  await expect
    .soft(button(app.page, "Dejar el lugar vacío"), "there is nothing to leave empty")
    .toBeHidden();
  await app.logoEditor.searchBrands("puppis");
  await app.logoEditor.pickFirstBrand();
  const titles = (await app.logoEditor.placements()).map(({ title }) => title);
  expect
    .soft(titles, "the upload and the new brand")
    .toEqual(["gofarma_180", expect.stringMatching(/puppis/i)]);

  expect
    .soft(await app.flyerEditor.downloadRegionDigest(LOGOS_REGION), "the download carries them")
    .not.toBe(original);
});
