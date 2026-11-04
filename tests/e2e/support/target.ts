export type AppTarget = "legacy" | "react";

export interface TargetOption {
  /** Which version of the app the project tests. */
  target: AppTarget;
}
