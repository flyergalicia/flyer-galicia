import { type Request } from "@playwright/test";
import { type CloudState, type Row } from "./state.ts";
import { type CloudUser } from "./users.ts";

export const CORS_HEADERS: Readonly<Record<string, string>> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "*",
  "Access-Control-Expose-Headers": "Content-Range",
  "Content-Type": "application/json",
};

export interface CloudRequest {
  readonly method: string;
  readonly path: string;
  /** Last path segment. */
  readonly file: string;
  readonly query: URLSearchParams;
  readonly headers: Readonly<Record<string, string>>;
  /** The client asked for one row (`.single()`), not for a list. */
  readonly wantsObject: boolean;
  readonly playwrightRequest: Request;
  /** Who is signed in on the browser context that sent the request. */
  readonly user: CloudUser;
  readonly state: CloudState;
  readonly commercialActions: boolean;
}

export type CloudReply =
  | { status: number; body?: string | Buffer; headers?: Record<string, string> }
  | { abort: "connectionreset" };

/** Undefined means "not mine": the router tries the next handler. */
export type CloudHandler = (
  request: CloudRequest,
) => CloudReply | undefined | Promise<CloudReply | undefined>;

export function jsonReply(
  data: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): CloudReply {
  return {
    status,
    body: JSON.stringify(data),
    headers: { ...CORS_HEADERS, ...extraHeaders },
  };
}

export function emptyReply(status: number): CloudReply {
  return { status, body: "", headers: { ...CORS_HEADERS } };
}

export function bytesReply(body: Buffer, contentType: string): CloudReply {
  return { status: 200, body, headers: { ...CORS_HEADERS, "Content-Type": contentType } };
}

/** PostgreSQL error as PostgREST sends it. */
export function databaseError(message: string, code: string, status = 400): CloudReply {
  return jsonReply({ message, code }, status);
}

export function noRowsReply(): CloudReply {
  return jsonReply(
    {
      message: "JSON object requested, multiple (or no) rows returned",
      code: "PGRST116",
      details: "The result contains 0 rows",
      hint: null,
    },
    406,
  );
}

export function jsonBody<T = Row>(request: CloudRequest): T {
  try {
    return JSON.parse(request.playwrightRequest.postData() ?? "{}") as T;
  } catch {
    return {} as T;
  }
}

/** Requested window of rows: PostgREST takes it from Range or from offset and limit. */
export function requestedWindow(
  request: CloudRequest,
  defaultLimit = 1000,
): { start: number; limit: number } {
  const range = /(\d+)-(\d+)/.exec(request.headers.range ?? "");
  if (range) {
    const start = Number(range[1]);
    return { start, limit: Number(range[2]) - start + 1 };
  }
  return {
    start: Number(request.query.get("offset") ?? 0),
    limit: Number(request.query.get("limit") ?? 0) || defaultLimit,
  };
}

export function contentRange(start: number, shown: number, total: number): string {
  return `${shown > 0 ? `${String(start)}-${String(start + shown - 1)}` : "*"}/${String(total)}`;
}

export function pagedRows<T>(request: CloudRequest, rows: readonly T[]): CloudReply {
  const { start, limit } = requestedWindow(request);
  const page = rows.slice(start, start + limit);
  return jsonReply(page, 200, { "Content-Range": contentRange(start, page.length, rows.length) });
}

export function nowIso(): string {
  return new Date().toISOString();
}
