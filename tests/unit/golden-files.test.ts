import { crc32, deflateRawSync, deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  decodePng,
  differentPixels,
  readPdfSummary,
  readZipEntries,
} from "../e2e/support/golden-files.ts";
import { generatedLogo } from "../e2e/support/logos.ts";
import { inlineFiles } from "../e2e/support/startup-weight.ts";

const SIGNATURE = Buffer.from("89504e470d0a1a0a", "hex");
const JPEG = Buffer.from([0xff, 0xd8, 0x00, 0x0a, 0x0d, 0xff, 0xd9]);

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, checksum]);
}

/** A 2x2 RGBA PNG whose rows use the given filters over the raw bytes. */
function rgbaPng(rows: Buffer[]): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(2, 0);
  header.writeUInt32BE(rows.length, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function pdf(mediaBox: string, image: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from(
      "%PDF-1.3\n1 0 obj\n<</Type /Pages /Kids [3 0 R] /Count 1>>\nendobj\n" +
        `3 0 obj\n<</Type /Page /Parent 1 0 R /MediaBox [0 0 ${mediaBox}] /Contents 4 0 R>>\nendobj\n` +
        "/CreationDate (D:20261104)\n" +
        `5 0 obj\n<</Type /XObject /Subtype /Image /Width 1 /Height 1 /Filter /DCTDecode /Length ${String(image.length)}>>\nstream\n`,
      "latin1",
    ),
    image,
    Buffer.from("\nendstream\nendobj\n", "latin1"),
  ]);
}

function zipWith(name: string, content: string, method: 0 | 8): Buffer {
  const raw = Buffer.from(content);
  const stored = method === 8 ? deflateRawSync(raw) : raw;
  const fileName = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04_03_4b_50, 0);
  local.writeUInt16LE(method, 8);
  local.writeUInt32LE(stored.length, 18);
  local.writeUInt16LE(fileName.length, 26);
  const entry = Buffer.alloc(46);
  entry.writeUInt32LE(0x02_01_4b_50, 0);
  entry.writeUInt16LE(method, 10);
  entry.writeUInt32LE(stored.length, 20);
  entry.writeUInt16LE(fileName.length, 28);
  const body = Buffer.concat([local, fileName, stored]);
  const directory = Buffer.concat([entry, fileName]);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06_05_4b_50, 0);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(body.length, 16);
  return Buffer.concat([body, directory, end]);
}

function hashOf(bytes: Buffer): string[] {
  return readPdfSummary(bytes).imageHashes;
}

function pixels(...rgba: number[]) {
  return { width: 2, height: 1, rgba: Buffer.from(rgba) };
}

describe("readPdfSummary", () => {
  it("reads pages, page size and the hash of the image", () => {
    const summary = readPdfSummary(pdf("595.28 2894.5", JPEG));

    expect(summary.pages).toBe(1);
    expect(summary.pageSizes).toEqual([{ width: 595.28, height: 2894.5 }]);
    expect(summary.imageHashes).toHaveLength(1);
  });

  it("does not take the list of pages for a page", () => {
    expect(readPdfSummary(pdf("10 10", JPEG)).pages).toBe(1);
  });

  it("the hash covers the bytes of the image and nothing else", () => {
    const sameImage = pdf("10 10", JPEG).toString("latin1").replace("20261104", "20300101");

    expect(hashOf(Buffer.from(sameImage, "latin1"))).toEqual(hashOf(pdf("10 10", JPEG)));
    expect(hashOf(pdf("10 10", Buffer.from([1, 2, 3])))).not.toEqual(hashOf(pdf("10 10", JPEG)));
  });
});

describe("decodePng", () => {
  it("undoes every filter a PNG row can use", () => {
    const first = [10, 20, 30, 255, 40, 50, 60, 255];
    const none = Buffer.from([0, ...first]);
    // Sub: each byte minus the one of the previous pixel.
    const sub = Buffer.from([1, 10, 20, 30, 255, 30, 30, 30, 0]);
    // Up: each byte minus the one above.
    const up = Buffer.from([2, 0, 0, 0, 0, 0, 0, 0, 0]);
    // Average: each byte minus the mean of left and above.
    const average = Buffer.from([3, 5, 10, 15, 128, 15, 15, 15, 0]);
    // Paeth: with no change at all, each byte equals its prediction.
    const paeth = Buffer.from([4, 0, 0, 0, 0, 0, 0, 0, 0]);

    const { width, height, rgba } = decodePng(rgbaPng([none, sub, up, average, paeth]));

    expect({ width, height }).toEqual({ width: 2, height: 5 });
    for (let row = 0; row < height; row += 1) {
      expect([...rgba.subarray(row * 8, row * 8 + 8)], `row ${String(row)}`).toEqual(first);
    }
  });

  it("gives RGB files an opaque alpha", () => {
    const { width, height, rgba } = decodePng(generatedLogo("any"));

    expect(rgba).toHaveLength(width * height * 4);
    expect(rgba[3]).toBe(255);
  });

  it("refuses what is not a PNG", () => {
    expect(() => decodePng(Buffer.from("not a png"))).toThrow(/not a PNG/);
  });
});

describe("differentPixels", () => {
  it("is zero for the same pixels and counts each one that changed", () => {
    const base = pixels(1, 2, 3, 255, 4, 5, 6, 255);

    expect(differentPixels(base, pixels(1, 2, 3, 255, 4, 5, 6, 255))).toBe(0);
    expect(differentPixels(base, pixels(1, 2, 3, 255, 4, 5, 7, 255))).toBe(1);
  });

  it("counts a different size as all of them", () => {
    const small = { width: 1, height: 1, rgba: Buffer.from([0, 0, 0, 255]) };

    expect(differentPixels(pixels(0, 0, 0, 255, 0, 0, 0, 255), small)).toBe(2);
  });
});

describe("readZipEntries", () => {
  it("reads stored and compressed files", () => {
    expect(
      readZipEntries(zipWith("a.txt", "hola", 0))
        .get("a.txt")
        ?.toString(),
    ).toBe("hola");
    expect(
      readZipEntries(zipWith("b/c.txt", "chau", 8))
        .get("b/c.txt")
        ?.toString(),
    ).toBe("chau");
  });

  it("leaves folders out", () => {
    expect([...readZipEntries(zipWith("carpeta/", "", 0)).keys()]).toEqual([]);
  });

  it("refuses what is not a ZIP", () => {
    expect(() => readZipEntries(Buffer.from("nada"))).toThrow(/not a ZIP/);
  });
});

describe("inlineFiles", () => {
  it("counts the blocks written in the page, not those with a source", () => {
    const html = '<style>a{}</style><script src="x.js"></script><script>var a;</script>';

    expect(inlineFiles(html, "index.html").map(({ kind, raw }) => [kind, raw])).toEqual([
      ["css", 3],
      ["javascript", 6],
    ]);
  });
});
