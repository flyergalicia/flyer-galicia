// Mis asesores travels with the account (`asesores_guardados`). The browser keeps a copy that opens
// the list at once and stands in if the network fails: the source of truth is the table.
import { asText } from "@/shared/domain/company-registry/index.ts";
import type { Backend, RpcFailure } from "@/shared/supabase/index.ts";

export const ADVISORS_QUERY_KEY = ["company-registry", "saved-advisors"] as const;

const CACHE_KEY = "fg_asesores_";
/** That what this browser had was already uploaded: an old copy would bring back what was deleted. */
const SYNCED_KEY = "fg_asesores_sync_";
const COLUMNS = "id,name,nombre,celular,email,orden";
const ID_RADIX = 36;

export interface SavedAdvisor {
  readonly id: string;
  /** How it reads on the list. */
  readonly name: string;
  /** What goes on the flyer. */
  readonly nombre: string;
  readonly celular: string;
  readonly email: string;
}

export interface AdvisorList {
  readonly rows: readonly SavedAdvisor[];
  /** False: the cloud did not answer and this is the copy of the browser. It reads again next time. */
  readonly fromCloud: boolean;
}

export function newAdvisorId(): string {
  return `a${String(Date.now())}${Math.random().toString(ID_RADIX).slice(2, 7)}`;
}

function text(row: object, key: string): string {
  return asText(Reflect.get(row, key)).trim();
}

/** Always the same shape, whatever arrives: a row without an id or with numbers breaks nothing. */
export function sanitizeAdvisors(rows: unknown): SavedAdvisor[] {
  const list: readonly unknown[] = Array.isArray(rows) ? rows : [];
  const seen = new Set<string>();
  const clean: SavedAdvisor[] = [];
  for (const row of list) {
    if (typeof row !== "object" || row === null) continue;
    const id = text(row, "id") || newAdvisorId();
    if (seen.has(id)) continue;
    seen.add(id);
    clean.push({
      id,
      name: text(row, "name") || text(row, "nombre"),
      nombre: text(row, "nombre"),
      celular: text(row, "celular"),
      email: text(row, "email"),
    });
  }
  return clean;
}

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The browser does not let it: it is only a copy.
  }
}

export function cachedAdvisors(userId: string): SavedAdvisor[] {
  try {
    return sanitizeAdvisors(JSON.parse(readStored(`${CACHE_KEY}${userId}`) ?? "[]"));
  } catch {
    return [];
  }
}

export function keepAdvisorsCopy(userId: string, rows: readonly SavedAdvisor[]): void {
  writeStored(`${CACHE_KEY}${userId}`, JSON.stringify(rows));
}

/** Goes up whole: the server deletes and inserts in one single call. */
export async function replaceAdvisors(
  { rpc }: Pick<Backend, "rpc">,
  rows: readonly SavedAdvisor[],
): Promise<RpcFailure | null> {
  const answer = await rpc("asesores_replace", {
    p_rows: rows.map(({ id, name, nombre, celular, email }) => ({
      id,
      name,
      nombre,
      celular,
      email,
    })),
  });
  return answer.ok ? null : answer.error;
}

/** The first time in this browser, what it had joins the cloud without stepping on anything. */
function mergeOnce(
  cloud: SavedAdvisor[],
  userId: string,
): { rows: SavedAdvisor[]; upload: boolean } {
  const local = cachedAdvisors(userId);
  if (readStored(`${SYNCED_KEY}${userId}`) || local.length === 0) {
    return { rows: cloud, upload: false };
  }
  const known = new Set(cloud.map(({ id }) => id));
  const missing = local.filter(({ id }) => !known.has(id));
  return { rows: [...missing, ...cloud], upload: missing.length > 0 };
}

export async function readAdvisors(
  backend: Pick<Backend, "db" | "rpc">,
  userId: string,
): Promise<AdvisorList> {
  try {
    const { data, error } = await backend.db
      .from("asesores_guardados")
      .select(COLUMNS)
      .eq("user_id", userId)
      .order("orden", { ascending: true });
    if (error) return { rows: cachedAdvisors(userId), fromCloud: false };
    const { rows, upload } = mergeOnce(sanitizeAdvisors(data), userId);
    keepAdvisorsCopy(userId, rows);
    writeStored(`${SYNCED_KEY}${userId}`, "1");
    if (upload) await replaceAdvisors(backend, rows);
    return { rows, fromCloud: true };
  } catch {
    return { rows: cachedAdvisors(userId), fromCloud: false };
  }
}
