// Opening the calibrator of an image for an option, and "Guardar y activar". What arrives late for a
// calibrator that was closed, or replaced by another, does not touch the one open (invariant 6).
import { useRef, useState } from "react";
import {
  type FlyerOption,
  optionLabel,
  optionNumber,
  optionTab,
} from "@/shared/domain/flyer-options.ts";
import { loadPicture } from "@/shared/flyer-engine/index.ts";
import { readFlyerCalibrations, readLegalText } from "@/shared/lib/app-config/flyer-files.ts";
import { legalFile } from "@/shared/lib/flyer-workspace/option-files.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { saveAndActivate } from "../api/flyer-files.ts";
import { startingCalibration } from "./calibrator/calibration.ts";
import {
  type CalibratorStore,
  createCalibratorStore,
  openBenefit,
} from "./calibrator/calibrator-store.ts";
import { withVersion } from "./flyer-config.ts";
import type { UploadedPicture } from "./use-flyer-upload.ts";

export interface OpenCalibrator {
  readonly store: CalibratorStore;
  /** The template it opened with, in Flyer Rubros. */
  readonly template: string;
}

export function useCalibrator(options: readonly FlyerOption[], changed: (option: number) => void) {
  const { bucket } = useBackend();
  const toast = useToast();
  const [open, setOpen] = useState<OpenCalibrator | null>(null);
  const current = useRef<CalibratorStore | null>(null);
  const [saving, setSaving] = useState(false);

  const bringSaved = async (store: CalibratorStore) => {
    const saved = await readFlyerCalibrations(bucket);
    if (current.current !== store) return;
    if (!saved.ok) toast.show("No se pudo leer la calibración guardada de este flyer.");
    else if (saved.value[store.name] !== undefined) store.takeSaved(saved.value[store.name]);
    // The real legal text of that option, to see how much room it takes.
    const legal = await readLegalText(bucket, legalFile(store.option));
    if (current.current === store) store.setLegalText(legal.trim() ? legal : null);
  };

  const start = ({ image, name, url, option: chosen }: UploadedPicture) => {
    const option = optionNumber(options, chosen);
    const store = createCalibratorStore(
      {
        image,
        name,
        url,
        option,
        optionName: optionLabel(options, option),
        tab: optionTab(options, option),
      },
      startingCalibration(),
      window.innerWidth,
    );
    current.current = store;
    setOpen({ store, template: openBenefit(store) });
    void bringSaved(store);
  };

  /** From the list: the picture comes from the bucket, fresh. */
  const startFromList = async (file: { name: string; url: string }, option: number) => {
    toast.show("Cargando flyer...");
    const image = await loadPicture(withVersion(file.url, Date.now()));
    if (!image) {
      toast.show("No se pudo cargar la imagen del flyer");
      return;
    }
    start({ image, name: file.name, url: file.url, option });
  };

  const close = () => {
    current.current = null;
    setOpen(null);
  };

  const save = async () => {
    const store = open?.store;
    if (!store || saving) return;
    setSaving(true);
    toast.show("Guardando calibración...");
    const answer = await saveAndActivate(bucket, store, Date.now());
    setSaving(false);
    // If something failed it stays open: what was just adjusted is not lost, and it can be tried again.
    if (!answer.ok) {
      const what = answer.error.step === "save" ? "guardar" : "activar";
      toast.show(`Error al ${what} la calibración: ${answer.error.message}`);
      return;
    }
    toast.show(`¡Calibración guardada y activada en ${store.optionName}!`);
    if (current.current === store) close();
    changed(store.option);
  };

  return { open, start, startFromList, close, save, saving };
}
