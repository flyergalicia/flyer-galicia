import { describe, expect, it } from "vitest";
import { computeVersion, markPageVersion } from "./version-manifest.ts";

describe("computeVersion", () => {
  it("does not depend on the order of the files", () => {
    expect(computeVersion(["a.js", "b.css"])).toBe(computeVersion(["b.css", "a.js"]));
  });

  it("changes when a file changes", () => {
    expect(computeVersion(["fg-index-aaa.js"])).not.toBe(computeVersion(["fg-index-bbb.js"]));
  });
});

describe("markPageVersion", () => {
  it("leaves the version in the page, after the charset", () => {
    const html = markPageVersion('<head><meta charset="UTF-8" /><title>x</title></head>', "abc");

    expect(html).toContain('<meta name="build-v" content="abc">');
    expect(html.indexOf("charset")).toBeLessThan(html.indexOf("build-v"));
  });

  it("refuses a page without a charset", () => {
    expect(() => markPageVersion("<head></head>", "abc")).toThrow(/charset/);
  });
});
