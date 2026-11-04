import { type Page } from "@playwright/test";
import { type PromotionsDriver } from "../promotions.ts";

export function createLegacyPromotionsDriver(_page: Page): PromotionsDriver {
  return {};
}
