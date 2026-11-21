// Promotion logos come from galicia.ar. Tests must not depend on the internet, so they
// are served from tests/fixtures/logos or, when one is missing, drawn on the spot.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { env } from "node:process";
import { fileURLToPath } from "node:url";
import { crc32, deflateSync } from "node:zlib";
import { type BrowserContext, type Route } from "@playwright/test";

const LOGOS_DIR = fileURLToPath(new URL("../../fixtures/logos/", import.meta.url));
const LOGO_HOST = "https://www.galicia.ar/**";
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp",
};
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const GENERATED_WIDTH = 96;
const GENERATED_HEIGHT = 48;

function safeFileName(url: string): string {
  return decodeURIComponent(new URL(url).pathname)
    .replace(/^.*catalogo-de-beneficios\//, "")
    .replace(/[^\w.-]+/g, "_");
}

function contentTypeOf(file: string): string {
  return CONTENT_TYPES[file.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeAndData = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, checksum]);
}

function isInsideBlock(x: number, y: number): boolean {
  const marginX = GENERATED_WIDTH / 6;
  const marginY = GENERATED_HEIGHT / 6;
  return (
    x >= marginX && x < GENERATED_WIDTH - marginX && y >= marginY && y < GENERATED_HEIGHT - marginY
  );
}

/** A white image with a block whose color depends on the name: same name, same bytes. */
export function generatedLogo(name: string): Buffer {
  const [red = 0, green = 0, blue = 0] = createHash("sha256").update(name).digest();
  const scanlines = Buffer.alloc((GENERATED_WIDTH * 3 + 1) * GENERATED_HEIGHT, 255);
  let offset = 0;
  for (let y = 0; y < GENERATED_HEIGHT; y += 1) {
    scanlines[offset] = 0;
    offset += 1;
    for (let x = 0; x < GENERATED_WIDTH; x += 1) {
      if (isInsideBlock(x, y)) scanlines.set([red >> 1, green >> 1, blue >> 1], offset);
      offset += 3;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(GENERATED_WIDTH, 0);
  header.writeUInt32BE(GENERATED_HEIGHT, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(scanlines, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

async function fetchRealLogo(route: Route): Promise<Buffer | null> {
  try {
    const response = await route.fetch();
    return response.ok() ? await response.body() : null;
  } catch {
    return null;
  }
}

async function logoBytes(route: Route, file: string): Promise<{ body: Buffer; type: string }> {
  const path = LOGOS_DIR + file;
  if (existsSync(path)) return { body: readFileSync(path), type: contentTypeOf(file) };
  const recorded = env.FLYER_RECORD_LOGOS === "1" ? await fetchRealLogo(route) : null;
  if (recorded) {
    mkdirSync(LOGOS_DIR, { recursive: true });
    writeFileSync(path, recorded);
    return { body: recorded, type: contentTypeOf(file) };
  }
  return { body: generatedLogo(file), type: "image/png" };
}

export async function installLogoRoute(context: BrowserContext): Promise<void> {
  await context.route(LOGO_HOST, async (route) => {
    const file = safeFileName(route.request().url());
    const { body, type } = await logoBytes(route, file);
    await route.fulfill({
      status: 200,
      body,
      headers: { "Access-Control-Allow-Origin": "*", "Content-Type": type },
    });
  });
}
