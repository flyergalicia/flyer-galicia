// The images were recorded with overlay scrollbars. With a mouse connected, macOS would give the
// browser classic ones and 18 images would differ on both versions, without anything being wrong.
import { selectArrowRoom } from "../../support/browser/select-arrow-room.ts";
import { expect, test } from "../../support/test.ts";

const ARROW_ROOM_WITH_OVERLAY_SCROLLBARS = 16;

test("a connected mouse does not change the scrollbars", { tag: "@visual" }, async ({ page }) => {
  test.skip(process.platform !== "darwin", "Only macOS changes them");
  expect(await selectArrowRoom(page)).toBe(ARROW_ROOM_WITH_OVERLAY_SCROLLBARS);
});
