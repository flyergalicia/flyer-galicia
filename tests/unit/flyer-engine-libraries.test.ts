// jsPDF and JSZip weigh too much for the first load: the engine only brings them when they are used.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ENGINE_DIR = fileURLToPath(new URL("../../web/src/shared/flyer-engine/", import.meta.url));
const STATIC_IMPORT = /^\s*import\s[^;]*\bfrom\s+["'](?:jspdf|jszip)["']/m;

function engineSources(): string[] {
  return readdirSync(ENGINE_DIR)
    .filter((file) => /\.tsx?$/.test(file) && !/\.(?:test|stories)\.tsx?$/.test(file))
    .map((file) => readFileSync(`${ENGINE_DIR}${file}`, "utf8"));
}

describe("the libraries of the engine", () => {
  it("are never imported statically", () => {
    const sources = engineSources();

    expect(sources.length).toBeGreaterThan(10);
    expect(sources.filter((source) => STATIC_IMPORT.test(source))).toEqual([]);
  });

  it("are imported on demand", () => {
    const all = engineSources().join("\n");

    expect(all).toContain('import("jspdf")');
    expect(all).toContain('import("jszip")');
  });

  it("the check sees a static import", () => {
    expect(STATIC_IMPORT.test('import { jsPDF } from "jspdf";')).toBe(true);
    expect(STATIC_IMPORT.test('const a = await import("jspdf");')).toBe(false);
  });
});
