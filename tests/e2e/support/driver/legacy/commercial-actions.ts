import { type Page } from "@playwright/test";
import { type CommercialActionsDriver } from "../commercial-actions.ts";

export function createLegacyCommercialActionsDriver(_page: Page): CommercialActionsDriver {
  return {};
}
