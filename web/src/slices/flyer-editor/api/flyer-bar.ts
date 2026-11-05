// What the flyer bar writes: the favorite goes in the account of the person, and the names and the
// order of the flyers, in the list everybody reads.
import { type FlyerOption, sanitizeFlyerOptions } from "@/shared/domain/flyer-options.ts";
import { type Backend, failure, type Result, success } from "@/shared/supabase/index.ts";

const OPTIONS_FILE = "_opciones.json";

/** It says whether it was saved. */
export async function saveFavorites(
  db: Backend["db"],
  personId: string,
  favorites: readonly number[],
): Promise<boolean> {
  const { error } = await db
    .from("profiles")
    .update({ flyer_fav: [...favorites] })
    .eq("id", personId);
  return !error;
}

export interface ListEntry {
  readonly n: number;
  readonly nombre: string;
  readonly color: string;
  readonly solapa: FlyerOption["solapa"];
  readonly orden: number;
}

/** With its own order and without what it does not say. */
export async function saveFlyerList(
  bucket: Backend["bucket"],
  entries: readonly ListEntry[],
): Promise<Result<readonly FlyerOption[], string>> {
  const opts = sanitizeFlyerOptions(entries);
  const written = await bucket.upload(
    OPTIONS_FILE,
    new Blob([JSON.stringify({ opts, updated_at: new Date().toISOString() })], {
      type: "application/json",
    }),
    { contentType: "application/json", upsert: true },
  );
  return written.ok ? success(opts) : failure(written.error.message);
}
