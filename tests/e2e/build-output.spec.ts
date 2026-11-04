import { readdirSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { expect, test } from "@playwright/test";

const DIST = "dist";

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
