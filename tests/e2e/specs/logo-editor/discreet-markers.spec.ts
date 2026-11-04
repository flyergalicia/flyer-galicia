// Replaces pruebas/t51_marcos_discretos.cjs.
import { type OpenedApp } from "../../support/open-app.ts";
import { expect, test } from "../../support/test.ts";

const OFF_THE_FLYER = { x: 5, y: 5 };
const PHONE = { width: 390, height: 844 };

async function putLogoAndEmptyPlace(app: OpenedApp): Promise<void> {
  await app.logoEditor.enter();
  await app.logoEditor.placeBrands([{ x: 140, y: 2650, width: 300, height: 110 }]);
  await app.logoEditor.placeEmpty({ x: 600, y: 2650, width: 200, height: 110 });
  await app.logoEditor.waitForMarkersToStopFlashing();
}

test.describe("the boxes of Cambiar logos", { tag: "@react" }, () => {
  test("do not show at rest and appear around the mouse", async ({ openApp }) => {
    const app = await openApp();
    await putLogoAndEmptyPlace(app);
    const moveOff = () => app.page.mouse.move(OFF_THE_FLYER.x, OFF_THE_FLYER.y);

    expect.soft(await app.logoEditor.markers(), "there are 2 boxes").toHaveLength(2);
    await moveOff();
    const atRest = await app.logoEditor.markers();
    expect.soft(atRest[0]?.visibility, "without the mouse over it, the first hides").toBe("hidden");
    expect.soft(atRest[1]?.visibility, "and so does the second").toBe("hidden");

    // The mouse over the flyer, on the empty place
    await app.logoEditor.bringIntoView({ x: 700, y: 2705 });
    const over = await app.logoEditor.screenPoint({ x: 700, y: 2705 });
    await app.page.mouse.move(over.x, over.y);
    const hovering = await app.logoEditor.markers();
    expect
      .soft(hovering[0]?.visibility, "with the mouse on the flyer, the others are faint")
      .toBe("faint");
    expect.soft(hovering[1]?.visibility, "the one under the mouse shows whole").toBe("full");

    // Chosen: solid even when the mouse goes away
    await app.logoEditor.touchPlaced(0);
    await moveOff();
    await app.logoEditor.waitForMarkersToStopFlashing();
    const [chosen] = await app.logoEditor.markers();
    expect.soft(chosen?.line, "the chosen one has a solid line").toBe("solid");
    expect.soft(chosen?.visibility, "and shows whole").toBe("full");

    // A new change flashes
    await app.page.keyboard.press("ArrowRight");
    await expect
      .configure({ soft: true })
      .poll(
        async () => (await app.logoEditor.markers()).filter(({ flashing }) => flashing).length,
        { message: "the box just changed flashes" },
      )
      .toBe(1);
  });

  test("are always faint on a touch screen", async ({ openApp }) => {
    const app = await openApp({ viewport: PHONE, touch: true });
    await putLogoAndEmptyPlace(app);

    const [first] = await app.logoEditor.markers();
    expect.soft(first?.visibility, "on a touch screen they are faint").toBe("faint");
  });
});
