// What the app asks of the backend, without any value: the rewrite must ask the same.
import { NON_FILTER_PARAMS, splitTopLevel } from "./postgrest.ts";

export type ContractEntry =
  | { kind: "table"; method: string; table: string; select: string[]; filters: string[] }
  | { kind: "rpc"; name: string; params: string[] }
  | { kind: "function"; name: string; action: string | null; payload: string[] }
  | { kind: "bucket"; operation: "read" | "write" | "delete"; file: string }
  | { kind: "auth" | "storage"; method: string; path: string };

export interface ObservedRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  /** Parsed JSON body, or null when there is none. */
  body: unknown;
}

const REST_PREFIX = "/rest/v1/";
const RPC_PREFIX = "/rest/v1/rpc/";
const FUNCTION_PREFIX = "/functions/v1/";
const PUBLIC_FILES_PREFIX = "/storage/v1/object/public/flyers/";
const FILES_PREFIX = "/storage/v1/object/flyers/";
const FILES_ROOT = "/storage/v1/object/flyers";
const LOGICAL_FILTER = /^(?:not\.)?(?:and|or)$/;
const FILTER_TERM =
  /(?:^|[(,])([a-zA-Z_]\w*)\.(?:not\.)?(?:eq|neq|gt|gte|lt|lte|is|in|like|ilike|cs|cd|ov|fts)\b/g;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

function sorted(values: Iterable<string>): string[] {
  return [...new Set(values)].toSorted();
}

/** Option numbers, hours in file names and ids are values, not part of the contract. */
export function neutralName(name: string): string {
  return name.replace(UUID, "<id>").replace(/\d+/g, "<n>");
}

function objectKeys(body: unknown): string[] {
  return body && typeof body === "object" && !Array.isArray(body) ? Object.keys(body) : [];
}

function filterColumns(query: URLSearchParams): string[] {
  const columns: string[] = [];
  for (const [key, value] of query.entries()) {
    if (NON_FILTER_PARAMS.has(key)) continue;
    if (LOGICAL_FILTER.test(key)) {
      columns.push(...[...value.matchAll(FILTER_TERM)].map((match) => match[1] ?? ""));
    } else {
      columns.push(key);
    }
  }
  return sorted(columns);
}

function tableEntry({ method, path, query }: ObservedRequest): ContractEntry {
  return {
    kind: "table",
    method,
    table: path.slice(REST_PREFIX.length),
    select: sorted(splitTopLevel(query.get("select") ?? "").map((column) => column.trim())),
    filters: filterColumns(query),
  };
}

function functionEntry({ path, body }: ObservedRequest): ContractEntry {
  const keys = objectKeys(body);
  const action = keys.includes("action") ? (body as { action: unknown }).action : null;
  return {
    kind: "function",
    name: path.slice(FUNCTION_PREFIX.length),
    action: typeof action === "string" ? action : null,
    payload: sorted(keys.filter((key) => key !== "action")),
  };
}

function deletedFiles({ body }: ObservedRequest): ContractEntry[] {
  const { prefixes = [] } = (body ?? {}) as { prefixes?: string[] };
  return prefixes.map((file) => ({
    kind: "bucket",
    operation: "delete",
    file: neutralName(file),
  }));
}

/** Requests that have no body of a known shape, by path prefix. */
function plainEntry({ method, path }: ObservedRequest): ContractEntry {
  return { kind: path.startsWith("/auth/") ? "auth" : "storage", method, path: neutralName(path) };
}

export function describeRequest(request: ObservedRequest): ContractEntry[] {
  const { path, body, method } = request;
  if (path.startsWith(RPC_PREFIX)) {
    return [{ kind: "rpc", name: path.slice(RPC_PREFIX.length), params: sorted(objectKeys(body)) }];
  }
  if (path.startsWith(REST_PREFIX)) return [tableEntry(request)];
  if (path.startsWith(FUNCTION_PREFIX)) return [functionEntry(request)];
  if (path.startsWith(PUBLIC_FILES_PREFIX)) {
    const file = neutralName(path.slice(PUBLIC_FILES_PREFIX.length));
    return [{ kind: "bucket", operation: "read", file }];
  }
  if (path.startsWith(FILES_PREFIX)) {
    const file = neutralName(decodeURIComponent(path.slice(FILES_PREFIX.length)));
    return [{ kind: "bucket", operation: "write", file }];
  }
  if (path === FILES_ROOT && method === "DELETE") return deletedFiles(request);
  return [plainEntry(request)];
}
