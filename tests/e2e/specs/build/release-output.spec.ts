// Since the cut-over the root is what GitHub Pages publishes: it has to be what the build left in
// dist/, byte by byte, so every check of build-output holds for it too.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { expect, test } from "@playwright/test";

const DIST = "dist";
const ROOT = ".";
const AGAIN = "Run `npm run release`: the root does not hold the last build.";
// The old app keeps these in the root until its code is removed: a page that the browser kept
// from before the cut-over still finds them, and then offers to reload the new version.
const OLD_APP_FILES = ["auth.js", "gestiones.js", "benchmark.js", "libs/xlsx-0.20.3.full.min.js"];

function filesOf(folder: string): string[] {
  return readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => `${entry.parentPath.slice(folder.length + 1)}/${entry.name}`.replace(/^\//, ""))
    .toSorted();
}

test("the root holds every file of the build, the same", { tag: "@react" }, () => {
  const built = filesOf(DIST);
  const different = built.filter(
    (file) =>
      !existsSync(`${ROOT}/${file}`) ||
      !readFileSync(`${ROOT}/${file}`).equals(readFileSync(`${DIST}/${file}`)),
  );

  expect(built.length).toBeGreaterThan(0);
  expect(different, AGAIN).toEqual([]);
});

test("no asset of an older build stays published", { tag: "@react" }, () => {
  expect(filesOf(`${ROOT}/assets`), AGAIN).toEqual(filesOf(`${DIST}/assets`));
});

test("the root page is the React app", { tag: "@react" }, () => {
  const page = readFileSync(`${ROOT}/index.html`, "utf8");

  expect(page).toContain('<div id="root"></div>');
  expect(page).not.toContain("auth.js");
});

test("the old app on its own is no longer published", { tag: "@react" }, () => {
  expect(existsSync(`${ROOT}/index_export.html`)).toBe(false);
});

test("a page of the old app kept by the browser still finds its files", { tag: "@react" }, () => {
  expect(OLD_APP_FILES.filter((file) => !existsSync(`${ROOT}/${file}`))).toEqual([]);
});
