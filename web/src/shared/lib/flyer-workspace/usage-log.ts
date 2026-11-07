// What is left in `flyer_logs` every time a flyer comes out (Admin → Uso and Registros read it). Its
// real columns are few: what has no column travels as JSON in `flyer_type`.
import { officersOf } from "@/shared/flyer-engine/officers.ts";
import type { FlyerScene, FlyerValues } from "@/shared/flyer-engine/types.ts";
import type { Backend } from "@/shared/supabase/index.ts";

export type FlyerUseFormat = "pdf" | "png" | "compartir";

const PLAIN_FIELDS = [
  "config",
  ...[1, 2, 3, 4, 5, 6, 7, 8].flatMap((number) => {
    const suffix = number === 1 ? "" : String(number);
    return [`nombre${suffix}`, `celular${suffix}`, `email${suffix}`];
  }),
];
const BRANCH_PLACES = [1, 2, 3, 4, 5, 6, 7, 8].map((number) => `ubic${String(number)}`);
const SECOND_CAP_MARKER = "{importe2}";

/** The sign of the benefit of this flyer prints a second cap. */
export function usesSecondCapOn(scene: Pick<FlyerScene, "calibration"> | null): boolean {
  const lines = scene?.calibration.benef.lineas ?? [];
  return lines.some(({ t }) => t.includes(SECOND_CAP_MARKER));
}

export interface FlyerUse {
  readonly values: FlyerValues;
  /** The name of the file, without its extension. */
  readonly fileName: string;
  readonly format: FlyerUseFormat;
  /** Which flyer it used. */
  readonly option: number | null;
  /** The sign of the benefit prints a second cap. */
  readonly usesSecondCap: boolean;
}

function textOf(values: FlyerValues, key: string): unknown {
  return Reflect.get(values, key);
}

function copyPresent(from: FlyerValues, keys: readonly string[], to: Record<string, unknown>) {
  for (const key of keys) {
    const value = textOf(from, key);
    if (value) to[key] = value;
  }
}

/** The order of the keys is the one of the old app: what reads them only looks for them. */
export function flyerUseDetail({ values, option, usesSecondCap }: FlyerUse): string {
  const detail: Record<string, unknown> = { opcion: option };
  copyPresent(values, PLAIN_FIELDS, detail);
  if (values.sedes) {
    detail.sedes = 1;
    copyPresent(values, ["sedesTit", ...BRANCH_PLACES], detail);
  }
  detail.asesores = officersOf(values).length;
  if (values.benef) {
    detail.beneficio = values.benefNombre ?? "";
    detail.importe = values.importe ?? "";
    if (usesSecondCap) detail.importe2 = values.importe2 || values.importe || "";
  }
  return JSON.stringify(detail);
}

export interface BatchFlyerUse {
  /** What came out, not what was asked for. */
  readonly count: number;
  /** From Mis empresas, or from the sheet of Masivo. */
  readonly fromCompanies: boolean;
  readonly option: number | null;
}

/** One entry per batch. */
export async function logBatchFlyerUse(
  db: Backend["db"],
  userId: string,
  { count, fromCompanies, option }: BatchFlyerUse,
): Promise<void> {
  const source = fromCompanies ? "Mis empresas" : "Masivo";
  const { error } = await db.from("flyer_logs").insert({
    user_id: userId,
    empresa: `${source} (${String(count)} flyers)`,
    config_name: "",
    format: "pdf",
    is_bulk: true,
    bulk_count: count,
    flyer_type: JSON.stringify({ opcion: option, masivo: true, padron: fromCompanies }),
    created_at: new Date().toISOString(),
  });
  if (error) console.warn("flyer_logs bulk:", error.message);
}

/** A log that could not be written does not stop anybody: the file is already out. */
export async function logFlyerUse(db: Backend["db"], userId: string, use: FlyerUse): Promise<void> {
  const { error } = await db.from("flyer_logs").insert({
    user_id: userId,
    empresa: use.values.empresa || "",
    config_name: use.fileName,
    format: use.format,
    is_bulk: false,
    bulk_count: 0,
    flyer_type: flyerUseDetail(use),
    created_at: new Date().toISOString(),
  });
  if (error) console.warn("flyer_logs:", error.message);
}
