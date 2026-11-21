// What every story must keep, whatever it shows.
import { allStoryIds, openStory, textBelowMinimum } from "../../support/design-system/look.ts";
import { expect, test } from "../../support/test.ts";

test("stories have no text below the minimum and no errors", async ({ page, storybookUrl }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const ids = allStoryIds();
  expect(ids.length).toBeGreaterThan(100);
  for (const id of ids) {
    for (const dark of [false, true]) {
      const globals = encodeURIComponent(`dark:${String(dark)}`);
      await openStory(
        page,
        `${storybookUrl}iframe.html?id=${id}&viewMode=story&globals=${globals}`,
      );
      expect.soft(await textBelowMinimum(page), id).toEqual([]);
    }
  }
  expect(errors).toEqual([]);
});
