// Test support: the panel open on a sheet of Config, over a bucket that keeps what is written, so
// what was saved is what is read next. Every brand, company and person here is made up.
import { expect } from "vitest";
import { page } from "vitest/browser";
import { jsonResponse, type RecordedRequest } from "@/shared/supabase/testing/recording-fetch.ts";
import { FIRST_PLACE, goToSheet, rememberPlace, type SheetId } from "../model/panel.ts";
import { openPanel, type PanelOptions } from "./panel-cloud.ts";

const PUBLIC = "/storage/v1/object/public/flyers/";
const WRITE = "/storage/v1/object/flyers/";

export const CONFIG_OPTIONS = {
  opts: [
    { n: 1, nombre: "Opción 1" },
    { n: 9, nombre: "Combustible" },
    { n: 8, nombre: "Combustible 2025", solapa: "rubros", rubro: "combustible" },
    { n: 11, nombre: "Combustible 2026", solapa: "rubros", reemplaza: 8 },
    { n: 12, nombre: "Sin cashback", sinCB: 9 },
  ],
};

export interface BucketStore {
  /** What each file says now. */
  readonly files: Record<string, unknown>;
  /** Every file written, in order, with what it said. */
  readonly written: { readonly file: string; readonly content: unknown }[];
  /** Files that do not answer: the connection dropped. */
  readonly dropped: Set<string>;
  /** Files that cannot be written, with the message of the server. */
  readonly refused: Map<string, string>;
}

export interface ConfigOptions extends PanelOptions {
  readonly catalog?: readonly Record<string, unknown>[];
  readonly modo?: readonly Record<string, unknown>[];
  readonly catalogFails?: boolean;
}

async function contentOf(request: RecordedRequest): Promise<unknown> {
  const body = request.init?.body;
  if (body === undefined || body === null) return null;
  const content =
    body instanceof FormData ? [...body.values()].find((value) => typeof value !== "string") : body;
  return content === undefined ? null : JSON.parse(await new Response(content).text());
}

function readFile(store: BucketStore, file: string): Response {
  if (store.dropped.has(file)) throw new TypeError("Failed to fetch");
  return file in store.files ? jsonResponse(store.files[file]) : jsonResponse({}, 404);
}

async function writeFile(store: BucketStore, request: RecordedRequest, file: string) {
  const refusal = store.refused.get(file);
  if (refusal !== undefined) {
    return jsonResponse({ statusCode: "400", error: "x", message: refusal }, 400);
  }
  const content = await contentOf(request);
  store.files[file] = content;
  store.written.push({ file, content });
  return jsonResponse({ Key: `flyers/${file}` });
}

function catalogAnswer(options: ConfigOptions) {
  return (request: RecordedRequest): Response | null => {
    if (request.path === "/rest/v1/promos_galicia_cache") {
      return options.catalogFails
        ? jsonResponse({ message: "sin catálogo" }, 500)
        : jsonResponse(options.catalog ?? []);
    }
    if (request.path === "/rest/v1/promos_modo_cache") return jsonResponse(options.modo ?? []);
    if (request.path === "/rest/v1/promos_galicia_meta") {
      return jsonResponse({ last_sync_at: "2026-10-30T12:00:00Z", total: 0, ubicaciones: [] });
    }
    return null;
  };
}

export function bucketStore(files: Record<string, unknown> = {}): BucketStore {
  return {
    files: { "_opciones.json": CONFIG_OPTIONS, ...files },
    written: [],
    dropped: new Set(),
    refused: new Map(),
  };
}

/** The panel open on that sheet of Config, as the administrator left it. */
export async function openConfigSheet(
  sheet: SheetId,
  testId: string,
  store: BucketStore = bucketStore(),
  options: ConfigOptions = {},
) {
  rememberPlace(goToSheet(FIRST_PLACE, sheet));
  const catalog = catalogAnswer(options);
  const opened = await openPanel({
    ...options,
    intercept: async (request) => {
      const own = await options.intercept?.(request);
      if (own) return own;
      if (request.path.startsWith(PUBLIC))
        return readFile(store, request.path.slice(PUBLIC.length));
      if (request.path.startsWith(WRITE) && request.method !== "DELETE") {
        return writeFile(store, request, request.path.slice(WRITE.length));
      }
      return catalog(request);
    },
  });
  await expect.element(page.getByTestId(testId)).toBeVisible();
  return { ...opened, store };
}
