// What cannot be left to memory in the styles of web/src, such as the minimum letter size.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE = "web/src";
const TOKENS_FILE = "web/src/shared/ui/tokens/tokens.css";
const SORT_MARK = "0.85em";

function moduleFiles(): string[] {
  return readdirSync(SOURCE, { recursive: true, encoding: "utf8" })
    .filter((path) => path.endsWith(".css"))
    .map((path) => join(SOURCE, path))
    .filter((path) => path !== TOKENS_FILE);
}

function declarations(file: string, property: RegExp): string[] {
  const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  return [...css.matchAll(property)].map((match) => match[1]?.trim() ?? "");
}

describe("styles", () => {
  it("find the styles to check", () => {
    expect(moduleFiles().length).toBeGreaterThan(10);
  });

  it("take every letter size from the tokens", () => {
    const allowed = /^(?:var\(--text-[a-z]+\)|inherit|16px)$/;
    const offenders = moduleFiles().flatMap((file) =>
      declarations(file, /font-size:\s*([^;]+);/g)
        .filter((value) => !allowed.test(value) && value !== SORT_MARK)
        .map((value) => `${file}: ${value}`),
    );
    expect(offenders).toEqual([]);
  });

  it("take every color from the tokens", () => {
    const offenders = moduleFiles().flatMap((file) => {
      const css = readFileSync(file, "utf8").replace(/url\("[^"]*"\)/g, "");
      const hex = [...css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(([value]) => value);
      return hex
        .filter((value) => value.toLowerCase() !== "#fff")
        .map((value) => `${file}: ${value}`);
    });
    expect(offenders).toEqual([]);
  });

  it("the 16px of a field on a phone is only there, for the phone not to zoom in", () => {
    const uses = moduleFiles().filter((file) => readFileSync(file, "utf8").includes("16px;"));
    const withFontSize = uses.filter((file) =>
      /font-size:\s*16px/.test(readFileSync(file, "utf8")),
    );
    expect(withFontSize).toEqual(["web/src/shared/ui/field/Field.module.css"]);
  });
});
