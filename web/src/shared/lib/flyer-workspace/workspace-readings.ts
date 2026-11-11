// What a test reads of the flyer on screen and cannot see: see shared/lib/test-probe.ts.
import {
  type FlyerValues,
  legalWithValues,
  renderFullResolution,
  splitBold,
} from "@/shared/flyer-engine/index.ts";
import { blockReason, type FlyerWorkspace } from "./workspace-store.ts";

export function workspaceReadings(workspace: FlyerWorkspace) {
  return {
    /** The legal text of a template, with the amounts of what is on screen. */
    legalWith: (template: string) => {
      const { scene } = workspace.getState().slot;
      return scene ? legalWithValues(template, workspace.currentValues(), scene) : "";
    },
    /** The parts of a legal text that come out in bold. */
    boldParts: (text: string) =>
      splitBold(text)
        .filter(({ bold }) => bold)
        .map((part) => part.text.trim()),
    optionStatus: (option: number) => {
      const { slot } = workspace.getState();
      const hasArtwork = workspace.hasFlyer(option) ?? null;
      return {
        settled: hasArtwork !== null,
        hasArtwork,
        ready: slot.option === option && !slot.loading && !slot.failure && Boolean(slot.scene),
      };
    },
    /** A flyer of another moment, as the history downloads it. */
    renderWith: (values: Partial<FlyerValues>) => {
      const { scene } = workspace.getState().slot;
      if (scene) {
        renderFullResolution(scene, { ...workspace.currentValues(), ...values }, workspace.logos);
      }
    },
    blockText: () => blockReason(workspace.getState().slot, "", false),
    /** As it is on the screen and as it was published: what it does not know, it does not use. */
    optionCalibration: (option: number) => {
      const scene = workspace.optionScene(option);
      return { ...scene?.calibration, ...scene?.whole.rawCalibration };
    },
  };
}

export type WorkspaceReadings = ReturnType<typeof workspaceReadings>;
