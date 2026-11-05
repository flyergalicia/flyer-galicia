// Replaces pruebas/t89_pdf_bandas.cjs.
// Real flyers are not versioned because the repository is public: they are passed with
// FG_PDFS="path1;path2". Without the variable there is nothing to compare and this skips.
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { env } from "node:process";
import { expect, test } from "../../support/test.ts";

const OLD_BAND = 1600;
const NEW_BAND = 3600;
const PDFS = (env.FG_PDFS ?? "").split(";").filter((file) => file && existsSync(file));

test(
  "a PDF converted with tall bands is the same image, in no more time",
  { tag: "@react" },
  async ({ openApp }) => {
    test.skip(PDFS.length === 0, "No FG_PDFS: there is no PDF to compare");
    const app = await openApp({ user: "admin" });
    for (const file of PDFS) {
      const name = basename(file);
      const result = await app.flyerSections.compareBandHeights(readFileSync(file), name, [
        OLD_BAND,
        NEW_BAND,
      ]);
      expect.soft(result.failed, `${name}: it converts`).toBe(false);
      expect.soft(result.heightB, `${name}: it has the same height`).toBe(result.heightA);
      expect.soft(result.meanDifference, `${name}: the image is the same`).toBeLessThan(1.5);
      expect.soft(result.differentRows, `${name}: with hardly any row apart`).toBeLessThan(10);
      expect
        .soft(result.millisecondsB, `${name}: it takes no longer`)
        .toBeLessThanOrEqual(result.millisecondsA * 1.1);
    }
    expect.soft(app.pageErrors(), "no JavaScript errors").toEqual([]);
  },
);
