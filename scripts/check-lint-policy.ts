import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { argv, exit } from "node:process";

const SOURCE_ROOTS = ["web/src", "scripts", "tests", ".storybook"];
const SOURCE_FILE = /\.tsx?$/;
const COMPLEXITY_DISABLE = /(?:oxlint|eslint)-disable[^\n]*\bcomplexity\b/;
const THIS_FILE = "scripts/check-lint-policy.ts";
const POLICY_FILES = new Set([THIS_FILE, "scripts/check-lint-policy.test.ts"]);

export function hasComplexityDisable(source: string): boolean {
  return COMPLEXITY_DISABLE.test(source);
}

function listSourceFiles(root: string): string[] {
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((path) => SOURCE_FILE.test(path))
    .map((path) => join(root, path))
    .filter((path) => !POLICY_FILES.has(path));
}

function main(): void {
  const offenders = SOURCE_ROOTS.flatMap(listSourceFiles).filter((path) =>
    hasComplexityDisable(readFileSync(path, "utf8")),
  );
  if (offenders.length > 0) {
    console.error(`The complexity rule cannot be disabled:\n${offenders.join("\n")}`);
    exit(1);
  }
}

if (argv[1]?.endsWith(THIS_FILE)) {
  main();
}
