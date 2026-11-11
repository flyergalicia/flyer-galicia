// Replaces pruebas/t54_logo_fondo_oscuro.cjs.
import { readFileSync } from "node:fs";
import { expect, test } from "../../support/test.ts";

const TOLEDO_LOGO = readFileSync(
  new URL("../../../fixtures/data/logo_toledo.png", import.meta.url),
);
const DARK_SQUARE_WITH_COLORS = {
  width: 200,
  height: 200,
  format: "png",
  rectangles: [
    { x: 0, y: 0, width: 200, height: 200, color: "rgb(29, 42, 68)" },
    { x: 40, y: 60, width: 120, height: 40, color: "rgb(232, 49, 42)" },
    { x: 40, y: 110, width: 120, height: 30, color: "rgb(245, 196, 0)" },
  ],
} as const;

test("a white logo on a dark square turns into the color of the square", async ({ openApp }) => {
  const app = await openApp();

  // The real Toledo of the catalog: white letters on a blue square
  const toledo = await app.logoEditor.cleanLogo(TOLEDO_LOGO);
  expect.soft(toledo.width, "the blue square went: only the word stays").toBeLessThan(170);
  expect.soft(toledo.height, "the blue square went, also in height").toBeLessThan(80);
  expect.soft(toledo.visibleLight, "no letter stays white").toBe(0);
  expect.soft(toledo.visibleBlue, "the letters are blue").toBeGreaterThan(toledo.visible * 0.9);

  // A dark square with a drawing in colors is left whole
  const square = await app.logoEditor.cleanLogo(DARK_SQUARE_WITH_COLORS);
  expect.soft(square.width, "a dark square with colors keeps its size").toBe(200);
  expect.soft(square.cornerAlpha, "and its background").toBe(255);
});
