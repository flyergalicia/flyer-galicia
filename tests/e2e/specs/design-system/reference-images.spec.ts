// Each component on top of the reference images of the old app: the part that a component is
// responsible for, in its place on the screen, compared pixel by pixel. Where each part was in the
// old app is frozen in tests/fixtures/design-system/reference-look.json.
// See docs/PLAN_MIGRACION_REACT.md.
import { APPEARANCES, SCREEN_GROUPS } from "../../support/design-system/cases.ts";
import {
  allowedPixels,
  clipOf,
  crop,
  difference,
  paintCorners,
  paintOut,
  pixelAt,
  referenceImage,
} from "../../support/design-system/images.ts";
import { frozenReferenceBoxes } from "../../support/design-system/reference-look.ts";
import { openStory, placeStory, storyUrl } from "../../support/design-system/look.ts";
import { writeFileSync } from "node:fs";
import { expect, test } from "../../support/test.ts";
import { PNG } from "pngjs";

const HEIGHT_TOLERANCE_PX = 0.51;

for (const group of SCREEN_GROUPS) {
  for (const appearance of group.appearances) {
    test(
      `${group.name}, ${appearance}: over the reference image`,
      { tag: "@visual" },
      async ({ browser, storybookUrl }, testInfo) => {
        const reference = referenceImage(`${group.image}--${appearance}`);
        const { viewport, touch } = APPEARANCES[appearance];

        const context = await browser.newContext({
          viewport,
          hasTouch: touch,
          isMobile: touch,
          reducedMotion: "reduce",
        });
        const page = await context.newPage();
        for (const look of group.cases.filter(
          ({ noImage, notOnPhone, belowThePhoneImage }) =>
            !noImage && !(touch && (notOnPhone || belowThePhoneImage)),
        )) {
          const frozen = frozenReferenceBoxes(group.name, appearance, look);
          const { box } = frozen;
          const clip = box && clipOf(box, viewport);
          expect
            .soft(clip, `${look.story}: ${look.selector} is in the reference image`)
            .not.toBeNull();
          if (box && clip) {
            await openStory(page, storyUrl(storybookUrl, look.story, appearance));
            const placeBox = look.placeFrom ? frozen.placeFrom : box;
            const { natural } = await placeStory(
              page,
              look,
              placeBox ?? box,
              pixelAt(reference, clip.x, clip.y),
            );
            if (look.place === undefined && !look.stretched) {
              expect
                .soft(Math.abs(natural.height - box.height), `${look.story}: its height`)
                .toBeLessThanOrEqual(HEIGHT_TOLERANCE_PX);
            }
            if (look.fits) {
              expect
                .soft(Math.abs(natural.width - box.width), `${look.story}: its width`)
                .toBeLessThanOrEqual(HEIGHT_TOLERANCE_PX);
            }
            const actual = PNG.sync.read(
              await page.screenshot({ clip, animations: "disabled", caret: "hide" }),
            );
            const expected = crop(reference, clip);
            for (const area of frozen.mask ?? []) {
              paintOut(expected, area, clip);
              paintOut(actual, area, clip);
            }
            if (look.cornerRadius) {
              paintCorners(expected, box, look.cornerRadius, clip);
              paintCorners(actual, box, look.cornerRadius, clip);
            }
            const { pixels, picture } = difference(expected, actual);
            const allowed = allowedPixels(clip);
            if (pixels > allowed) {
              writeFileSync(testInfo.outputPath(`${look.story}-diff.png`), picture);
              writeFileSync(
                testInfo.outputPath(`${look.story}-expected.png`),
                PNG.sync.write(expected),
              );
              writeFileSync(
                testInfo.outputPath(`${look.story}-actual.png`),
                PNG.sync.write(actual),
              );
            }
            expect
              .soft(
                pixels,
                `${look.story}: different pixels of ${String(clip.width * clip.height)}`,
              )
              .toBeLessThanOrEqual(allowed);
          }
        }
        await context.close();
      },
    );
  }
}
