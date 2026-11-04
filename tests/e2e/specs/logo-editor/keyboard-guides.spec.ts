// Replaces pruebas/t57_guias_teclado.cjs.
import { expect, test } from "../../support/test.ts";
import { cleanPreviewButton } from "./editor-toolbars.ts";

const LOGO_WIDTH = 300;
const LOGO_HEIGHT = 110;
const LOGO_TOP = 2650;
const GUIDES_FADE_MS = 1300;

test(
  "the arrows show guides too, and they fade by themselves",
  { tag: "@react" },
  async ({ openApp }) => {
    const app = await openApp();
    await app.logoEditor.enter();
    await app.logoEditor.placeBrands([
      { x: 140, y: LOGO_TOP, width: LOGO_WIDTH, height: LOGO_HEIGHT },
      { x: 600, y: LOGO_TOP, width: LOGO_WIDTH, height: LOGO_HEIGHT },
    ]);
    await app.logoEditor.touchPlaced(1);

    // 3 pixels away from being aligned at the top
    await app.page.keyboard.press("ArrowDown");
    await app.page.keyboard.press("ArrowDown");
    await app.page.keyboard.press("ArrowDown");
    const [first, second] = await app.logoEditor.placements();
    expect
      .soft(
        (second?.box?.y ?? 0) - (first?.box?.y ?? 0),
        "the logo starts 3 pixels below the other",
      )
      .toBeCloseTo(3, 5);

    await app.page.keyboard.press("ArrowUp");
    const near = await app.logoEditor.guides();
    expect.soft(near.length, "the arrow shows guides").toBeGreaterThan(0);
    expect
      .soft(
        near.filter(({ isNear }) => isNear).length,
        "while it is not on the line yet, the line is a light one",
      )
      .toBeGreaterThan(0);

    await app.page.keyboard.press("ArrowUp");
    await app.page.keyboard.press("ArrowUp");
    const [top, aligned] = await app.logoEditor.placements();
    expect
      .soft(Math.abs((aligned?.box?.y ?? 0) - (top?.box?.y ?? 0)), "it ends up exactly aligned")
      .toBeLessThan(0.5);
    expect
      .soft(
        (await app.logoEditor.guides()).filter(({ isExact }) => isExact).length,
        "when exactly aligned, the line is solid",
      )
      .toBeGreaterThan(0);

    await expect
      .configure({ soft: true })
      .poll(() => app.logoEditor.guides(), {
        message: "the guides fade once the keyboard is left alone",
        timeout: GUIDES_FADE_MS,
        intervals: [100],
      })
      .toEqual([]);

    await expect
      .soft(cleanPreviewButton(app.page), 'the button is called "Vista previa"')
      .toBeVisible();
  },
);
