// Marcas vigiladas live in one file of the bucket. Changes go in line, each one reading the file
// again: taking a brand out while a design is published does not step on the other.
import { type WatchedBrandsFile, watchedBrandsIn } from "@/shared/domain/promotions/index.ts";
import type { Backend } from "@/shared/supabase/index.ts";

const FILE = "_vigilar.json";

type WatchedChange = (file: WatchedBrandsFile) => WatchedBrandsFile | null;

let line: Promise<unknown> = Promise.resolve();

/** A file that cannot be read is not an empty one: writing over it would lose the lists. */
async function readWatchedBrands(bucket: Backend["bucket"]): Promise<WatchedBrandsFile> {
  const file = await bucket.readJson(FILE);
  if (file.ok) return watchedBrandsIn(file.value);
  if (file.error.kind === "unreachable") throw new Error("No se pudo leer la lista");
  return watchedBrandsIn(null);
}

async function applyChange(
  bucket: Backend["bucket"],
  change: WatchedChange,
): Promise<WatchedBrandsFile> {
  const current = await readWatchedBrands(bucket);
  const changed = change(current);
  if (!changed) return current;
  const saved = { ...changed, updated_at: new Date().toISOString() };
  const written = await bucket.upload(
    FILE,
    new Blob([JSON.stringify(saved)], { type: "application/json" }),
    {
      contentType: "application/json",
      upsert: true,
    },
  );
  if (!written.ok) throw new Error(written.error.message);
  return saved;
}

/** `change` returns the new file, or null when there is nothing to save. */
export function changeWatchedBrands(
  bucket: Backend["bucket"],
  change: WatchedChange,
): Promise<WatchedBrandsFile> {
  const done = line.then(() => applyChange(bucket, change));
  line = done.catch(() => undefined);
  return done;
}
