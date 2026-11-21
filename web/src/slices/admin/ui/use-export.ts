import { useState } from "react";
import { downloadSheet, type SheetApi, type SheetValues } from "@/shared/lib/sheet-library.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useSheetLibrary } from "@/shared/lib/use-sheet-library.ts";
import { messageOf } from "../api/read-error.ts";

export interface SheetOut {
  readonly lines: SheetValues;
  readonly widths: readonly number[];
  readonly sheetName: string;
  readonly fileName: string;
}

/**
 * An "Exportar Excel": everything that matches, by pages, into a sheet. "Exportando..." while it
 * works; nothing to export or a failure is said, never a sheet with less than there is.
 */
export function useExport(read: (api: SheetApi) => Promise<SheetOut | null>, failedPrefix: string) {
  const { show } = useToast();
  const withLibrary = useSheetLibrary();
  const [busy, setBusy] = useState(false);
  const start = () => {
    setBusy(true);
    void withLibrary(async (api) => {
      try {
        const sheet = await read(api);
        if (!sheet) {
          show("Sin datos para exportar");
          return;
        }
        downloadSheet(api, sheet);
        show("Excel descargado");
      } catch (error) {
        show(`${failedPrefix}${messageOf(error)}`);
      }
    }).finally(() => {
      setBusy(false);
    });
  };
  return { busy, start };
}

export const EXPORT_LABEL = "⬇ Exportar Excel";
export const EXPORTING = "Exportando...";
