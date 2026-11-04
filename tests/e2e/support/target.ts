export type AppTarget = "legacy" | "react";

export interface TargetOption {
  /** Which version of the app the project tests. */
  target: AppTarget;
}

export interface StorybookOption {
  /** Where the built Storybook is served, for the project that compares shared against the app. */
  storybookUrl: string;
}
