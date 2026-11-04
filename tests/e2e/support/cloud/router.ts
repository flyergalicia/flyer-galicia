import { type BrowserContext, type Route } from "@playwright/test";
import { handleCommercialActions } from "./commercial-actions/handlers.ts";
import { describeRequest, type ContractEntry } from "./contract.ts";
import { benchmarkCards, benchmarkManual, benchmarkTables } from "./handlers/benchmark.ts";
import { authAdmin, benchmarkSync, promosGalicia } from "./handlers/edge-functions.ts";
import { listFlyerLogs, listProfiles, readOwnProfile, updateProfile } from "./handlers/profiles.ts";
import { listModoPromotions, listPromotions, readPromotionsMeta } from "./handlers/promotions.ts";
import {
  deleteFiles,
  failSimulatedUpload,
  receiveUpload,
  servePublicFile,
} from "./handlers/storage.ts";
import { designFunctions, designMessagesTable, designsTable } from "./handlers/studio.ts";
import {
  CORS_HEADERS,
  type CloudHandler,
  type CloudReply,
  type CloudRequest,
  jsonReply,
} from "./http.ts";
import { type CloudState } from "./state.ts";
import { SUPABASE_URL, type CloudUser } from "./users.ts";

interface CloudRoute {
  matches: (request: CloudRequest) => boolean;
  handle: CloudHandler;
}

function exact(path: string, handle: CloudHandler, ...methods: string[]): CloudRoute {
  return {
    matches: (request) =>
      request.path === path && (methods.length === 0 || methods.includes(request.method)),
    handle,
  };
}

function under(prefix: string, handle: CloudHandler, ...methods: string[]): CloudRoute {
  return {
    matches: (request) =>
      request.path.startsWith(prefix) && (methods.length === 0 || methods.includes(request.method)),
    handle,
  };
}

const REST = "/rest/v1";
const FUNCTIONS = "/functions/v1";
const UPLOADS = "/storage/v1/object/flyers";

/** In order: the first handler that answers wins, and one can pass by returning undefined. */
const ROUTES: readonly CloudRoute[] = [
  under("/storage/v1/object/public/flyers/", servePublicFile),
  under(`${UPLOADS}/`, failSimulatedUpload),
  under(`${UPLOADS}/`, receiveUpload, "POST", "PUT"),
  exact(UPLOADS, deleteFiles, "DELETE"),
  under("/storage/v1/", () => jsonReply([])),
  exact(`${REST}/profiles`, listProfiles, "GET"),
  exact(`${REST}/flyer_logs`, listFlyerLogs, "GET"),
  exact(`${REST}/profiles`, updateProfile, "PATCH"),
  exact(`${REST}/profiles`, readOwnProfile, "GET"),
  exact(`${REST}/promos_galicia_meta`, readPromotionsMeta),
  exact(`${FUNCTIONS}/auth-admin`, authAdmin),
  exact(`${FUNCTIONS}/promos-galicia`, promosGalicia),
  exact(`${REST}/promos_galicia_cache`, listPromotions),
  exact(`${REST}/promos_modo_cache`, listModoPromotions),
  exact(`${REST}/promos_bench_cache`, benchmarkTables),
  exact(`${REST}/promos_bench_marcas`, benchmarkTables),
  exact(`${REST}/promos_bench_meta`, benchmarkTables),
  exact(`${REST}/promos_bench_hist`, benchmarkTables),
  exact(`${REST}/promos_bench_tarjetas`, benchmarkCards),
  exact(`${REST}/promos_bench_manual`, benchmarkManual),
  exact(`${FUNCTIONS}/benchmark-sync`, benchmarkSync),
  exact(`${REST}/flyer_diseno_mensajes`, designMessagesTable),
  under(`${REST}/rpc/flyer_diseno_`, designFunctions),
  exact(`${REST}/flyer_disenos`, designsTable),
];

function defaultReply({ method }: CloudRequest): CloudReply {
  return method === "PATCH" || method === "POST"
    ? jsonReply([], 201)
    : jsonReply([], 200, { "Content-Range": "0-0/0" });
}

async function answer(request: CloudRequest): Promise<CloudReply> {
  const { state, file, path } = request;
  const isDropped = [...state.faults].some((fault) => fault.bucketFile === file);
  if (isDropped && path.startsWith("/storage/v1/object/public/flyers/")) {
    return { abort: "connectionreset" };
  }
  if (request.commercialActions) {
    const reply = await handleCommercialActions(request);
    if (reply) return reply;
  }
  for (const route of ROUTES) {
    if (!route.matches(request)) continue;
    const reply = await route.handle(request);
    if (reply) return reply;
  }
  return defaultReply(request);
}

function parsedBody(postData: string | null): unknown {
  try {
    return postData === null ? null : (JSON.parse(postData) as unknown);
  } catch {
    return null;
  }
}

export interface AttachOptions {
  state: CloudState;
  user: CloudUser;
  commercialActions: boolean;
  onContract: (entry: ContractEntry) => void;
}

async function serve(route: Route, options: AttachOptions): Promise<void> {
  const playwrightRequest = route.request();
  const url = new URL(playwrightRequest.url());
  const method = playwrightRequest.method();
  if (method === "OPTIONS") {
    await route.fulfill({ status: 200, headers: { ...CORS_HEADERS } });
    return;
  }
  const headers = playwrightRequest.headers();
  describeRequest({
    method,
    path: url.pathname,
    query: url.searchParams,
    body: parsedBody(playwrightRequest.postData()),
  }).forEach(options.onContract);
  const reply = await answer({
    method,
    path: url.pathname,
    file: url.pathname.split("/").pop() ?? "",
    query: url.searchParams,
    headers,
    wantsObject: /vnd\.pgrst\.object/.test(headers.accept ?? ""),
    playwrightRequest,
    user: options.user,
    state: options.state,
    commercialActions: options.commercialActions,
  });
  await ("abort" in reply ? route.abort(reply.abort) : route.fulfill(reply));
}

const ANY_SUPABASE_HOST = /^https:\/\/[^/]+\.supabase\.(?:co|in)\//;

/**
 * Serves the simulated backend on a browser context. Routes of a page win over these, so
 * a test can still put its own in front and fall back here.
 */
export async function attachCloud(context: BrowserContext, options: AttachOptions): Promise<void> {
  await context.route(ANY_SUPABASE_HOST, (route) => route.abort("blockedbyclient"));
  await context.route(`${SUPABASE_URL}/**`, (route) => serve(route, options));
}
