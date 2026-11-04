import { type Page } from "@playwright/test";
import { type AdminDriver } from "../admin.ts";

export function createLegacyAdminDriver(_page: Page): AdminDriver {
  return {};
}
