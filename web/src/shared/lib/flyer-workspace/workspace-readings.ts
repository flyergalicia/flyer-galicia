// What a test reads of the flyer on screen and cannot see: see shared/lib/test-probe.ts.
import { legalWithValues } from "@/shared/flyer-engine/index.ts";
import { blockReason, type FlyerWorkspace } from "./workspace-store.ts";

export function workspaceReadings(workspace: FlyerWorkspace) {
  return {
    /** The legal text of a template, with the amounts of what is on screen. */
    legalWith: (template: string) => {
      const { scene } = workspace.getState().slot;
      return scene ? legalWithValues(template, workspace.currentValues(), scene) : "";
    },
    blockText: () => blockReason(workspace.getState().slot, "", false),
    optionCalibration: (option: number) => workspace.optionScene(option)?.calibration ?? {},
  };
}

export type WorkspaceReadings = ReturnType<typeof workspaceReadings>;
