// The matrix of faculties lives in `_facultades.json` (for the profiles) and in the column
// `profiles.facultades` (the column "Vos" of each administrator). The switch of Gestiones, in
// `app_flags`.
import { savedRolesIn } from "@/shared/session/index.ts";
import type { Backend } from "@/shared/supabase/index.ts";

export const FACULTIES_QUERY_KEY = ["admin", "faculties"] as const;

/** Null when nothing was ever saved; a failure to read it is not that. */
export async function readSavedFaculties(bucket: Backend["bucket"]): Promise<unknown> {
  const file = await bucket.readJson("_facultades.json");
  if (file.ok) return savedRolesIn(file.value);
  if (file.error.kind === "not-found") return null;
  throw new Error(file.error.kind === "invalid" ? "el archivo no se puede leer" : "sin conexión");
}

export async function saveFaculties(
  bucket: Backend["bucket"],
  roles: unknown,
  now: Date,
): Promise<string> {
  const content = JSON.stringify({ roles, updated_at: now.toISOString() });
  const saved = await bucket.upload(
    "_facultades.json",
    new Blob([content], { type: "application/json" }),
    { contentType: "application/json", upsert: true },
  );
  return saved.ok ? "" : saved.error.message;
}

/** Only one's own row: what an administrator takes out of their own app. */
export async function saveOwnFaculties(
  db: Backend["db"],
  id: string,
  own: Readonly<Record<string, boolean>>,
): Promise<string> {
  const { error } = await db.from("profiles").update({ facultades: own }).eq("id", id);
  return error ? error.message : "";
}

export async function saveCommercialSwitch(
  db: Backend["db"],
  value: string,
  now: Date,
): Promise<string> {
  const { error } = await db
    .from("app_flags")
    .upsert(
      { clave: "gestiones", valor: value, updated_at: now.toISOString() },
      { onConflict: "clave" },
    );
  return error ? error.message : "";
}
