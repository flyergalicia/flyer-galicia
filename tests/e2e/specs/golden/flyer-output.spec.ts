// The printed flyer must not change: what comes out of the real buttons, compared with the files
// stored from the current app. Update them with --update-snapshots, and only on purpose.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { platform } from "node:process";
import { fileURLToPath } from "node:url";
import { type DownloadedFile } from "../../support/driver/flyer-output.ts";
import {
  decodePng,
  differentPixels,
  type PdfSummary,
  readPdfSummary,
  readZipEntries,
} from "../../support/golden-files.ts";
import { type OpenedApp } from "../../support/open-app.ts";
import { expect, test } from "../../support/test.ts";

const GOLDEN_DIR = fileURLToPath(new URL(`../../../fixtures/golden/${platform}/`, import.meta.url));
const OFFICERS = [
  { name: "Ana Perez", phone: "11 4444 5555", email: "ana.perez@bancogalicia.com.ar" },
  { name: "Luis Gomez", phone: "11 4444 6666", email: "luis.gomez@bancogalicia.com.ar" },
  { name: "Sara Rios", phone: "11 4444 7777", email: "sara.rios@bancogalicia.com.ar" },
  { name: "Juan Diaz", phone: "11 4444 8888", email: "juan.diaz@bancogalicia.com.ar" },
];
const COMPANY = "ALIMENTOS DEL SUR SA";
const FIRST_LOGO = { x: 850, y: 2708 };
const THIRD_LOGO = { x: 498, y: 2820 };
const CASHBACK_BAND = { from: 690, to: 1030 };
const BULK_SHEET = [
  ["empresa", "config", "asesor1_nombre", "asesor1_celular", "asesor1_email"],
  [COMPANY, "BAU", "Ana Perez", "11 4444 5555", "ana.perez@bancogalicia.com.ar"],
  ["CLINICA DEL PARQUE SA", "BAU", "Luis Gomez", "11 4444 6666", "luis.gomez@bancogalicia.com.ar"],
];

interface GoldenPdf extends PdfSummary {
  name: string;
}

function isUpdating(): boolean {
  const { updateSnapshots } = test.info().config;
  return updateSnapshots === "all" || updateSnapshots === "changed";
}

function stored(file: string): string {
  return `${GOLDEN_DIR}${file}`;
}

function keepOrRequire(file: string, content: Buffer | string): void {
  if (isUpdating()) {
    mkdirSync(GOLDEN_DIR, { recursive: true });
    writeFileSync(stored(file), content);
  }
  expect(existsSync(stored(file)), `${file} is stored; run with --update-snapshots`).toBe(true);
}

function expectSamePng(file: string, { name, bytes }: DownloadedFile): void {
  keepOrRequire(`${file}.png`, bytes);
  expect.soft(name, "the name of the image").toMatch(/\.png$/);
  const expected = decodePng(readFileSync(stored(`${file}.png`)));
  const actual = decodePng(bytes);
  expect.soft({ width: actual.width, height: actual.height }, "the size of the image").toEqual({
    width: expected.width,
    height: expected.height,
  });
  expect.soft(differentPixels(actual, expected), "pixels that changed").toBe(0);
}

function expectSamePdf(file: string, { name, bytes }: DownloadedFile): void {
  const summary: GoldenPdf = { name, ...readPdfSummary(bytes) };
  keepOrRequire(`${file}.pdf.json`, `${JSON.stringify(summary, null, 2)}\n`);
  expect.soft(summary.imageHashes, "the PDF has its image").toHaveLength(1);
  const expected: unknown = JSON.parse(readFileSync(stored(`${file}.pdf.json`), "utf8"));
  expect.soft(summary, "name, pages, page size and image of the PDF").toEqual(expected);
}

interface OutputCase {
  name: string;
  prepare: (app: OpenedApp) => Promise<void>;
}

const CASES: readonly OutputCase[] = [
  {
    name: "one-officer-with-amounts",
    prepare: ({ flyerOutput }) =>
      flyerOutput.fillForm({ company: COMPANY, officers: OFFICERS.slice(0, 1) }),
  },
  {
    name: "four-officers",
    prepare: ({ flyerOutput }) => flyerOutput.fillForm({ company: COMPANY, officers: OFFICERS }),
  },
  {
    name: "no-officers",
    prepare: async ({ flyerOutput }) => {
      await flyerOutput.fillForm({ company: COMPANY, officers: OFFICERS.slice(0, 1) });
      await flyerOutput.toggleOfficersOnFlyer();
    },
  },
  {
    name: "changed-logos",
    prepare: async ({ flyerOutput, logoEditor }) => {
      await flyerOutput.fillForm({ company: COMPANY, officers: OFFICERS.slice(0, 1) });
      await logoEditor.enter();
      await logoEditor.waitForBrandCatalog();
      await logoEditor.replaceWithBrand(FIRST_LOGO, "farmacia del pueblo");
      await logoEditor.replaceWithBrand(THIRD_LOGO, "scienza");
    },
  },
  {
    name: "cropped",
    prepare: async ({ flyerOutput, flyerSections, logoEditor }) => {
      await flyerOutput.fillForm({ company: COMPANY, officers: OFFICERS.slice(0, 1) });
      await logoEditor.enter();
      await flyerSections.toggleCropping();
      await flyerSections.dragCropBand(CASHBACK_BAND.from, CASHBACK_BAND.to);
      await flyerSections.confirmCrop();
    },
  },
];

for (const { name, prepare } of CASES) {
  test(`the flyer comes out the same: ${name}`, { tag: "@golden" }, async ({ openApp }) => {
    const app = await openApp();
    await prepare(app);

    expectSamePng(name, await app.flyerOutput.pressDownloadPng());
    expectSamePdf(name, await app.flyerOutput.pressDownloadPdf());
  });
}

test("the flyer comes out the same: bulk ZIP entry", { tag: "@golden" }, async ({ openApp }) => {
  const { flyerEditor, flyerOutput } = await openApp();
  await flyerEditor.uploadExcelSheet(BULK_SHEET);

  const zip = await flyerOutput.pressGenerateZip();

  const entries = readZipEntries(zip.bytes);
  const pdfs = [...entries.keys()].filter((entry) => entry.endsWith(".pdf")).toSorted();
  expect.soft(pdfs, "one PDF per row").toHaveLength(BULK_SHEET.length - 1);
  const [first] = pdfs;
  const bytes = first === undefined ? undefined : entries.get(first);
  if (first === undefined || bytes === undefined) throw new Error("The ZIP has no PDF");
  expectSamePdf("bulk-zip-entry", { name: first, bytes });
});
