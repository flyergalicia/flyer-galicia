import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { argv, exit } from "node:process";

const SOURCE_ROOTS = ["web/src", "scripts", "tests", ".storybook"];
const SOURCE_FILE = /\.tsx?$/;
const COMPLEXITY_DISABLE = /(?:oxlint|eslint)-disable[^\n]*\bcomplexity\b/;
const THIS_FILE = "scripts/check-lint-policy.ts";
const POLICY_FILES = new Set([THIS_FILE, "scripts/check-lint-policy.test.ts"]);
const SPEC_ROOT = "tests/e2e/specs";
const E2E_ROOT = "tests/e2e";

/**
 * Specs say what the user does and sees: the driver is the only one that knows how the
 * app is built, so that a spec survives a change of how a screen is made.
 */
const SPEC_BANS: readonly { name: string; pattern: RegExp }[] = [
  { name: "page.evaluate", pattern: /\bpage\.evaluate\b/ },
  { name: "evaluate", pattern: /\.(?:evaluate|evaluateAll|evaluateHandle|\$eval|\$\$eval)\(/ },
  { name: "waitForFunction", pattern: /\bwaitForFunction\b/ },
  { name: "#id selector", pattern: /["'`][^"'`\n]*#[A-Za-z_][\w-]*[^"'`\n]*["'`]/ },
];

/**
 * The simulated cloud only answers what the browser asks for, on the real address of the
 * backend. These leave straight for the network, past it: a test would reach production.
 */
const NETWORK_ESCAPES: readonly { name: string; pattern: RegExp }[] = [
  { name: "route.fetch", pattern: /\broute\.fetch\(/ },
  { name: "route.continue", pattern: /\broute\.continue\(/ },
  { name: "request context", pattern: /\.request\.(?:get|post|put|patch|delete|head|fetch)\(/ },
];

/** Not the backend: the logo recorder, only on demand, and the pdf.js files of the CDN. */
const NETWORK_ESCAPE_ALLOWED = new Set([
  "tests/e2e/support/logos.ts",
  "tests/e2e/specs/flyer-sections/pdf-to-image.spec.ts",
]);

export function hasComplexityDisable(source: string): boolean {
  return COMPLEXITY_DISABLE.test(source);
}

export function specViolations(source: string): string[] {
  return SPEC_BANS.filter(({ pattern }) => pattern.test(source)).map(({ name }) => name);
}

export function networkEscapes(source: string): string[] {
  return NETWORK_ESCAPES.filter(({ pattern }) => pattern.test(source)).map(({ name }) => name);
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

function networkOffenders(): string[] {
  return listSourceFiles(E2E_ROOT)
    .filter((path) => !NETWORK_ESCAPE_ALLOWED.has(path))
    .flatMap((path) => {
      const found = networkEscapes(readFileSync(path, "utf8"));
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
  const network = networkOffenders();
  if (network.length > 0) {
    console.error(`End-to-end tests never leave the simulated cloud:\n${network.join("\n")}`);
  }
  if (complexity.length > 0 || specs.length > 0 || network.length > 0) exit(1);
}

if (argv[1]?.endsWith(THIS_FILE)) {
  main();
}
