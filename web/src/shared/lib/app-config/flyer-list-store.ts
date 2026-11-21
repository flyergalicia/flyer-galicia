// The names and the order of the flyers, in the list everybody reads: `_opciones.json`.
import { type FlyerOption, sanitizeFlyerOptions } from "@/shared/domain/flyer-options.ts";
import { type Backend, failure, type Result, success } from "@/shared/supabase/index.ts";

const OPTIONS_FILE = "_opciones.json";

export type ListEntry = Pick<FlyerOption, "n" | "nombre" | "color" | "solapa" | "orden"> &
  Partial<Pick<FlyerOption, "reemplaza" | "rubro" | "sinCB">>;

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
