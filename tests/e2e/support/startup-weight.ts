// What a browser has to bring and read to start the app: every JavaScript and CSS file, also from
// a CDN, and what the page itself carries inline.
import { gzipSync } from "node:zlib";
import { type Page, type Response } from "@playwright/test";

export interface StartupFile {
  file: string;
  kind: "javascript" | "css";
  raw: number;
  gzip: number;
}

export interface Weight {
  raw: number;
  gzip: number;
}

export interface StartupWeight {
  javascript: Weight;
  css: Weight;
  files: StartupFile[];
}

const INLINE_BLOCKS: readonly { kind: StartupFile["kind"]; pattern: RegExp }[] = [
  { kind: "css", pattern: /<style\b[^>]*>([^]*?)<\/style>/g },
  { kind: "javascript", pattern: /<script\b(?![^>]*\bsrc=)[^>]*>([^]*?)<\/script>/g },
];

function sized(file: string, kind: StartupFile["kind"], content: Buffer): StartupFile {
  return { file, kind, raw: content.length, gzip: gzipSync(content).length };
}

/** The blocks written inside the page, one entry per kind. */
export function inlineFiles(html: string, name: string): StartupFile[] {
  return INLINE_BLOCKS.flatMap(({ kind, pattern }) => {
    const content = [...html.matchAll(pattern)].map(([, block]) => block ?? "").join("\n");
    return content === "" ? [] : [sized(`${name} (inline)`, kind, Buffer.from(content))];
  });
}

function nameOf(url: string, origin: string): string {
  const { pathname, host } = new URL(url);
  return url.startsWith(origin) ? pathname.slice(1) : `${host}${pathname}`;
}

async function filesOfResponse(response: Response, origin: string): Promise<StartupFile[]> {
  const type = response.request().resourceType();
  const name = nameOf(response.url(), origin);
  if (!response.ok()) return [];
  if (type === "document") return inlineFiles(await response.text(), name);
  if (type === "script") return [sized(name, "javascript", await response.body())];
  return type === "stylesheet" ? [sized(name, "css", await response.body())] : [];
}

function total(files: readonly StartupFile[], kind: StartupFile["kind"]): Weight {
  const ofKind = files.filter((file) => file.kind === kind);
  return {
    raw: ofKind.reduce((sum, { raw }) => sum + raw, 0),
    gzip: ofKind.reduce((sum, { gzip }) => sum + gzip, 0),
  };
}

/** Starts watching a page before it navigates; the result covers what arrived up to that call. */
export function watchStartupWeight(page: Page, origin: string): () => Promise<StartupWeight> {
  const pending: Promise<StartupFile[]>[] = [];
  page.on("response", (response) => {
    pending.push(filesOfResponse(response, origin).catch(() => []));
  });
  return async () => {
    const files = (await Promise.all(pending)).flat();
    files.sort((first, second) => second.gzip - first.gzip);
    return { javascript: total(files, "javascript"), css: total(files, "css"), files };
  };
}
