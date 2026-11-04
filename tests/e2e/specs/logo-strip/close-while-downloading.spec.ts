// Replaces pruebas/t20_franja_cerrar_mientras_baja.cjs.
import { expect, test } from "../../support/test.ts";

const LOGOS_STRIP = { x: 140, y: 2650, width: 1000, height: 230 };
const BRANDS = ["farmacia del pueblo", "puppis"];
const PROMOTION_LOGOS = "https://www.galicia.ar/**";

test(
  "closing the window while the logos download applies nothing",
  { tag: "@react" },
  async ({ openApp }) => {
    const app = await openApp();
    const strip = app.logoStrip;
    await app.logoEditor.enter();
    await strip.open(LOGOS_STRIP);

    // The logos do not arrive until the window has been closed.
    const whenClosed: (() => void)[] = [];
    const windowClosed = new Promise<void>((resolve) => {
      whenClosed.push(resolve);
    });
    await app.page.route(PROMOTION_LOGOS, async (route) => {
      await windowClosed;
      await route.fallback();
    });

    for (const brand of BRANDS) await strip.tickBySearch(brand);
    await strip.pressPut();
    await strip.cancel();
    for (const release of whenClosed) release();
    await app.page.waitForTimeout(1500);

    expect.soft(await strip.changes(), "nothing was applied").toEqual([]);
  },
);

test('pressing "Poner" twice leaves a single strip', { tag: "@react" }, async ({ openApp }) => {
  const app = await openApp();
  const strip = app.logoStrip;
  await app.logoEditor.enter();
  await strip.open(LOGOS_STRIP);
  for (const brand of BRANDS) await strip.tickBySearch(brand);

  await strip.pressPutTwiceAtOnce();
  await strip.waitForWindowClosed();

  const changes = await strip.changes();
  expect.soft(changes.filter(({ isCover }) => isCover).length, "a single strip").toBe(1);
  expect.soft(changes.length, "with its cover and its 2 logos").toBe(3);
});
