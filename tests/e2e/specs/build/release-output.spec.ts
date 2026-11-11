// Since the cut-over the root is what GitHub Pages publishes: it has to be what the build left in
// dist/, byte by byte, so every check of build-output holds for it too.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { expect, test } from "@playwright/test";

const DIST = "dist";
const ROOT = ".";
const AGAIN = "Run `npm run release`: the root does not hold the last build.";

function filesOf(folder: string): string[] {
  return readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => `${entry.parentPath.slice(folder.length + 1)}/${entry.name}`.replace(/^\//, ""))
    .toSorted();
}

test("the root holds every file of the build, the same", () => {
  const built = filesOf(DIST);
  const different = built.filter(
    (file) =>
      !existsSync(`${ROOT}/${file}`) ||
      !readFileSync(`${ROOT}/${file}`).equals(readFileSync(`${DIST}/${file}`)),
  );

  expect(built.length).toBeGreaterThan(0);
  expect(different, AGAIN).toEqual([]);
});

test("no asset of an older build stays published", () => {
  expect(filesOf(`${ROOT}/assets`), AGAIN).toEqual(filesOf(`${DIST}/assets`));
});

test("the root page is the React app", () => {
  const page = readFileSync(`${ROOT}/index.html`, "utf8");

  expect(page).toContain('<div id="root"></div>');
});
