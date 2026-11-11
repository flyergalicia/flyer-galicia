import { useSyncExternalStore } from "react";
import type { CalibratorStore } from "../../model/calibrator/calibrator-store.ts";

/** Re-renders with every change of the calibration that is not a drag. */
export function useCalibratorVersion(store: CalibratorStore): number {
  return useSyncExternalStore(store.subscribe, store.version);
}
