// The files of pdf.js are checked against a hash on arriving: a new version with the old hashes would
// leave nobody able to upload a flyer, so it is said here and not in production.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SOURCE = "web/src/shared/lib/pdf-flyer/pdf-reader.ts";
const FILES = /file: "([^"]+)",\s*integrity:\s*"([^"]+)"/g;

describe("the hashes of pdf.js", () => {
  it("are those of the package installed", () => {
    const pairs = [...readFileSync(SOURCE, "utf8").matchAll(FILES)];
    expect(pairs).toHaveLength(3);
    const found = pairs.map(([, file = "", integrity]) => ({ file, integrity }));
    const wanted = found.map(({ file }) => ({
      file,
      integrity: `sha384-${createHash("sha384")
        .update(readFileSync(`node_modules/pdfjs-dist/${file}`))
        .digest("base64")}`,
    }));
    expect(found).toEqual(wanted);
  });
});
