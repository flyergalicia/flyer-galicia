// What the sheets of Config read and write in the bucket: the amounts of cashback, the legal text of
// each option and the list of options. A file that does not exist is the first time; one that could
// not be read is not, and nothing is written over it (invariant 24).
import {
  type CashbackConfig,
  cashbackConfigsInFile,
  DEFAULT_CASHBACK_CONFIGS,
} from "@/shared/domain/company-registry/cashback.ts";
import { type FlyerOption, flyerOptionsInFile } from "@/shared/domain/flyer-options.ts";
import { type WatchedBrandsFile, watchedBrandsIn } from "@/shared/domain/promotions/index.ts";
import { legalFile } from "@/shared/lib/flyer-workspace/option-files.ts";
import {
  type Bucket,
  type BucketJsonFile,
  type BucketReadFailure,
  failure,
  type Result,
  success,
} from "@/shared/supabase/index.ts";

export const CASHBACK_SHEET_KEY = ["admin", "cashback"] as const;
export const OPTIONS_SHEET_KEY = ["admin", "options"] as const;
export const LEGAL_SHEET_KEY = ["admin", "legal"] as const;
export const WATCHED_SHEET_KEY = ["admin", "watched"] as const;

const JSON_FILE = { contentType: "application/json", upsert: true } as const;

function jsonBlob(content: unknown): Blob {
  return new Blob([JSON.stringify(content)], { type: "application/json" });
}

function readProblem({ kind }: BucketReadFailure): Error {
  return new Error(kind === "invalid" ? "el archivo no se puede leer" : "sin conexión");
}

/** What the file says, or null when it does not exist. */
async function readFile(bucket: Bucket, file: BucketJsonFile): Promise<unknown> {
  const answer = await bucket.readJson(file);
  if (answer.ok) return answer.value;
  if (answer.error.kind === "not-found") return null;
  throw readProblem(answer.error);
}

async function write(bucket: Bucket, file: BucketJsonFile, content: object, now: Date) {
  const written = await bucket.upload(
    file,
    jsonBlob({ ...content, updated_at: now.toISOString() }),
    JSON_FILE,
  );
  return written.ok ? success(undefined) : failure(written.error.message);
}

/** Without the file, the ones of always, as whoever enters gets them. */
export async function readCashbackFile(bucket: Bucket): Promise<readonly CashbackConfig[]> {
  const file = await readFile(bucket, "_cashback.json");
  return file === null ? DEFAULT_CASHBACK_CONFIGS : cashbackConfigsInFile(file);
}

export function saveCashbackFile(
  bucket: Bucket,
  configs: readonly CashbackConfig[],
  now: Date,
): Promise<Result<void, string>> {
  const list = configs.map(({ nombre, m1, m2, m3, m4 }) => ({ nombre, m1, m2, m3, m4 }));
  return write(bucket, "_cashback.json", { configs: list }, now);
}

/** The legal text of an option: empty when it never had one, as the panel shows it. */
export async function readLegalFile(bucket: Bucket, option: number): Promise<string> {
  const file = await readFile(bucket, legalFile(option));
  const text: unknown =
    typeof file === "object" && file !== null ? Reflect.get(file, "text") : undefined;
  return typeof text === "string" ? text : "";
}

export function saveLegalFile(
  bucket: Bucket,
  option: number,
  text: string,
  now: Date,
): Promise<Result<void, string>> {
  return write(bucket, legalFile(option), { text }, now);
}

/** Without the file, the three of always. */
export async function readOptionsFile(bucket: Bucket): Promise<readonly FlyerOption[]> {
  return flyerOptionsInFile(await readFile(bucket, "_opciones.json"));
}

/** Marcas vigiladas: without the file, no list yet. */
export async function readWatchedFile(bucket: Bucket): Promise<WatchedBrandsFile> {
  return watchedBrandsIn(await readFile(bucket, "_vigilar.json"));
}
