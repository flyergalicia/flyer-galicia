// Not a screen: what lets tests/e2e/specs/design-system/network-contract.spec.ts ask for every entry
// of the network contract through the public API of shared. By hand it is inert, and it never holds
// an address of its own: Playwright gives it the one its simulated cloud intercepts.
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { type Backend, createBackend } from "./index.ts";

interface TestCloud {
  readonly url: string;
  readonly anonKey: string;
}

interface ContractEntry {
  readonly kind: string;
  readonly method?: string;
  readonly table?: string;
  readonly select?: readonly string[];
  readonly filters?: readonly string[];
  readonly name?: string;
  readonly params?: readonly string[];
  readonly action?: string | null;
  readonly payload?: readonly string[];
  readonly operation?: string;
  readonly file?: string;
  readonly path?: string;
}

interface Outcome {
  readonly entry: ContractEntry;
  readonly outcome: "answered" | "no answer" | "cannot be replayed";
}

/** How long an entry can take before the replay goes on without its answer. */
const ANSWER_BUDGET_MS = 3000;
const INVENTED_NUMBER = "7";
const INVENTED_VALUE = "00000000-0000-4000-8000-000000000077";

/** The builder of supabase-js, without its types: the entry says which table and columns. */
interface LooseBuilder extends PromiseLike<unknown> {
  select(columns?: string, options?: Readonly<Record<string, unknown>>): LooseBuilder;
  update(values: Readonly<Record<string, unknown>>): LooseBuilder;
  insert(values: Readonly<Record<string, unknown>>): LooseBuilder;
  delete(): LooseBuilder;
  eq(column: string, value: string): LooseBuilder;
}

function concrete(name: string): string {
  return name.replaceAll("<n>", INVENTED_NUMBER);
}

function keysWithValues(keys: readonly string[]): Readonly<Record<string, string>> {
  return Object.fromEntries(keys.map((key) => [key, INVENTED_VALUE]));
}

function writeOf(builder: LooseBuilder, method: string): LooseBuilder {
  const values = { replay: true };
  if (method === "PATCH") return builder.update(values);
  if (method === "POST") return builder.insert(values);
  return builder.delete();
}

function tableRequest(
  backend: Backend,
  { method = "GET", table = "", select = [], filters = [] }: ContractEntry,
): LooseBuilder {
  const from = Reflect.get(backend.db, "from");
  const builder: LooseBuilder = Reflect.apply(from, backend.db, [table]);
  const columns = select.join(",");
  let request: LooseBuilder;
  if (method === "GET") request = builder.select(columns);
  else if (method === "HEAD") request = builder.select(columns, { count: "exact", head: true });
  else {
    const written = writeOf(builder, method);
    request = columns ? written.select(columns) : written;
  }
  for (const column of filters) request = request.eq(column, INVENTED_VALUE);
  return request;
}

function imageArrives(url: string): Promise<void> {
  return new Promise((resolve) => {
    const image = new Image();
    image.addEventListener("load", () => {
      resolve();
    });
    image.addEventListener("error", () => {
      resolve();
    });
    image.src = url;
  });
}

function bucketRequest(
  backend: Backend,
  { operation, file = "" }: ContractEntry,
): Promise<unknown> {
  const name = concrete(file);
  const { bucket } = backend;
  if (operation === "read") {
    return name.endsWith(".json")
      ? Reflect.apply(bucket.readJson, undefined, [name])
      : imageArrives(Reflect.apply(bucket.publicUrl, undefined, [name]));
  }
  const body = new Blob(["{}"], { type: "application/json" });
  const options = { contentType: "application/json", upsert: true };
  return Reflect.apply(bucket.upload, undefined, [name, body, options]);
}

function authRequest({ auth }: Backend, { method, path = "" }: ContractEntry): Promise<unknown> {
  if (path.endsWith("/token")) {
    return auth.signInWithPassword({ email: "ana@bancogalicia.com.ar", password: "inventada" });
  }
  if (path.endsWith("/logout")) return auth.signOut();
  if (path.endsWith("/verify")) {
    return auth.verifyOneTimeToken({ tokenHash: "hash-inventado", type: "magiclink" });
  }
  return method === "PUT"
    ? auth.updatePassword("ClaveInventada1")
    : Promise.reject(new Error(path));
}

/** Null: this entry has no request in the public API. */
function requestOf(backend: Backend, entry: ContractEntry): PromiseLike<unknown> | null {
  const { kind, name, params = [], action, payload = [], path = "" } = entry;
  if (kind === "table") return tableRequest(backend, entry);
  if (kind === "rpc") {
    return Reflect.apply(backend.rpc, undefined, [name, keysWithValues(params)]);
  }
  if (kind === "function") {
    return Reflect.apply(backend.callEdge, undefined, [name, action, keysWithValues(payload)]);
  }
  if (kind === "bucket") return bucketRequest(backend, entry);
  if (kind === "auth") return authRequest(backend, entry);
  return path.includes("/object/list/") ? backend.bucket.list() : null;
}

/** Sessions last: signing out in the middle would change what the others send. */
function authOrder({ kind, path = "" }: ContractEntry): number {
  if (kind !== "auth") return 0;
  if (path.endsWith("/token")) return 1;
  if (path.endsWith("/user")) return 2;
  return path.endsWith("/verify") ? 3 : 4;
}

function withinBudget(request: PromiseLike<unknown>): Promise<Outcome["outcome"]> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve("no answer");
    }, ANSWER_BUDGET_MS);
    const answered = () => {
      resolve("answered");
    };
    request.then(answered, answered);
  });
}

async function replayFrom(
  backend: Backend,
  entries: readonly ContractEntry[],
  outcomes: Outcome[],
): Promise<Outcome[]> {
  const [entry, ...rest] = entries;
  if (!entry) return outcomes;
  const request = requestOf(backend, entry);
  const outcome = request ? await withinBudget(request) : "cannot be replayed";
  outcomes.push({ entry, outcome });
  return replayFrom(backend, rest, outcomes);
}

function CloudHarness() {
  const [cloud] = useState<TestCloud | undefined>(() =>
    Reflect.get(window, "__FLYER_TEST_CLOUD__"),
  );
  useEffect(() => {
    if (!cloud) return;
    const backend = createBackend(cloud);
    const replay = (entries: readonly ContractEntry[]): Promise<Outcome[]> =>
      replayFrom(
        backend,
        entries.toSorted((a, b) => authOrder(a) - authOrder(b)),
        [],
      );
    Reflect.set(window, "__FLYER_REPLAY_CONTRACT__", replay);
  }, [cloud]);
  return <p>{cloud ? "Nube de prueba lista" : "Sin nube de prueba: esta historia no hace nada"}</p>;
}

const meta = {
  title: "Shared/Supabase/CloudHarness",
  component: CloudHarness,
} satisfies Meta<typeof CloudHarness>;

export default meta;

export const Replay: StoryObj<typeof meta> = {};
