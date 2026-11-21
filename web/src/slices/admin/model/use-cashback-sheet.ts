// Config → Cashback: what was read, the copy being edited, and saving it for everybody.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CASHBACK_QUERY_KEY } from "@/shared/lib/app-config/cashback-query.ts";
import type { CashbackConfig } from "@/shared/domain/company-registry/cashback.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { CASHBACK_SHEET_KEY, readCashbackFile, saveCashbackFile } from "../api/config-files.ts";
import {
  type AmountKey,
  previewedAmount,
  renamedConfig,
  savedCashbackText,
  withAmount,
  withNewConfig,
  withoutConfig,
} from "./cashback-sheet.ts";

export interface CashbackSheet {
  /** Null while it is read, or if it could not be. */
  readonly configs: readonly CashbackConfig[] | null;
  readonly failure: string;
  readonly saving: boolean;
  readonly rename: (index: number, typed: string) => void;
  readonly setAmount: (index: number, key: AmountKey, value: string) => void;
  readonly add: () => void;
  readonly remove: (index: number) => void;
  readonly save: () => Promise<void>;
  readonly reload: () => void;
}

export function useCashbackSheet(): CashbackSheet {
  const { bucket } = useBackend();
  const queryClient = useQueryClient();
  const { show } = useToast();
  const read = useQuery({
    queryKey: CASHBACK_SHEET_KEY,
    queryFn: () => readCashbackFile(bucket),
    staleTime: 0,
  });
  const [edits, setEdits] = useState<readonly CashbackConfig[] | null>(null);
  const [saving, setSaving] = useState(false);
  const configs = read.isError ? null : (edits ?? read.data ?? null);
  const change = (next: (current: readonly CashbackConfig[]) => readonly CashbackConfig[]) => {
    if (configs) setEdits(next(configs));
  };

  const setAmount = (index: number, key: AmountKey, value: string) => {
    change((current) => withAmount(current, index, key, value));
    queryClient.setQueryData<readonly CashbackConfig[]>(CASHBACK_QUERY_KEY, (shown) =>
      previewedAmount(shown, index, key, value),
    );
  };

  const save = async () => {
    if (!configs || saving) return;
    setSaving(true);
    const saved = await saveCashbackFile(bucket, configs, new Date());
    setSaving(false);
    if (!saved.ok) {
      show(`Error al guardar el cashback: ${saved.error}`);
      return;
    }
    queryClient.setQueryData(CASHBACK_SHEET_KEY, configs);
    queryClient.setQueryData(CASHBACK_QUERY_KEY, configs);
    void queryClient.invalidateQueries({ queryKey: CASHBACK_QUERY_KEY });
    setEdits(null);
    show(savedCashbackText(configs.length));
  };

  return {
    configs,
    failure: read.isError ? read.error.message : "",
    saving,
    rename: (index, typed) => {
      change((current) => renamedConfig(current, index, typed));
    },
    setAmount,
    add: () => {
      change(withNewConfig);
    },
    remove: (index) => {
      change((current) => withoutConfig(current, index));
    },
    save,
    reload: () => {
      setEdits(null);
      void read.refetch();
      // What was shown on the flyer while typing goes back to what is saved.
      void queryClient.invalidateQueries({ queryKey: CASHBACK_QUERY_KEY });
    },
  };
}
