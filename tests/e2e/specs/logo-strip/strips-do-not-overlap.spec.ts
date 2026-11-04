// Replaces pruebas/t50_franjas_no_se_pisan.cjs.
import { type AppDriver } from "../../support/driver/app-driver.ts";
import { type FlyerRegion } from "../../support/driver/flyer-editor.ts";
import { expect, test } from "../../support/test.ts";

const TOP_STRIP = { x: 140, y: 2650, width: 1000, height: 230 };
const LOWER_STRIP = { x: 140, y: 2760, width: 1000, height: 260 };
const THIRD_STRIP = { x: 140, y: 3500, width: 1000, height: 200 };
const INSIDE_TOP_STRIP = { x: 150, y: 2660, width: 980, height: 210 };
const FAR_AWAY = { x: 600, y: 3300, width: 140, height: 60 };
const LOOSE = "Suelto";

async function buildStrip(
  { logoStrip }: AppDriver,
  region: FlyerRegion,
  count: number,
  avoid: readonly string[] = [],
): Promise<{ logos: string[]; region: FlyerRegion }> {
  await logoStrip.open(region, { province: "" });
  const logos = await logoStrip.tickNextAvoiding(count, avoid);
  const { region: adjusted } = await logoStrip.state();
  await logoStrip.put();
  return { logos, region: adjusted };
}

test(
  "two strips do not step on each other and resuming shows what is there today",
  { tag: "@react" },
  async ({ openApp }) => {
    const app = await openApp();
    const strip = app.logoStrip;
    await app.logoEditor.enter();
    await strip.waitForCatalog();

    const top = await buildStrip(app, TOP_STRIP, 3);
    const logosOf = async (id: string): Promise<string[]> =>
      (await strip.changes())
        .filter(({ strip: owner, isCover }) => owner === id && !isCover)
        .map(({ logo }) => logo);
    const topId = (await strip.changes()).find(({ isCover }) => isCover)?.strip;
    if (!topId) throw new Error("The first strip was not built");

    // The box of the second one starts inside the first one, on its lower row.
    const lower = await buildStrip(app, LOWER_STRIP, 3, top.logos);
    const stillOnTop = await logosOf(topId);
    expect.soft(stillOnTop.length, "the strip above keeps its 3 logos").toBe(3);
    expect.soft(stillOnTop.toSorted(), "the same ones").toEqual(top.logos.toSorted());
    expect
      .soft(lower.region.y, "the new box was cut so as not to step on the one above")
      .toBeGreaterThanOrEqual(TOP_STRIP.y + TOP_STRIP.height);
    const afterTwo = await strip.changes();
    expect.soft(afterTwo.filter(({ isCover }) => isCover).length, "both strips remain").toBe(2);
    const insideLower = afterTwo.filter(({ strip: owner, isCover, box }) => {
      if (owner !== topId || isCover || !box) return false;
      const middle = box.y + box.height / 2;
      return middle >= lower.region.y && middle <= lower.region.y + lower.region.height;
    });
    expect.soft(insideLower, "no logo of the one above stays inside the one below").toEqual([]);

    // A loose logo moved into the zone of a new strip is replaced by it.
    await strip.placeLooseLogoMovedTo(FAR_AWAY, LOOSE, { x: 600, y: 3560 });
    await buildStrip(app, THIRD_STRIP, 2);
    expect
      .soft(
        (await strip.changes()).filter(({ title }) => title === LOOSE),
        "a logo moved into the new strip does not stay behind",
      )
      .toEqual([]);

    // Resuming the first one after deleting a logo and replacing another.
    await strip.deleteFirstLogoOfStrip(topId);
    await app.page.waitForTimeout(200);
    const replaced = await strip.replaceFirstLogoOfStrip(topId);
    await strip.open(INSIDE_TOP_STRIP, { province: "" });
    await app.page.waitForTimeout(300);
    const resumed = (await strip.state()).brands.map(({ logo }) => logo);
    expect.soft(resumed.length, "the deleted one does not come back").toBe(1);
    expect.soft(resumed, "nor the replaced one").not.toContain(replaced);
  },
);
