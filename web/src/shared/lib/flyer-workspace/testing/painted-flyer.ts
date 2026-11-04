// Test support: a flyer painted for the test, with what a test can look for on it.
import { contextOf } from "@/shared/flyer-engine/canvas.ts";
import type { WorkspaceReadings } from "../workspace-readings.ts";
import type { FlyerWorkspace } from "../workspace-store.ts";

export const FLYER_WIDTH = 800;
export const FLYER_HEIGHT = 900;

export interface PaintedBlock {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly color: string;
}

/** Three logos in a row, and some text under the first one. */
export const LOGO_A: PaintedBlock = { x: 100, y: 100, w: 120, h: 60, color: "#123456" };
export const LOGO_B: PaintedBlock = { x: 320, y: 100, w: 100, h: 50, color: "#a01010" };
export const LOGO_C: PaintedBlock = { x: 520, y: 110, w: 90, h: 70, color: "#108030" };
export const DAYS_TEXT: PaintedBlock = { x: 110, y: 172, w: 90, h: 14, color: "#222222" };

export function paintedFlyer(blocks: readonly PaintedBlock[]): string {
  const canvas = document.createElement("canvas");
  canvas.width = FLYER_WIDTH;
  canvas.height = FLYER_HEIGHT;
  const context = contextOf(canvas);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, FLYER_WIDTH, FLYER_HEIGHT);
  for (const { x, y, w, h, color } of blocks) {
    context.fillStyle = color;
    context.fillRect(x, y, w, h);
  }
  return canvas.toDataURL("image/png");
}

export async function paintedLogo(width: number, height: number, color = "#335577"): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = contextOf(canvas);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.fillStyle = color;
  context.fillRect(4, 4, width - 8, height - 8);
  const answer = await fetch(canvas.toDataURL("image/png"));
  return answer.blob();
}

function isWorkspace(value: unknown): value is FlyerWorkspace {
  return value instanceof Object && "getState" in value;
}

/** The workspace on screen, as what lets a test read it gives it. */
export function workspaceOnScreen(): FlyerWorkspace {
  const read: unknown = window["__flyerProbe"]?.["flyerWorkspace"]?.();
  if (isWorkspace(read)) return read;
  throw new Error("The workspace is not on screen");
}

function areReadings(value: unknown): value is WorkspaceReadings {
  return value instanceof Object && "legalWith" in value;
}

export function readingsOnScreen(): WorkspaceReadings {
  const read: unknown = window["__flyerProbe"]?.["flyerReadings"]?.();
  if (areReadings(read)) return read;
  throw new Error("The workspace is not on screen");
}
