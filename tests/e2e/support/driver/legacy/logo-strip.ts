import { type Page } from "@playwright/test";
import { type LogoStripDriver } from "../logo-strip.ts";

export function createLegacyLogoStripDriver(_page: Page): LogoStripDriver {
  return {};
}
