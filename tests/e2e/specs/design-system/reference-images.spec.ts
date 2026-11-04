// Each component on top of the reference images of the current app: the part that a component is
// responsible for, in its place on the screen, compared pixel by pixel. See docs/PLAN_MIGRACION_REACT.md.
import {
  APPEARANCES,
  type AppearanceName,
  type LookCase,
  type ScreenGroup,
  SCREEN_GROUPS,
} from "../../support/design-system/cases.ts";
import {
  type Box,
  allowedPixels,
  clipOf,
  crop,
  difference,
  paintCorners,
  paintOut,
  pixelAt,
  referenceImage,
} from "../../support/design-system/images.ts";
import {
  legacyElement,
  openStory,
  placeStory,
  storyUrl,
  visibleBox,
} from "../../support/design-system/look.ts";
import { seedReferenceData } from "../visual/reference-data.ts";
import { writeFileSync } from "node:fs";
import { type OpenedApp } from "../../support/open-app.ts";
import { expect, test } from "../../support/test.ts";
import { PNG } from "pngjs";

const HEIGHT_TOLERANCE_PX = 0.51;

function optionsOf(group: ScreenGroup, appearance: AppearanceName) {
  const { viewport, touch } = APPEARANCES[appearance];
  return {
    viewport,
    touch,
    commercialActions: Boolean(group.commercialActions),
    waitUntilReady: !group.noFlyer,
    signedOut: Boolean(group.signedOut),
    ...(group.user === undefined ? {} : { user: group.user }),
  };
}

async function maskBoxes(app: OpenedApp, look: LookCase): Promise<Box[]> {
  const boxes = await Promise.all(
    (look.mask ?? []).map((selector) => app.page.locator(selector).first().boundingBox()),
  );
  return boxes.filter((box) => box !== null);
}

for (const group of SCREEN_GROUPS) {
  for (const appearance of group.appearances) {
    test(
      `${group.name}, ${appearance}: over the reference image`,
      { tag: "@visual" },
      async ({ cloud, openApp, browser, storybookUrl }, testInfo) => {
        seedReferenceData(cloud);
        const reference = referenceImage(`${group.image}--${appearance}`);
        const app = await openApp(optionsOf(group, appearance));
        const { dark, palette, viewport, touch } = APPEARANCES[appearance];
        await app.page.emulateMedia({ reducedMotion: "reduce" });
        await app.screens.setAppearance({ dark, palette });
        await app.screens.open(group.screen);

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
          const box = await visibleBox(legacyElement(app.page, look));
          const clip = box && clipOf(box, viewport);
          expect
            .soft(clip, `${look.story}: ${look.legacy} is in the reference image`)
            .not.toBeNull();
          if (box && clip) {
            await openStory(page, storyUrl(storybookUrl, look.story, appearance));
            const placeBox = look.placeFrom
              ? await app.page.locator(look.placeFrom).first().boundingBox()
              : box;
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
            for (const area of await maskBoxes(app, look)) {
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
