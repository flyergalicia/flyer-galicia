// The two buttons on top: "Descargar Excel" and, for the administrator, "Actualizar ahora".
import { useCallback, useState } from "react";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { downloadBenchmarkSheet, type SheetInputs } from "../api/benchmark-sheet.ts";
import { refreshBenchmark } from "../api/refresh.ts";

/** While it builds, the button says so and cannot be pressed again. */
export function useSheetDownload(inputs: () => SheetInputs) {
  const { show } = useToast();
  const [isBusy, setIsBusy] = useState(false);
  const download = useCallback(async () => {
    setIsBusy(true);
    try {
      await downloadBenchmarkSheet(inputs());
      show("Excel descargado.");
    } catch {
      show("No se pudo armar el Excel. Revisá la conexión e intentá de nuevo.");
    } finally {
      setIsBusy(false);
    }
  }, [inputs, show]);
  return { isBusy, download };
}

/** Says each step on the button; at the end, what could not be updated, and reads everything again. */
export function useRefresh(readAgain: () => Promise<void>) {
  const { callEdge } = useBackend();
  const { show } = useToast();
  const [step, setStep] = useState<string | null>(null);
  // While it works its button is disabled: it cannot be pressed twice.
  const refresh = useCallback(async () => {
    const said = await refreshBenchmark(callEdge, { say: setStep });
    setStep(null);
    show(said);
    await readAgain();
  }, [callEdge, readAgain, show]);
  return { step, refresh };
}
