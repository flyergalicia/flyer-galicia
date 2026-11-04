import { describe, expect, it } from "vitest";
import { computeVersion } from "./version-manifest.ts";

describe("computeVersion", () => {
  it("does not depend on the order of the files", () => {
    expect(computeVersion(["a.js", "b.css"])).toBe(computeVersion(["b.css", "a.js"]));
  });

  it("changes when a file changes", () => {
    expect(computeVersion(["fg-index-aaa.js"])).not.toBe(computeVersion(["fg-index-bbb.js"]));
  });
});
