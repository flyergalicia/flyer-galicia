// Builds a sample PDF, without libraries, with what the PDF reader of the app has to know how to
// draw: a JPEG photo with a soft mask (as the flyers of Galicia), a transparency group, JPEG 2000
// and CCITT fax (pdf.js 6 decodes those with WebAssembly), an ink with a PostScript function, CMYK
// and text. It is all made up, and each area has a known color to check.
import { deflateSync } from "node:zlib";

/** Height in points; with a width of 620, a 1240 px wide image has a scale of 2. */
export const SAMPLE_HEIGHT = 800;
const SAMPLE_WIDTH = 620;

interface PdfObject {
  dict: string;
  stream?: Buffer;
}

export interface SampleOptions {
  jp2: Buffer;
  jp2Width: number;
  jp2Height: number;
  jpg?: { bytes: Buffer; width: number; height: number };
  icc?: Buffer;
  height?: number;
}

/** CCITT G4 fax of vertical stripes: 8 white and 8 black, repeated. */
function faxStripes(width: number, height: number): Buffer {
  let bits = "";
  // The first row goes in horizontal mode: 001 = horizontal, 10011 = 8 whites, 000101 = 8 blacks.
  for (let x = 0; x < width; x += 16) bits += "00110011000101";
  // The others equal the one above: vertical mode V0, one "1" per color change.
  for (let y = 1; y < height; y += 1) {
    for (let x = 0; x < width; x += 8) bits += "1";
  }
  bits += "000000000001000000000001";
  while (bits.length % 8) bits += "0";
  const bytes = (bits.match(/.{8}/g) ?? []).map((byte) => Number.parseInt(byte, 2));
  return Buffer.from(bytes);
}

class PdfObjects {
  readonly list: PdfObject[] = [];

  add(dict: string, stream?: Buffer): number {
    this.list.push(stream ? { dict, stream } : { dict });
    return this.list.length;
  }

  set(id: number, dict: string, stream?: Buffer): void {
    this.list[id - 1] = stream ? { dict, stream } : { dict };
  }
}

function softMask(objects: PdfObjects): number {
  const size = 64;
  const mask = deflateSync(
    Buffer.from(
      Array.from({ length: size * size }, (_, index) =>
        Math.round((255 * (index % size)) / (size - 1)),
      ),
    ),
  );
  return objects.add(
    `<< /Type /XObject /Subtype /Image /Width 64 /Height 64 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${String(mask.length)} >>`,
    mask,
  );
}

function photos(
  objects: PdfObjects,
  mask: number,
  jpg: SampleOptions["jpg"],
): { withMask: number; plain: number } | null {
  if (!jpg) return null;
  const head = `<< /Type /XObject /Subtype /Image /Width ${String(jpg.width)} /Height ${String(jpg.height)} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`;
  const length = `/Length ${String(jpg.bytes.length)} >>`;
  return {
    withMask: objects.add(`${head} /SMask ${String(mask)} 0 R ${length}`, jpg.bytes),
    plain: objects.add(`${head} ${length}`, jpg.bytes),
  };
}

function photoDrawing(jpg: NonNullable<SampleOptions["jpg"]>, height: number): string {
  const drawn = Math.round((600 * jpg.height) / jpg.width);
  let content = `q 600 0 0 ${String(drawn)} 10 ${String(height - 260 - drawn)} cm /Foto Do Q\n`;
  let y = height - 260 - drawn;
  while (y - drawn - 10 > 0) {
    y -= drawn + 10;
    content += `q 600 0 0 ${String(drawn)} 10 ${String(y)} cm /${y % 2 ? "Foto" : "FotoSin"} Do Q\n`;
  }
  return content;
}

function pageContent(
  height: number,
  { hasIcc, jpg }: { hasIcc: boolean; jpg: SampleOptions["jpg"] },
): Buffer {
  // PDF counts from the bottom: below(n) leaves the area n points from the top edge.
  const below = (points: number) => String(height - points - 100);
  let content = `1 1 1 rg 0 0 620 ${String(height)} re f\n`;
  content += `q 100 0 0 100 20 ${below(20)} cm /Fax Do Q\n`; // fax: white and black stripes
  content += `q 100 0 0 100 140 ${below(20)} cm /Jpx Do Q\n`; // JPEG 2000: red
  content += `q /Tinta cs 1 scn 260 ${below(20)} 100 100 re f Q\n`; // PostScript: red, as CMYK
  content += `q 0 1 1 0 k 380 ${below(20)} 100 100 re f Q\n`; // CMYK
  content += `q 1 0 0 1 500 ${below(20)} cm /Luz gs /Grupo Do Q\n`; // red group with a 50 % mask
  if (hasIcc) content += `q /Icc cs 0 0.5 1 sc 20 ${below(140)} 100 100 re f Q\n`;
  content += `BT /F1 28 Tf 0 0 0 rg 140 ${String(height - 140 - 100 + 40)} Td (Prueba de PDF) Tj ET\n`;
  if (jpg) content += photoDrawing(jpg, height);
  return Buffer.from(content);
}

function serialize(objects: readonly PdfObject[], catalog: number): Buffer {
  const parts = [Buffer.from("%PDF-1.7\n%âãÏÓ\n", "latin1")];
  let position = parts[0]?.length ?? 0;
  const offsets: number[] = [];
  for (const [index, { dict, stream }] of objects.entries()) {
    offsets.push(position);
    const id = String(index + 1);
    const part = stream
      ? Buffer.concat([
          Buffer.from(`${id} 0 obj\n${dict}\nstream\n`),
          stream,
          Buffer.from("\nendstream\nendobj\n"),
        ])
      : Buffer.from(`${id} 0 obj\n${dict}\nendobj\n`);
    parts.push(part);
    position += part.length;
  }
  const size = String(objects.length + 1);
  let xref = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (const offset of offsets) xref += `${String(offset).padStart(10, "0")} 00000 n \n`;
  parts.push(
    Buffer.from(
      `${xref}trailer\n<< /Size ${size} /Root ${String(catalog)} 0 R >>\nstartxref\n${String(position)}\n%%EOF\n`,
    ),
  );
  return Buffer.concat(parts);
}

export function buildSamplePdf(options: SampleOptions): Buffer {
  const { jp2, jp2Width, jp2Height, jpg, icc, height = SAMPLE_HEIGHT } = options;
  const objects = new PdfObjects();
  const catalog = objects.add("");
  const pages = objects.add("");
  const page = objects.add("");
  const contents = objects.add("");
  const font = objects.add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const mask = softMask(objects);
  const photo = photos(objects, mask, jpg);
  const jpx = objects.add(
    `<< /Type /XObject /Subtype /Image /Width ${String(jp2Width)} /Height ${String(jp2Height)} /Filter /JPXDecode /Length ${String(jp2.length)} >>`,
    jp2,
  );
  const fax = faxStripes(64, 64);
  const ccitt = objects.add(
    `<< /Type /XObject /Subtype /Image /Width 64 /Height 64 /ColorSpace /DeviceGray /BitsPerComponent 1 /Filter /CCITTFaxDecode /DecodeParms << /K -1 /Columns 64 /Rows 64 >> /Length ${String(fax.length)} >>`,
    fax,
  );
  const postScript = Buffer.from("{ dup 0 mul exch dup 1 mul exch dup 1 mul exch 0 mul }");
  const ink = objects.add(
    `<< /FunctionType 4 /Domain [0 1] /Range [0 1 0 1 0 1 0 1] /Length ${String(postScript.length)} >>`,
    postScript,
  );
  const groupStream = Buffer.from("1 0 0 rg 0 0 100 100 re f");
  const group = objects.add(
    `<< /Type /XObject /Subtype /Form /BBox [0 0 100 100] /Group << /S /Transparency /CS /DeviceRGB >> /Length ${String(groupStream.length)} >>`,
    groupStream,
  );
  const lightStream = Buffer.from("0.5 g 0 0 100 100 re f");
  const light = objects.add(
    `<< /Type /XObject /Subtype /Form /BBox [0 0 100 100] /Group << /S /Transparency /CS /DeviceGray >> /Length ${String(lightStream.length)} >>`,
    lightStream,
  );
  const profile = icc
    ? objects.add(`<< /N 3 /Alternate /DeviceRGB /Length ${String(icc.length)} >>`, icc)
    : 0;

  const content = pageContent(height, { hasIcc: Boolean(icc), jpg });
  const xObjects = [
    `/Fax ${String(ccitt)} 0 R`,
    `/Jpx ${String(jpx)} 0 R`,
    `/Grupo ${String(group)} 0 R`,
    ...(photo
      ? [`/Foto ${String(photo.withMask)} 0 R`, `/FotoSin ${String(photo.plain)} 0 R`]
      : []),
  ];
  const colorSpaces = [
    `/Tinta [/Separation /Rojo /DeviceCMYK ${String(ink)} 0 R]`,
    ...(profile ? [`/Icc [/ICCBased ${String(profile)} 0 R]`] : []),
  ];
  objects.set(catalog, `<< /Type /Catalog /Pages ${String(pages)} 0 R >>`);
  objects.set(pages, `<< /Type /Pages /Kids [${String(page)} 0 R] /Count 1 >>`);
  objects.set(
    page,
    `<< /Type /Page /Parent ${String(pages)} 0 R /MediaBox [0 0 ${String(SAMPLE_WIDTH)} ${String(height)}] /Contents ${String(contents)} 0 R /Group << /S /Transparency /CS /DeviceRGB >> /Resources << /Font << /F1 ${String(font)} 0 R >> /XObject << ${xObjects.join(" ")} >> /ColorSpace << ${colorSpaces.join(" ")} >> /ExtGState << /Luz << /Type /ExtGState /SMask << /S /Luminosity /G ${String(light)} 0 R >> >> >> >> >>`,
  );
  objects.set(contents, `<< /Length ${String(content.length)} >>`, content);
  return serialize(objects.list, catalog);
}

export const STRIPE_POINTS = 120;

/** A page as tall as a long flyer, in red and blue stripes: each pixel says what it should be. */
export function buildStripedPdf(height: number): Buffer {
  const objects = new PdfObjects();
  const catalog = objects.add("");
  const pages = objects.add("");
  const page = objects.add("");
  const lines: string[] = [];
  for (let top = 0; top < height; top += STRIPE_POINTS) {
    const isRed = (top / STRIPE_POINTS) % 2 === 0;
    const y = height - top - STRIPE_POINTS;
    lines.push(
      `${isRed ? "1 0 0" : "0 0 1"} rg 0 ${String(y)} ${String(SAMPLE_WIDTH)} ${String(STRIPE_POINTS)} re f`,
    );
  }
  const content = Buffer.from(lines.join("\n"));
  const contents = objects.add(`<< /Length ${String(content.length)} >>`, content);
  objects.set(catalog, `<< /Type /Catalog /Pages ${String(pages)} 0 R >>`);
  objects.set(pages, `<< /Type /Pages /Kids [${String(page)} 0 R] /Count 1 >>`);
  objects.set(
    page,
    `<< /Type /Page /Parent ${String(pages)} 0 R /MediaBox [0 0 ${String(SAMPLE_WIDTH)} ${String(height)}] /Contents ${String(contents)} 0 R >>`,
  );
  return serialize(objects.list, catalog);
}
