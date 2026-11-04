import { type Page } from "@playwright/test";
import { type SearchDriver } from "../search.ts";

export function createLegacySearchDriver(_page: Page): SearchDriver {
  return {};
}
