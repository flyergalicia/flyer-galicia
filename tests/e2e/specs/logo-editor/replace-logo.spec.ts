// Replaces pruebas/t02_logos_cambiar.cjs.
import { expect, test } from "../../support/test.ts";

const FIRST_LOGO = { x: 850, y: 2708 };
const SECOND_LOGO = { x: 668, y: 2708 };
const THIRD_LOGO = { x: 498, y: 2820 };
const LOGOS_REGION = { x: 0, y: 2560, width: 1240, height: 420 };

test("changed logos reach the download and Restaurar brings the originals back", async ({
  openApp,
}) => {
  const app = await openApp();
  const originalDownload = await app.flyerEditor.downloadRegionDigest(LOGOS_REGION);

  await app.flyerEditor.setZoom(1.6);
  await app.logoEditor.enter();

  const { matches } = await app.logoEditor.replaceWithBrand(FIRST_LOGO, "farmacia del pueblo");
  expect.soft(matches, "the search lists only that brand").toEqual(["Farmacia Del Pueblo"]);
  expect.soft(await app.logoEditor.changes(), "the brand takes that place").toEqual([
    {
      kind: "brand",
      title: "Farmacia Del Pueblo",
      box: { x: 814, y: 2671, width: 87, height: 72 },
    },
  ]);

  await app.logoEditor.leaveEmpty(SECOND_LOGO);
  await app.logoEditor.replaceWithBrand(THIRD_LOGO, "scienza");

  const changes = await app.logoEditor.changes();
  expect
    .soft(
      changes.map(({ kind }) => kind),
      "one change per place touched",
    )
    .toEqual(["brand", "empty", "brand"]);
  expect.soft(changes[1]?.box, "an empty place draws nothing").toBeNull();
  expect
    .soft(changes[2]?.title, "the third place shows the brand searched for")
    .toMatch(/scienza/i);

  expect.soft(await app.logoEditor.changesInDownload(), "the download carries the three").toBe(3);
  expect
    .soft(await app.flyerEditor.downloadRegionDigest(LOGOS_REGION), "the download changed")
    .not.toBe(originalDownload);

  await app.flyerEditor.restoreDefaults();

  expect.soft(await app.logoEditor.changes(), "Restaurar leaves no change").toEqual([]);
  expect.soft(await app.logoEditor.changesInDownload(), "nor in the download").toBe(0);
  expect
    .soft(await app.flyerEditor.downloadRegionDigest(LOGOS_REGION), "the download is the original")
    .toBe(originalDownload);
});
