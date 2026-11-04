import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { type AuthGateway, createAuthGateway } from "./auth-gateway.ts";
import { type Bucket, createBucket } from "./bucket.ts";
import type { Database } from "./database.types.ts";
import { type CallEdge, createCallEdge } from "./edge-functions.ts";
import { fetchAllRows } from "./fetch-all-rows.ts";
import { type CallRpc, createRpc } from "./rpc.ts";

export interface BackendOptions {
  readonly url: string;
  readonly anonKey: string;
  /** Tests answer with this one. Otherwise, the one of the browser. */
  readonly fetch?: typeof fetch;
}

export interface Backend {
  readonly db: SupabaseClient<Database>;
  readonly auth: AuthGateway;
  readonly rpc: CallRpc;
  readonly callEdge: CallEdge;
  readonly bucket: Bucket;
  readonly fetchAllRows: typeof fetchAllRows;
}

const browserFetch: typeof fetch = (input, init) => globalThis.fetch(input, init);

/** Where supabase-js keeps the session by default. */
function authStorageKey(url: string): string {
  const reference = new URL(url).hostname.replace(/\..*$/, "");
  return `sb-${reference}-auth-token`;
}

/**
 * The only Supabase client of the app. No `storageKey` on purpose: the default one is
 * `sb-<ref>-auth-token`, and changing it would close everyone's session.
 */
export function createBackend({
  url,
  anonKey,
  fetch: send = browserFetch,
}: BackendOptions): Backend {
  const db = createClient<Database>(url, anonKey, { global: { fetch: send } });
  const auth = createAuthGateway(db, authStorageKey(url));
  return {
    db,
    auth,
    rpc: createRpc(db),
    callEdge: createCallEdge({ url, anonKey, fetch: send, auth }),
    bucket: createBucket({ url, fetch: send, client: db }),
    fetchAllRows,
  };
}
