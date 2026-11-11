import { useQuery } from "@tanstack/react-query";
import {
  cashbackConfigsInFile,
  cashbackNames,
  type CashbackConfig,
  DEFAULT_CASHBACK_CONFIGS,
} from "@/shared/domain/company-registry/cashback.ts";
import { type Backend, useBackend } from "@/shared/supabase/index.ts";

/** After saving them, invalidate this one and everybody reads them again. */
export const CASHBACK_QUERY_KEY = ["app-config", "cashback"] as const;

async function readCashback(bucket: Backend["bucket"]): Promise<readonly CashbackConfig[]> {
  const file = await bucket.readJson("_cashback.json");
  if (file.ok) return cashbackConfigsInFile(file.value);
  if (file.error.kind === "not-found") return DEFAULT_CASHBACK_CONFIGS;
  throw new Error(`_cashback.json: ${file.error.kind}`);
}

export interface CashbackValue {
  /** Without the file, or until it arrives, the ones of always, as the old app does. */
  readonly configs: readonly CashbackConfig[];
  readonly names: readonly string[];
  readonly settled: boolean;
}

const DEFAULT_NAMES = cashbackNames(DEFAULT_CASHBACK_CONFIGS);

export function useCashbackConfigs(): CashbackValue {
  const { bucket } = useBackend();
  const { data, isError, isSuccess } = useQuery({
    queryKey: CASHBACK_QUERY_KEY,
    queryFn: () => readCashback(bucket),
    staleTime: Number.POSITIVE_INFINITY,
  });
  return {
    configs: data ?? DEFAULT_CASHBACK_CONFIGS,
    names: data ? cashbackNames(data) : DEFAULT_NAMES,
    settled: isSuccess || isError,
  };
}
