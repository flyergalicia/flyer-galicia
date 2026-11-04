import { type Page } from "@playwright/test";
import { type StudioDriver } from "../studio.ts";

export function createLegacyStudioDriver(_page: Page): StudioDriver {
  return {};
}
