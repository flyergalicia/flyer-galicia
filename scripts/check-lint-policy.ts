import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { argv, exit } from "node:process";

const SOURCE_ROOTS = ["web/src", "scripts", "tests", ".storybook"];
const SOURCE_FILE = /\.tsx?$/;
const COMPLEXITY_DISABLE = /(?:oxlint|eslint)-disable[^\n]*\bcomplexity\b/;
const THIS_FILE = "scripts/check-lint-policy.ts";
const POLICY_FILES = new Set([THIS_FILE, "scripts/check-lint-policy.test.ts"]);
const SPEC_ROOT = "tests/e2e/specs";

/**
 * Specs say what the user does and sees: the driver is the only one that knows how the
 * app is built, so that the same spec can run against any version of it.
 */
const SPEC_BANS: readonly { name: string; pattern: RegExp }[] = [
  { name: "page.evaluate", pattern: /\bpage\.evaluate\b/ },
  { name: "evaluate", pattern: /\.(?:evaluate|evaluateAll|evaluateHandle|\$eval|\$\$eval)\(/ },
  { name: "waitForFunction", pattern: /\bwaitForFunction\b/ },
  { name: "legacy global", pattern: /\b_(?:fg|pad|est|mg|promo|ges|ben|hun|cmd|prov)[A-Z]/ },
  { name: "#id selector", pattern: /["'`][^"'`\n]*#[A-Za-z_][\w-]*[^"'`\n]*["'`]/ },
];

export function hasComplexityDisable(source: string): boolean {
  return COMPLEXITY_DISABLE.test(source);
}

export function specViolations(source: string): string[] {
  return SPEC_BANS.filter(({ pattern }) => pattern.test(source)).map(({ name }) => name);
}

function listSourceFiles(root: string): string[] {
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((path) => SOURCE_FILE.test(path))
    .map((path) => join(root, path))
    .filter((path) => !POLICY_FILES.has(path));
}

function complexityOffenders(): string[] {
  return SOURCE_ROOTS.flatMap(listSourceFiles).filter((path) =>
    hasComplexityDisable(readFileSync(path, "utf8")),
  );
}

function specOffenders(): string[] {
  return listSourceFiles(SPEC_ROOT).flatMap((path) => {
    const found = specViolations(readFileSync(path, "utf8"));
    return found.length > 0 ? [`${path}: ${found.join(", ")}`] : [];
  });
}

function main(): void {
  const complexity = complexityOffenders();
  if (complexity.length > 0) {
    console.error(`The complexity rule cannot be disabled:\n${complexity.join("\n")}`);
  }
  const specs = specOffenders();
  if (specs.length > 0) {
    console.error(`Specs talk to the app through the driver:\n${specs.join("\n")}`);
  }
  if (complexity.length > 0 || specs.length > 0) exit(1);
}

if (argv[1]?.endsWith(THIS_FILE)) {
  main();
}
