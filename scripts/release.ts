// The cut-over: what `vite build` left in dist/ goes to the root, which is what GitHub Pages
// publishes. It runs after the build (`npm run release`) and touches only what it owns: assets/,
// the files at the top of dist/ and the leftovers of the old build that must not stay published.
import { cpSync, existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { basename } from "node:path";
import { exit } from "node:process";

const DIST = "dist";
const ASSETS = "assets";
// What the page of dist/ needs to work, checked before anything in the root is touched.
const REQUIRED = ["index.html", "version.json", ASSETS];
// The old app on its own, with auth.js inside: it would keep a second version of the app
// published, writing to the same data. The old build still writes it, into legacy-site/.
export const RETIRED = ["index_export.html"];

/** Names that the Jekyll step of GitHub Pages leaves out of the site. */
function hiddenFromPages(name: string): boolean {
  return /^[_.#~]/.test(basename(name));
}

export function problemsOf(dist: string): string[] {
  if (!existsSync(dist)) return [`${dist}/ does not exist: run vite build first`];
  const missing = REQUIRED.filter((name) => !existsSync(`${dist}/${name}`));
  const hidden = readdirSync(dist, { recursive: true, encoding: "utf8" }).filter(hiddenFromPages);
  return [
    ...missing.map((name) => `${dist}/${name} is missing`),
    ...hidden.map((name) => `${dist}/${name} would not be published by GitHub Pages`),
  ];
}

export function release(dist: string, root: string): string[] {
  const problems = problemsOf(dist);
  if (problems.length > 0) throw new Error(problems.join("\n"));
  // Old hashed files go: assets/ belongs to the release, whole.
  rmSync(`${root}/${ASSETS}`, { recursive: true, force: true });
  const written = readdirSync(dist)
    .toSorted()
    .map((name) => {
      cpSync(`${dist}/${name}`, `${root}/${name}`, { recursive: true });
      return statSync(`${dist}/${name}`).isDirectory() ? `${name}/` : name;
    });
  for (const name of RETIRED) rmSync(`${root}/${name}`, { force: true });
  return written;
}

if (import.meta.main) {
  try {
    const written = release(DIST, ".");
    console.log(`Root updated from ${DIST}/: ${written.join(", ")}`);
    console.log(`Removed from the root: ${RETIRED.join(", ")}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    console.error("Nothing was copied to the root.");
    exit(1);
  }
}
