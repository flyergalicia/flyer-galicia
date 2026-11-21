import { useQuery } from "@tanstack/react-query";
import {
  type FlyerOption,
  flyerOptionsInFile,
  sanitizeFlyerOptions,
} from "@/shared/domain/flyer-options.ts";
import { type Backend, useBackend } from "@/shared/supabase/index.ts";

/** After saving the list, invalidate this one and everybody reads it again. */
export const FLYER_OPTIONS_QUERY_KEY = ["app-config", "flyer-options"] as const;

async function readFlyerOptions(bucket: Backend["bucket"]): Promise<readonly FlyerOption[]> {
  const file = await bucket.readJson("_opciones.json");
  if (file.ok) return flyerOptionsInFile(file.value);
  if (file.error.kind === "not-found") return sanitizeFlyerOptions(null);
  throw new Error(`_opciones.json: ${file.error.kind}`);
}

const DEFAULT_LIST = sanitizeFlyerOptions(null);

export interface FlyerOptionsValue {
  /** Without the file, the three of always: a failure is told apart by `failed`. */
  readonly options: readonly FlyerOption[];
  readonly settled: boolean;
  readonly failed: boolean;
}

export function useFlyerOptions(enabled = true): FlyerOptionsValue {
  const { bucket } = useBackend();
  const { data, isError, isSuccess } = useQuery({
    queryKey: FLYER_OPTIONS_QUERY_KEY,
    queryFn: () => readFlyerOptions(bucket),
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
    // Whoever enters goes in with the list of always. Asking again every time something that reads
    // it appears would take the door of the app back to waiting, in a loop.
    retryOnMount: false,
  });
  return { options: data ?? DEFAULT_LIST, settled: isSuccess || isError, failed: isError };
}
