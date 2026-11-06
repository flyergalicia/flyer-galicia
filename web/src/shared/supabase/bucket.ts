import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types.ts";
import { type FailureKind, failureKind, isTransientStatus } from "./network-status.ts";
import { failure, type Result, success } from "./result.ts";

const BUCKET = "flyers";

export type BucketJsonFile =
  | "_active.json"
  | `_active${number}.json`
  | "_cashback.json"
  | "_facultades.json"
  | "_flyer_cfgs.json"
  | "_fuentes.json"
  | "_legal.json"
  | `_legal${number}.json`
  | "_opciones.json"
  | "_titulos.json"
  | "_vigilar.json";

export type BucketImageFile =
  | `flyer_${number}_op${number}.jpg`
  | `flyer_t${number}.jpg`
  | `fuente_${number}.jpg`
  | `modo/${string}`;

/** auth.js uploads these too, in paths no test of the contract goes through. */
export type BucketUploadedAsset =
  | `index_${number}.html`
  | `_active_img.${"jpg" | "png"}`
  | `_active${number}_img.${"jpg" | "png"}`;

export type BucketFile = BucketJsonFile | BucketImageFile | BucketUploadedAsset;

export type BucketReadFailure =
  /** A fact: that file does not exist. A status of 404 or 400. */
  | { readonly kind: "not-found"; readonly status: number }
  /** It could not be fetched: it may well exist, so it is worth trying again. */
  | { readonly kind: "unreachable"; readonly status: number | null }
  /** It arrived, and it is not JSON. */
  | { readonly kind: "invalid"; readonly status: number };

export interface BucketWriteFailure {
  readonly kind: FailureKind;
  readonly status: number | null;
  readonly message: string;
}

export interface BucketUploadOptions {
  readonly contentType?: string;
  readonly upsert?: boolean;
  readonly cacheControl?: string;
}

export interface BucketListOptions {
  readonly limit?: number;
  readonly offset?: number;
  readonly sortBy?: { readonly column: string; readonly order: string };
  readonly search?: string;
}

export interface BucketEntry {
  readonly name: string;
  readonly created_at?: string | null;
  readonly updated_at?: string | null;
  readonly metadata?: { readonly size?: number | null } | null;
}

export interface Bucket {
  /** The value is whatever the file has: a tolerant reader of each caller gives it a shape. */
  readonly readJson: (file: BucketJsonFile) => Promise<Result<unknown, BucketReadFailure>>;
  readonly publicUrl: (file: BucketFile) => string;
  /** The address of a file a list brought: its name can be any. */
  readonly listedUrl: (name: string) => string;
  /** A file a list brought, as text: an HTML flyer of the build, for example. */
  readonly readText: (name: string) => Promise<Result<string, BucketReadFailure>>;
  readonly upload: (
    file: BucketFile,
    body: Blob | ArrayBuffer | string,
    options?: BucketUploadOptions,
  ) => Promise<Result<void, BucketWriteFailure>>;
  readonly list: (
    prefix?: string,
    options?: BucketListOptions,
  ) => Promise<Result<readonly BucketEntry[], BucketWriteFailure>>;
  /**
   * auth.js deletes uploads and the files of an abandoned publication. Any name goes, because
   * what it deletes comes from `list`.
   */
  readonly remove: (files: readonly string[]) => Promise<Result<void, BucketWriteFailure>>;
}

interface BucketDependencies {
  readonly url: string;
  readonly fetch: typeof fetch;
  readonly client: SupabaseClient<Database>;
}

function statusOf(error: { readonly status?: unknown }): number | null {
  return typeof error.status === "number" ? error.status : null;
}

function writeFailure(error: { readonly message: string; readonly status?: unknown }) {
  const status = statusOf(error);
  return failure<BucketWriteFailure>({
    kind: failureKind(status),
    status,
    message: error.message,
  });
}

function thrownFailure(cause: unknown) {
  return writeFailure({ message: cause instanceof Error ? cause.message : String(cause) });
}

function missing(status: number) {
  return failure<BucketReadFailure>(
    isTransientStatus(status) ? { kind: "unreachable", status } : { kind: "not-found", status },
  );
}

async function readAnswer(response: Response): Promise<Result<unknown, BucketReadFailure>> {
  const { status } = response;
  if (!response.ok) return missing(status);
  try {
    const data: unknown = await response.json();
    return success(data);
  } catch {
    return failure({ kind: "invalid", status });
  }
}

async function textAnswer(response: Response): Promise<Result<string, BucketReadFailure>> {
  return response.ok ? success(await response.text()) : missing(response.status);
}

export function createBucket({ url, fetch: send, client }: BucketDependencies): Bucket {
  const files = () => client.storage.from(BUCKET);
  const listedUrl = (name: string): string => `${url}/storage/v1/object/public/${BUCKET}/${name}`;
  const publicUrl = (file: BucketFile): string => listedUrl(file);

  return {
    publicUrl,
    listedUrl,
    readText: async (name) => {
      try {
        return await textAnswer(await send(listedUrl(name), { cache: "no-cache" }));
      } catch {
        return failure<BucketReadFailure>({ kind: "unreachable", status: null });
      }
    },
    // Always fresh: a change the administrator makes shows on the next read.
    readJson: async (file) => {
      try {
        const response = await send(`${publicUrl(file)}?t=${String(Date.now())}`, {
          cache: "no-cache",
        });
        return await readAnswer(response);
      } catch {
        return failure<BucketReadFailure>({ kind: "unreachable", status: null });
      }
    },
    upload: async (file, body, options) => {
      try {
        const { error } = await files().upload(file, body, options);
        return error ? writeFailure(error) : success(undefined);
      } catch (cause) {
        return thrownFailure(cause);
      }
    },
    list: async (prefix, options) => {
      try {
        const { data, error } = await files().list(prefix, options);
        return error ? writeFailure(error) : success(data);
      } catch (cause) {
        return thrownFailure(cause);
      }
    },
    remove: async (names) => {
      try {
        const { error } = await files().remove([...names]);
        return error ? writeFailure(error) : success(undefined);
      } catch (cause) {
        return thrownFailure(cause);
      }
    },
  };
}
