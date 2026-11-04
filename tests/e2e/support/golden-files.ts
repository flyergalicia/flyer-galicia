// Reads flyers as files, without libraries: what a PNG, a PDF and a ZIP have that does not change
// from one run to the next, so that the printed flyer can be compared with the stored one.
import { createHash } from "node:crypto";
import { inflateRawSync, inflateSync } from "node:zlib";

export interface PdfSummary {
  pages: number;
  /** Width and height of each page, in points. */
  pageSizes: { width: number; height: number }[];
  /** SHA-256 of the bytes of each image embedded, in the order of the file. */
  imageHashes: string[];
}

export interface PngPixels {
  width: number;
  height: number;
  /** RGBA, row after row: the same whatever the way the file was compressed. */
  rgba: Buffer;
}

const PNG_SIGNATURE = "89504e470d0a1a0a";
const COLOR_RGB = 2;
const COLOR_RGBA = 6;
const OPAQUE = 255;
const ZIP_END_SIGNATURE = 0x06_05_4b_50;
const ZIP_ENTRY_SIGNATURE = 0x02_01_4b_50;
const ZIP_STORED = 0;

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function imageStreams(bytes: Buffer, text: string): Buffer[] {
  const images = /\/Subtype\s*\/Image[^]*?\/Length\s+(\d+)[^]*?stream\r?\n/g;
  return [...text.matchAll(images)].map((match) => {
    const start = match.index + match[0].length;
    return bytes.subarray(start, start + Number(match[1]));
  });
}

/** Reads the parts of a PDF that its bytes do not hide: its dates and ids are left out. */
export function readPdfSummary(bytes: Buffer): PdfSummary {
  // latin1 keeps one character per byte, so positions in the text are positions in the file.
  const text = bytes.toString("latin1");
  const pages = [...text.matchAll(/\/Type\s*\/Page\b[^]*?endobj/g)].map(([object]) => object);
  return {
    pages: pages.length,
    pageSizes: pages.map((page) => {
      const box = page.match(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
      return {
        width: Number(box?.[3] ?? 0) - Number(box?.[1] ?? 0),
        height: Number(box?.[4] ?? 0) - Number(box?.[2] ?? 0),
      };
    }),
    imageHashes: imageStreams(bytes, text).map(sha256),
  };
}

function pngChunks(bytes: Buffer): { header: Buffer; data: Buffer } {
  if (bytes.subarray(0, 8).toString("hex") !== PNG_SIGNATURE) throw new Error("It is not a PNG");
  let header: Buffer = Buffer.alloc(0);
  const parts: Buffer[] = [];
  let offset = 8;
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("latin1", offset + 4, offset + 8);
    const content = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") header = content;
    if (type === "IDAT") parts.push(content);
    offset += 12 + length;
  }
  return { header, data: inflateSync(Buffer.concat(parts)) };
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const toLeft = Math.abs(estimate - left);
  const toUp = Math.abs(estimate - up);
  const toUpLeft = Math.abs(estimate - upLeft);
  if (toLeft <= toUp && toLeft <= toUpLeft) return left;
  return toUp <= toUpLeft ? up : upLeft;
}

/** The value a filter of the PNG format predicts for a byte, from its neighbors. */
function predicted(filter: number, left: number, up: number, upLeft: number): number {
  const predictions = [0, left, up, (left + up) >> 1, paeth(left, up, upLeft)];
  const prediction = predictions[filter];
  if (prediction === undefined) throw new Error(`Unknown PNG filter ${String(filter)}`);
  return prediction;
}

function unfilterRows(data: Buffer, height: number, rowBytes: number, channels: number): Buffer {
  const out = Buffer.alloc(height * rowBytes);
  for (let row = 0; row < height; row += 1) {
    const source = row * (rowBytes + 1);
    const target = row * rowBytes;
    const filter = data[source] ?? 0;
    for (let index = 0; index < rowBytes; index += 1) {
      const left = index >= channels ? (out[target + index - channels] ?? 0) : 0;
      const up = row > 0 ? (out[target + index - rowBytes] ?? 0) : 0;
      const upLeft =
        row > 0 && index >= channels ? (out[target + index - rowBytes - channels] ?? 0) : 0;
      const value = (data[source + 1 + index] ?? 0) + predicted(filter, left, up, upLeft);
      out[target + index] = value & 255;
    }
  }
  return out;
}

function toRgba(pixels: Buffer, width: number, height: number): Buffer {
  const rgba = Buffer.alloc(width * height * 4, OPAQUE);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    pixels.copy(rgba, pixel * 4, pixel * 3, pixel * 3 + 3);
  }
  return rgba;
}

/** Decodes the kind of PNG a browser writes: 8 bits per channel, RGB or RGBA, not interlaced. */
export function decodePng(bytes: Buffer): PngPixels {
  const { header, data } = pngChunks(bytes);
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const colorType = header[9];
  if (
    header[8] !== 8 ||
    header[12] !== 0 ||
    (colorType !== COLOR_RGB && colorType !== COLOR_RGBA)
  ) {
    throw new Error("Only 8-bit RGB or RGBA PNG files without interlacing are read");
  }
  const channels = colorType === COLOR_RGBA ? 4 : 3;
  const pixels = unfilterRows(data, height, width * channels, channels);
  return { width, height, rgba: channels === 4 ? pixels : toRgba(pixels, width, height) };
}

/** How many pixels differ; a different size counts as all of them. */
export function differentPixels(first: PngPixels, second: PngPixels): number {
  if (first.width !== second.width || first.height !== second.height) {
    return Math.max(first.width * first.height, second.width * second.height);
  }
  let count = 0;
  for (let offset = 0; offset < first.rgba.length; offset += 4) {
    if (first.rgba.compare(second.rgba, offset, offset + 4, offset, offset + 4) !== 0) count += 1;
  }
  return count;
}

/** The files of a ZIP without folders, by name. */
export function readZipEntries(bytes: Buffer): Map<string, Buffer> {
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0 || bytes.readUInt32LE(end) !== ZIP_END_SIGNATURE) throw new Error("It is not a ZIP");
  const entries = new Map<string, Buffer>();
  const total = bytes.readUInt16LE(end + 10);
  let offset = bytes.readUInt32LE(end + 16);
  for (let index = 0; index < total; index += 1) {
    if (bytes.readUInt32LE(offset) !== ZIP_ENTRY_SIGNATURE) throw new Error("Damaged ZIP");
    const method = bytes.readUInt16LE(offset + 10);
    const size = bytes.readUInt32LE(offset + 20);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const local = bytes.readUInt32LE(offset + 42);
    const name = bytes.toString("utf8", offset + 46, offset + 46 + nameLength);
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    const stored = bytes.subarray(start, start + size);
    if (!name.endsWith("/")) {
      entries.set(name, method === ZIP_STORED ? stored : inflateRawSync(stored));
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
