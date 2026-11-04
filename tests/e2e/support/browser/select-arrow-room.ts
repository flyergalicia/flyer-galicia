import { type Page } from "@playwright/test";

/**
 * The room a `<select>` leaves for its arrow, which comes from the scrollbars of the system: that is
 * what is left to measure, because Playwright hides the scrollbars themselves.
 */
export async function selectArrowRoom(page: Page): Promise<number> {
  await page.setContent(
    '<select style="font:13px serif"><option>x</option></select>' +
      '<select style="font:13px serif;appearance:none"><option>x</option></select>',
  );
  const [withArrow = 0, withoutArrow = 0] = await page
    .locator("select")
    .evaluateAll((selects) => selects.map((select) => select.getBoundingClientRect().width));
  return withArrow - withoutArrow;
}
