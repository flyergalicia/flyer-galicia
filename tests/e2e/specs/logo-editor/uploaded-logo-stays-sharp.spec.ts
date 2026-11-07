// Replaces pruebas/t53_logo_subido_nitido.cjs.
import { type LogoDrawing } from "../../support/driver/logo-editor.ts";
import { expect, test } from "../../support/test.ts";

const WIDTH = 1600;
const HEIGHT = 500;
const NAVY = "rgb(27, 42, 74)";
const WHITE = "rgb(255, 255, 255)";
const CANVAS = { width: WIDTH, height: HEIGHT };

const WHITE_LETTERS_OUTLINED: LogoDrawing = {
  ...CANVAS,
  format: "png",
  word: { fill: WHITE, outline: NAVY },
};
const LOGO_IN_WHITE_FRAME: LogoDrawing = {
  ...CANVAS,
  format: "png",
  rectangles: [{ x: 40, y: 40, width: WIDTH - 80, height: HEIGHT - 80, color: WHITE }],
  word: { fill: NAVY },
};
const JPEG_ON_WHITE: LogoDrawing = {
  ...CANVAS,
  format: "jpeg",
  rectangles: [{ x: 0, y: 0, width: WIDTH, height: HEIGHT, color: WHITE }],
  word: { fill: NAVY },
};
const ALL_WHITE: LogoDrawing = { ...CANVAS, format: "png", word: { fill: WHITE } };

test("an uploaded logo keeps its letters and loses only its background", async ({ openApp }) => {
  const app = await openApp();

  const outlined = await app.logoEditor.readUploadedLogo(WHITE_LETTERS_OUTLINED);
  expect
    .soft(outlined.pixels.solidWhite, "transparent PNG with white letters: the letters stay")
    .toBeGreaterThan(5000);

  const framed = await app.logoEditor.readUploadedLogo(LOGO_IN_WHITE_FRAME);
  expect
    .soft(framed.pixels.solidBright, "a big white frame goes, only the holes of the letters stay")
    .toBeLessThan(30_000);
  expect.soft(framed.pixels.solidBlue, "and the logo inside stays").toBeGreaterThan(5000);

  const jpeg = await app.logoEditor.readUploadedLogo(JPEG_ON_WHITE);
  expect.soft(jpeg.pixels.partlyTransparent, "JPG on white: soft edges").toBeGreaterThan(200);
  expect.soft(jpeg.pixels.fullyTransparent, "and the background gone").toBeGreaterThan(1000);

  const white = await app.logoEditor.readUploadedLogo(ALL_WHITE);
  expect
    .soft(white.warnings, "a white logo warns, once")
    .toEqual([expect.stringMatching(/blanco/)]);

  const colored = [...outlined.warnings, ...framed.warnings, ...jpeg.warnings];
  expect
    .soft(
      colored.filter((warning) => warning.includes("blanco")),
      "logos with color do not warn",
    )
    .toEqual([]);
});
