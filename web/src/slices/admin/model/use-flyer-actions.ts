// What the rows of Config → Flyer do: activate a version in an option, deactivate the flyer of an
// option, delete a file. After each one the editor forgets that option (`_fgInvalidateOpt`) and the
// list is read again.
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { type FlyerOption, optionLabel } from "@/shared/domain/flyer-options.ts";
import { useFlyerChanges } from "@/shared/lib/flyer-changes/flyer-changes.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { activateHtml, activateImage, deactivateFlyer, removeUpload } from "../api/flyer-files.ts";
import type { ActiveFlyers, UploadedFlyer } from "./flyer-config.ts";
import { FLYER_LIST_QUERY_KEY } from "./use-flyer-list.ts";

export interface FlyerActions {
  /** The button that is waiting for its answer: `activate:<file>`, `deactivate:<n>`, `delete:<file>`. */
  readonly busy: string | null;
  readonly activate: (file: UploadedFlyer, option: number, fromButton: boolean) => Promise<void>;
  readonly deactivate: (option: number) => Promise<void>;
  readonly remove: (file: UploadedFlyer, active: ActiveFlyers) => Promise<void>;
  /** The flyer of an option changed: whoever has it forgets it, and the list is read again. */
  readonly changed: (option: number) => void;
}

export function useFlyerActions(options: readonly FlyerOption[]): FlyerActions {
  const { bucket } = useBackend();
  const queryClient = useQueryClient();
  const changes = useFlyerChanges();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const label = (option: number) => optionLabel(options, option);
  const reread = () => {
    void queryClient.invalidateQueries({ queryKey: FLYER_LIST_QUERY_KEY });
  };
  const changed = (option: number) => {
    changes.announce(option);
    reread();
  };

  return {
    busy,
    changed,
    activate: async (file, option, fromButton) => {
      if (fromButton) setBusy(`activate:${file.name}`);
      if (!file.isImage) toast.show("Extrayendo imagen del flyer...");
      const answer = await (file.isImage ? activateImage : activateHtml)(
        bucket,
        file,
        option,
        Date.now(),
      );
      setBusy(null);
      if (!answer.ok) {
        toast.show(`Error al activar: ${answer.error}`);
        return;
      }
      toast.show(`"${file.name}" activado en ${label(option)}`);
      changed(option);
    },
    deactivate: async (option) => {
      setBusy(`deactivate:${String(option)}`);
      const answer = await deactivateFlyer(bucket, option);
      setBusy(null);
      if (!answer.ok) {
        toast.show(`No se pudo desactivar: ${answer.error}`);
        return;
      }
      toast.show(`${label(option)} desactivada.`);
      changed(option);
    },
    remove: async (file, active) => {
      if ([...active.values()].some((flyer) => flyer?.name === file.name)) {
        toast.show("Desactivá el flyer antes de borrarlo.");
        return;
      }
      setBusy(`delete:${file.name}`);
      const answer = await removeUpload(bucket, file.name);
      setBusy(null);
      if (!answer.ok) {
        toast.show(`No se pudo borrar: ${answer.error}`);
        return;
      }
      reread();
      toast.show("Archivo eliminado");
    },
  };
}
