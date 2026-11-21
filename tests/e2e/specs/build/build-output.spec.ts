import { readdirSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { expect, test } from "@playwright/test";

const DIST = "dist";
const MAX_PAGE_BYTES = 400_000;

function publishedFiles(): string[] {
  return readdirSync(DIST, { recursive: true, encoding: "utf8" });
}

function indexHtml(): string {
  return readFileSync(`${DIST}/index.html`, "utf8");
}

test("no published file is hidden from the Jekyll step of GitHub Pages", () => {
  const hidden = publishedFiles().filter((path) => /^[_.#~]/.test(basename(path)));

  expect(publishedFiles().length).toBeGreaterThan(0);
  expect(hidden).toEqual([]);
});

test("the page loads its assets with relative paths", () => {
  expect(indexHtml()).not.toMatch(/(?:src|href)="\/(?!\/)/);
});

test("the security policy comes before any script and forbids inline scripts", () => {
  const html = indexHtml();
  const policy = html.match(/Content-Security-Policy" content="([^"]+)"/)?.[1] ?? "";
  const scriptPolicy = policy.split("; ").find((directive) => directive.startsWith("script-src"));

  expect(html.indexOf("Content-Security-Policy")).toBeLessThan(html.indexOf("<script"));
  expect(scriptPolicy).toBeDefined();
  expect(scriptPolicy).not.toContain("'unsafe-inline'");
});

test("the page starts talking to the backend before it needs to", () => {
  const html = indexHtml();
  const preconnect = html.search(
    /<link rel="preconnect" href="https:[^"]+supabase\.co" crossorigin/,
  );

  expect(preconnect).toBeGreaterThan(-1);
  expect(preconnect).toBeLessThan(html.indexOf("<script"));
});

test("the look is known before the first paint", () => {
  const html = indexHtml();
  const look = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? "";
  const policy = html.match(/Content-Security-Policy" content="([^"]+)"/)?.[1] ?? "";

  expect(look).toContain("fg_theme");
  expect(look).toContain("fg_palette");
  expect(policy, "and the policy lets only that one run").toContain("'sha256-");
});

const EXPORT_LIBRARIES = /jspdf|exceljs|jszip|xlsx|pdfjs/i;

function assetFiles(): string[] {
  return publishedFiles().filter((path) => path.startsWith("assets/") && /\.\w+$/.test(path));
}

test("every asset has its content in the name, so a new version is a new address", () => {
  const assets = assetFiles();

  expect(assets.length).toBeGreaterThan(0);
  expect(assets.filter((path) => !/-[\w-]{8}\.\w+$/.test(path))).toEqual([]);
});

test("no script comes from outside unless it brings its hash", () => {
  const outside = [...indexHtml().matchAll(/<script[^>]*src="https?:[^>]*>/g)].map(([tag]) => tag);

  expect(outside.filter((tag) => !/integrity="sha384-/.test(tag))).toEqual([]);
});

test("the policy lets WASM compile but never eval", () => {
  const policy = indexHtml().match(/Content-Security-Policy" content="([^"]+)"/)?.[1] ?? "";

  expect(policy).toContain("'wasm-unsafe-eval'");
  expect(policy).not.toContain("'unsafe-eval'");
});

test("the libraries of exports are not in the first load", () => {
  const html = indexHtml();
  const preloaded = [...html.matchAll(/(?:src|href)="\.\/assets\/([^"]+)"/g)].map(
    ([, file]) => file,
  );

  expect(preloaded.filter((file) => EXPORT_LIBRARIES.test(file ?? ""))).toEqual([]);
  expect(html).not.toMatch(/<script[^>]*(?:jspdf|exceljs|jszip|xlsx)/i);
});

test("the page itself stays light: no images inside it", () => {
  const html = indexHtml();

  expect(html).not.toContain("data:image");
  expect(html.length).toBeLessThan(MAX_PAGE_BYTES);
  expect(html).toMatch(/<link rel="icon"[^>]*href="\.\/favicon\.jpg"/);
});

test("fonts never come by @import nor from the first version", () => {
  const styles = assetFiles()
    .filter((path) => path.endsWith(".css"))
    .map((path) => readFileSync(`${DIST}/${path}`, "utf8"))
    .join("\n");

  expect(styles).not.toMatch(/@import/);
  expect(`${styles}${indexHtml()}`).not.toMatch(/Syne|DM Sans/);
});

test("the versions of what is installed are exact", () => {
  const manifest: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  } = JSON.parse(readFileSync("package.json", "utf8"));
  const { dependencies = {}, devDependencies = {} } = manifest;
  const loose = Object.entries({ ...dependencies, ...devDependencies }).filter(
    ([, version]) => !/^\d+\.\d+\.\d+/.test(version),
  );

  expect(loose).toEqual([]);
});

test("the functions of the server pin the library they import", () => {
  const functions = readdirSync("supabase/functions", { withFileTypes: true }).filter((entry) =>
    entry.isDirectory(),
  );
  const imports = functions.flatMap(({ name }) => {
    const source = readFileSync(`supabase/functions/${name}/index.ts`, "utf8");
    return [...source.matchAll(/esm\.sh\/(@?[^"'\s]+)/g)].map(([, what]) => ({ name, what }));
  });

  expect(imports.length).toBeGreaterThan(0);
  expect(imports.filter(({ what }) => !/@\d+\.\d+\.\d+/.test(what ?? ""))).toEqual([]);
});
