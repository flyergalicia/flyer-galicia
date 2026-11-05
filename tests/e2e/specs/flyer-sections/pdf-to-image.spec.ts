// Replaces pruebas/t98_pdf_a_imagen.cjs.
import { fixtureFile } from "../../support/cloud/index.ts";
import { type PdfImageReading } from "../../support/driver/flyer-sections.ts";
import { buildSamplePdf, SAMPLE_HEIGHT } from "../../support/pdf-sample.ts";
import { expect, test } from "../../support/test.ts";

const READER_VERSION = "6.5.438";
// The versions differ in the place and the name: from a CDN as they come, or from the site with a hash.
const WORKER_ROUTE = "**/*pdf.worker.min*.mjs";
const OPENJPEG_ROUTE = "**/*openjpeg*.wasm";
const WORKER_WAIT_MS = 2500;
const PROBES = {
  points: {
    faxWhite: { x: 52, y: 140 },
    faxBlack: { x: 77, y: 140 },
    jpeg2000: { x: 380, y: 140 },
    postScript: { x: 620, y: 140 },
    cmyk: { x: 860, y: 140 },
    group: { x: 1100, y: 140 },
  },
  inkRegion: { x: 280, y: 340, width: 500, height: 70 },
};
const SAMPLE = buildSamplePdf({ jp2: fixtureFile("muestra.jp2"), jp2Width: 32, jp2Height: 32 });

const isRed = (color: readonly number[] | undefined): boolean =>
  (color?.[0] ?? 0) > 190 && (color?.[1] ?? 255) < 80 && (color?.[2] ?? 255) < 80;

function checkColors(colors: PdfImageReading["colors"] | undefined): void {
  expect.soft(colors?.faxWhite?.[0], "CCITT fax: white stripes").toBeGreaterThan(240);
  expect.soft(colors?.faxBlack?.[0], "and black stripes").toBeLessThan(20);
  expect.soft(isRed(colors?.jpeg2000), "JPEG 2000: the red square shows").toBe(true);
  expect.soft(isRed(colors?.postScript), "ink with a PostScript function: red").toBe(true);
  expect.soft(isRed(colors?.cmyk), "CMYK: red").toBe(true);
  expect.soft(colors?.group?.[0], "transparency group: red at 50 %").toBeGreaterThan(200);
  expect.soft(colors?.group?.[1], "not white").toBeLessThan(170);
  expect.soft(colors?.group?.[1], "nor pure red").toBeGreaterThan(90);
}

test(
  "a PDF is converted under the real security policy, with all it can bring",
  { tag: "@react" },
  async ({ openApp }) => {
    const app = await openApp({ user: "admin" });
    const urls: string[] = [];
    const blocked: string[] = [];
    app.page.on("requestfinished", (request) => urls.push(request.url()));
    app.page.on("console", (message) => {
      if (/Content Security Policy|Refused/i.test(message.text())) blocked.push(message.text());
    });

    const reading = await app.flyerSections.convertPdf(SAMPLE, PROBES);
    expect.soft(reading, "the PDF converts").not.toBeNull();
    expect
      .soft(await app.flyerSections.pdfReaderVersion(), "with the expected reader")
      .toBe(READER_VERSION);
    expect.soft(reading?.width, "it comes out 1240 px wide").toBe(1240);
    expect.soft(reading?.height, "and with a proportional height").toBe(SAMPLE_HEIGHT * 2);
    checkColors(reading?.colors);
    expect.soft(reading?.darkPixels, "text with no embedded font is drawn").toBeGreaterThan(300);

    const wasm = urls.filter((url) => url.endsWith(".wasm"));
    expect
      .soft(
        wasm.some((url) => /openjpeg[^/]*\.wasm$/.test(url)),
        "it downloads the WASM for JPEG 2000",
      )
      .toBe(true);
    expect
      .soft(
        wasm.some((url) => /jbig2[^/]*\.wasm$/.test(url)),
        "and the one for fax",
      )
      .toBe(true);
    expect
      .soft(
        urls.filter((url) => /nowasm_fallback|qcms|\.bcmap/.test(url)),
        "it downloads nothing else that is not verified",
      )
      .toEqual([]);
    expect.soft(blocked, "the security policy blocks nothing").toEqual([]);
    expect
      .soft(
        await app.flyerSections.convertPdf(SAMPLE, PROBES),
        "a second PDF comes out the same, the reader already loaded",
      )
      .toEqual(reading);
    const policy = await app.flyerSections.securityPolicy();
    expect.soft(policy, "the policy lets WASM compile").toMatch(/wasm-unsafe-eval/);
    expect.soft(policy, "without opening eval").not.toMatch(/'unsafe-eval'/);
    expect.soft(app.pageErrors(), "no JavaScript errors").toEqual([]);
  },
);

test(
  "a tampered WASM does not run: that image is missing but the conversion ends",
  { tag: "@react" },
  async ({ openApp }) => {
    const app = await openApp({
      user: "admin",
      beforeNavigation: async (page) => {
        await page.route(OPENJPEG_ROUTE, async (route) => {
          const response = await route.fetch();
          const body = await response.body();
          body[body.length - 1] = (body.at(-1) ?? 0) ^ 255;
          await route.fulfill({ response, body });
        });
      },
    });

    const reading = await app.flyerSections.convertPdf(SAMPLE, PROBES);

    expect.soft(reading, "the conversion ends").not.toBeNull();
    expect.soft(isRed(reading?.colors.jpeg2000), "the JPEG 2000 is not decoded").toBe(false);
    expect.soft(isRed(reading?.colors.cmyk), "and the rest of the PDF comes out anyway").toBe(true);
  },
);

test("a tampered worker does not run and it warns", { tag: "@react" }, async ({ openApp }) => {
  const app = await openApp({
    user: "admin",
    beforeNavigation: async (page) => {
      await page.route(WORKER_ROUTE, async (route) => {
        const response = await route.fetch();
        await route.fulfill({ response, body: `${await response.text()}\n// tampered` });
      });
    },
  });
  const requested: string[] = [];
  app.page.on("request", (request) => {
    if (request.url().includes("pdf.worker")) requested.push(request.url());
  });

  const converted = await app.flyerSections.tryConvertPdf(SAMPLE, WORKER_WAIT_MS);

  expect
    .soft(await app.flyerEditor.latestNotice(), "with the worker tampered it warns")
    .toMatch(/No se pudo cargar el lector de PDF/);
  expect.soft(converted, "and converts nothing").toBe(false);
  expect.soft(requested, "it does not ask for it again by another path").toHaveLength(1);
});
