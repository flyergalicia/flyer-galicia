// The new engine against the printed flyer stored from the current app: the same pixels and the same
// PDF, with no tolerance. It only reads those files: they change through the current app.
import { readFileSync } from "node:fs";
import { platform } from "node:process";
import { fileURLToPath } from "node:url";
import { type DownloadedFile } from "../../support/driver/flyer-output.ts";
import {
  type EngineHarness,
  GOLDEN_CASE_NAMES,
  openEngineHarness,
} from "../../support/flyer-engine/engine-harness.ts";
import {
  decodePng,
  differentPixels,
  type PdfSummary,
  readPdfSummary,
  readZipEntries,
} from "../../support/golden-files.ts";
import { expect, test } from "../../support/test.ts";

const GOLDEN_DIR = fileURLToPath(new URL(`../../../fixtures/golden/${platform}/`, import.meta.url));
const BULK_ROWS = 2;

interface GoldenPdf extends PdfSummary {
  name: string;
}

function stored(file: string): string {
  return `${GOLDEN_DIR}${file}`;
}

function expectSamePng(file: string, { name, bytes }: DownloadedFile): void {
  const expected = decodePng(readFileSync(stored(`${file}.png`)));
  const actual = decodePng(bytes);
  expect.soft(name, "the name of the image").toMatch(/\.png$/);
  expect.soft({ width: actual.width, height: actual.height }, "the size of the image").toEqual({
    width: expected.width,
    height: expected.height,
  });
  expect.soft(differentPixels(actual, expected), "pixels that changed").toBe(0);
}

function expectSamePdf(file: string, { name, bytes }: DownloadedFile): void {
  const summary: GoldenPdf = { name, ...readPdfSummary(bytes) };
  const expected: unknown = JSON.parse(readFileSync(stored(`${file}.pdf.json`), "utf8"));
  expect.soft(summary.imageHashes, "the PDF has its image").toHaveLength(1);
  expect.soft(summary, "name, pages, page size and image of the PDF").toEqual(expected);
}

async function withHarness(
  browser: Parameters<typeof openEngineHarness>[0],
  storybookUrl: string,
  use: (harness: EngineHarness) => Promise<void>,
): Promise<void> {
  const harness = await openEngineHarness(browser, storybookUrl);
  await use(harness);
  await harness.context.close();
}

for (const name of GOLDEN_CASE_NAMES) {
  test(
    `the engine draws the same flyer: ${name}`,
    { tag: "@golden" },
    async ({ browser, storybookUrl }) => {
      await withHarness(browser, storybookUrl, async (harness) => {
        expectSamePng(name, await harness.downloadPng(name));
        expectSamePdf(name, await harness.downloadPdf(name));
      });
    },
  );
}

test(
  "the engine draws the same flyer: bulk ZIP entry",
  { tag: "@golden" },
  async ({ browser, storybookUrl }) => {
    await withHarness(browser, storybookUrl, async (harness) => {
      const zip = await harness.downloadBulkZip();
      const entries = readZipEntries(zip.bytes);
      const pdfs = [...entries.keys()].filter((entry) => entry.endsWith(".pdf")).toSorted();
      expect.soft(pdfs, "one PDF per row").toHaveLength(BULK_ROWS);
      const [first] = pdfs;
      const bytes = first === undefined ? undefined : entries.get(first);
      if (first === undefined || bytes === undefined) throw new Error("The ZIP has no PDF");
      expectSamePdf("bulk-zip-entry", { name: first, bytes });
    });
  },
);

test("a batch brings its summary and one PDF per row", async ({ browser, storybookUrl }) => {
  await withHarness(browser, storybookUrl, async (harness) => {
    const entries = readZipEntries((await harness.downloadBulkZip()).bytes);

    expect([...entries.keys()].toSorted()).toEqual([
      "Flyer ALIMENTOS DEL SUR SA.pdf",
      "Flyer CLINICA DEL PARQUE SA.pdf",
      "Resumen.txt",
    ]);
    expect(entries.get("Resumen.txt")?.toString()).toBe("Flyers generados: 2");
  });
});
