// What a flyer leaves behind when its file came out, whichever way it came out.
import { useCallback } from "react";
import type { FlyerValues } from "@/shared/flyer-engine/index.ts";
import { useFlyerWorkspace } from "@/shared/lib/flyer-workspace/index.ts";
import { type FlyerUseFormat, logFlyerUse } from "@/shared/lib/flyer-workspace/usage-log.ts";
import { useSession } from "@/shared/session/index.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { useFlyerForm } from "./form-context.ts";
import { useFlyerHistory } from "./history-context.ts";

const SECOND_CAP_MARKER = "{importe2}";

export interface FlyerOut {
  readonly values: FlyerValues;
  readonly fileName: string;
  readonly canvas: HTMLCanvasElement;
  readonly format: FlyerUseFormat;
}

/** It goes only after the file: a download that failed is not in the history nor in the log. */
export function useFlyerRecord(afterDownload?: () => void) {
  const { db } = useBackend();
  const session = useSession();
  const form = useFlyerForm();
  const history = useFlyerHistory();
  const workspace = useFlyerWorkspace();
  const userId = session.status === "signed-in" ? session.user.id : null;
  return useCallback(
    ({ values, fileName, canvas, format }: FlyerOut) => {
      const { slot } = workspace.getState();
      history.add({
        values,
        fileName,
        canvas,
        cashback: form.getState().cashback,
        option: slot.option ?? 1,
      });
      if (userId) {
        const lines = slot.scene?.calibration.benef.lineas ?? [];
        void logFlyerUse(db, userId, {
          values,
          fileName,
          format,
          option: slot.option,
          usesSecondCap: lines.some(({ t }) => t.includes(SECOND_CAP_MARKER)),
        });
      }
      afterDownload?.();
    },
    [afterDownload, db, form, history, userId, workspace],
  );
}
