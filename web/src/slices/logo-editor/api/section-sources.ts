// The flyers sections are copied from: `_fuentes.json` in the bucket. Only the administrator writes it,
// from Estudio; here it is only read. A list that could not be read is not an empty one (invariant 24).
import type { Bucket } from "@/shared/supabase/index.ts";

export const SECTION_SOURCES_QUERY_KEY = ["logo-editor", "section-sources"] as const;
const FILE = "_fuentes.json";

export interface SectionSource {
  readonly id: string;
  readonly nombre: string;
  readonly img: string;
  readonly mini: string;
}

function textField(value: object, key: string): string {
  const field: unknown = Reflect.get(value, key);
  return typeof field === "string" ? field : "";
}

function asSource(value: unknown, isOurs: (address: string) => boolean): SectionSource[] {
  if (typeof value !== "object" || value === null) return [];
  const [id, img] = [textField(value, "id"), textField(value, "img")];
  if (!id || !isOurs(img)) return [];
  return [{ id, img, nombre: textField(value, "nombre"), mini: textField(value, "mini") }];
}

export class SourcesReadError extends Error {
  constructor(cause: unknown) {
    super("The list of flyers to copy from could not be read", { cause });
  }
}

export async function readSectionSources(
  bucket: Bucket,
  isOurs: (address: string) => boolean,
): Promise<readonly SectionSource[]> {
  const file = await bucket.readJson(FILE);
  if (!file.ok) {
    if (file.error.kind === "not-found") return [];
    throw new SourcesReadError(file.error);
  }
  const list: unknown =
    typeof file.value === "object" && file.value !== null ? Reflect.get(file.value, "lista") : null;
  return Array.isArray(list) ? list.flatMap((value: unknown) => asSource(value, isOurs)) : [];
}
