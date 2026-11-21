// Test support, not exported from index.ts: a real Backend whose fetch is a recording one. Each one
// has its own invented project, and with it its own place in localStorage.
import { createBackend, type Backend } from "../create-backend.ts";
import { type Answer, createRecordingFetch, type RecordingFetch } from "./recording-fetch.ts";

export const INVENTED_ANON_KEY = "invented-public-key";

export interface InventedBackend {
  readonly backend: Backend;
  readonly network: RecordingFetch;
  readonly url: string;
  /** Where supabase-js keeps the session of this project. */
  readonly storageKey: string;
}

let projects = 0;

export function createInventedBackend(answer: Answer): InventedBackend {
  projects += 1;
  const reference = `invented${String(Date.now())}${String(projects)}`;
  const url = `https://${reference}.supabase.co`;
  const network = createRecordingFetch(answer);
  return {
    backend: createBackend({ url, anonKey: INVENTED_ANON_KEY, fetch: network.fetch }),
    network,
    url,
    storageKey: `sb-${reference}-auth-token`,
  };
}
