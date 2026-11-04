import { type Page } from "@playwright/test";
import { type CompanyRegistryDriver } from "../company-registry.ts";

export function createLegacyCompanyRegistryDriver(_page: Page): CompanyRegistryDriver {
  return {};
}
