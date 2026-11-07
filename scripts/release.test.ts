import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { problemsOf, release } from "./release.ts";

function folderWith(files: Record<string, string>): string {
  const folder = mkdtempSync(join(tmpdir(), "flyer-release-"));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(folder, path, ".."), { recursive: true });
    writeFileSync(join(folder, path), content);
  }
  return folder;
}

const BUILT = {
  "index.html": "<div id=root>",
  "version.json": '{"v":"new"}',
  "favicon.jpg": "icon",
  "assets/fg-index-NEW.js": "app",
};

describe("problemsOf", () => {
  it("accepts a build with its page, its version and its assets", () => {
    expect(problemsOf(folderWith(BUILT))).toEqual([]);
  });

  it("says what is missing", () => {
    expect(problemsOf(folderWith({ "index.html": "" }))).toEqual([
      expect.stringContaining("version.json is missing"),
      expect.stringContaining("assets is missing"),
    ]);
  });

  it("refuses a file that GitHub Pages would leave out", () => {
    expect(problemsOf(folderWith({ ...BUILT, "assets/_hidden.js": "" }))).toEqual([
      expect.stringContaining("_hidden.js would not be published"),
    ]);
  });

  it("refuses a build that does not exist", () => {
    expect(problemsOf(join(tmpdir(), "flyer-release-nothing"))).toEqual([
      expect.stringContaining("does not exist"),
    ]);
  });
});

describe("release", () => {
  it("puts the build in the root and drops the assets of the one before", () => {
    const dist = folderWith(BUILT);
    const root = folderWith({
      "index.html": "old",
      "version.json": '{"v":"old"}',
      "assets/fg-index-OLD.js": "old app",
      "auth.js": "kept",
    });

    expect(release(dist, root)).toEqual(["assets/", "favicon.jpg", "index.html", "version.json"]);
    expect(readFileSync(join(root, "index.html"), "utf8")).toBe("<div id=root>");
    expect(readFileSync(join(root, "version.json"), "utf8")).toBe('{"v":"new"}');
    expect(existsSync(join(root, "assets/fg-index-NEW.js"))).toBe(true);
    expect(existsSync(join(root, "assets/fg-index-OLD.js"))).toBe(false);
    expect(readFileSync(join(root, "auth.js"), "utf8")).toBe("kept");
  });

  it("no longer publishes the old app on its own", () => {
    const root = folderWith({ "index_export.html": "old app with everything inside" });

    release(folderWith(BUILT), root);

    expect(existsSync(join(root, "index_export.html"))).toBe(false);
  });

  it("touches nothing in the root when the build is not whole", () => {
    const root = folderWith({ "index.html": "old", "assets/fg-index-OLD.js": "old app" });

    expect(() => release(folderWith({ "index.html": "new" }), root)).toThrow(/is missing/);
    expect(readFileSync(join(root, "index.html"), "utf8")).toBe("old");
    expect(existsSync(join(root, "assets/fg-index-OLD.js"))).toBe(true);
  });
});
