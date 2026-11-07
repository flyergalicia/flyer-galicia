// Protects the conversion of long PDFs by bands: the whole page comes out, in its place.
import { buildStripedPdf, STRIPE_POINTS } from "../../support/pdf-sample.ts";
import { expect, test } from "../../support/test.ts";

const TALL_POINTS = 2_800;
// A band of 3600 px is an odd number of stripes: one out of place shows in the other color.
const STRIPE_PX = STRIPE_POINTS * 2;
const PIXELS = TALL_POINTS * 2;
const NO_REGION = { x: 0, y: 0, width: 1, height: 1 };

function stripePoints(): Record<string, { x: number; y: number }> {
  const points: Record<string, { x: number; y: number }> = {};
  for (let top = 0; top + STRIPE_PX <= PIXELS; top += STRIPE_PX) {
    points[String(top)] = { x: 620, y: top + STRIPE_PX / 2 };
  }
  return points;
}

test("a PDF taller than a band comes out whole, each part in its place", async ({ openApp }) => {
  const { flyerSections } = await openApp({ user: "admin" });

  const reading = await flyerSections.convertPdf(buildStripedPdf(TALL_POINTS), {
    points: stripePoints(),
    inkRegion: NO_REGION,
  });

  expect.soft(reading?.height, "its whole height").toBe(PIXELS);
  for (const [top, color] of Object.entries(reading?.colors ?? {})) {
    const isRed = (Number(top) / STRIPE_PX) % 2 === 0;
    expect.soft(color, `the stripe at ${top} px`).toEqual(isRed ? [255, 0, 0] : [0, 0, 255]);
  }
});

test("a PDF too long to convert says so, instead of freezing the computer", async ({ openApp }) => {
  const app = await openApp({ user: "admin" });
  await app.admin.openPanel();
  await app.admin.openSheet("Config", "Flyer");

  await app.calibrator.chooseFlyerFile({
    name: "larguisimo.pdf",
    mimeType: "application/pdf",
    buffer: buildStripedPdf(14_000),
  });
  await app.calibrator.answerOption("Combustible");

  await expect
    .poll(() => app.flyerEditor.latestNotice(), { timeout: 20_000 })
    .toMatch(/demasiado largo/);
  expect.soft(await app.calibrator.isOpen()).toBe(false);
});
