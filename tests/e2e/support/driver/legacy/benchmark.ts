import { type Page } from "@playwright/test";
import { type BenchmarkDriver } from "../benchmark.ts";

export function createLegacyBenchmarkDriver(_page: Page): BenchmarkDriver {
  return {};
}
