import { type Page } from "@playwright/test";
import { type AdminDriver } from "./admin.ts";
import { type BenchmarkDriver } from "./benchmark.ts";
import { type CalibratorDriver } from "./calibrator.ts";
import { type CommercialActionsDriver } from "./commercial-actions.ts";
import { type CompanyRegistryDriver } from "./company-registry.ts";
import { type FlyerEditorDriver } from "./flyer-editor.ts";
import { type FlyerOutputDriver } from "./flyer-output.ts";
import { type FlyerSectionsDriver } from "./flyer-sections.ts";
import { createLegacyAdminDriver } from "./legacy/admin.ts";
import { createLegacyBenchmarkDriver } from "./legacy/benchmark.ts";
import { createLegacyCalibratorDriver } from "./legacy/calibrator.ts";
import { createLegacyCommercialActionsDriver } from "./legacy/commercial-actions.ts";
import { createLegacyCompanyRegistryDriver } from "./legacy/company-registry.ts";
import { type FlyerDrawingDriver } from "./flyer-drawing.ts";
import { createLegacyFlyerDrawingDriver } from "./legacy/flyer-drawing.ts";
import { createLegacyFlyerEditorDriver } from "./legacy/flyer-editor.ts";
import { createLegacyFlyerOutputDriver } from "./legacy/flyer-output.ts";
import { createLegacyFlyerSectionsDriver } from "./legacy/flyer-sections.ts";
import { createLegacyLogoEditorDriver } from "./legacy/logo-editor.ts";
import { createLegacyLogoStripDriver } from "./legacy/logo-strip.ts";
import { createLegacyOfficersDriver } from "./legacy/officers.ts";
import { createLegacyPromotionsDriver } from "./legacy/promotions.ts";
import { createLegacySavedBrandsDriver } from "./legacy/saved-brands.ts";
import { createLegacyScreensDriver } from "./legacy/screens.ts";
import { createLegacySearchDriver } from "./legacy/search.ts";
import { createLegacySessionDriver } from "./legacy/session.ts";
import { createLegacyStudioDriver } from "./legacy/studio.ts";
import { type HunterDriver } from "./hunter.ts";
import { createLegacyHunterDriver } from "./legacy/hunter.ts";
import { type LogoEditorDriver } from "./logo-editor.ts";
import { type LogoStripDriver } from "./logo-strip.ts";
import { type OfficersDriver } from "./officers.ts";
import { type PromotionsDriver } from "./promotions.ts";
import { type SavedBrandsDriver } from "./saved-brands.ts";
import { type ScreensDriver } from "./screens.ts";
import { type SearchDriver } from "./search.ts";
import { type SessionDriver } from "./session.ts";
import { type StudioDriver } from "./studio.ts";
import { type AppTarget } from "../target.ts";

/** Everything a spec can do to the app, in terms that do not depend on its version. */
export interface AppDriver {
  /** For role and text locators, and for what a real user does with mouse and keyboard. */
  readonly page: Page;
  readonly session: SessionDriver;
  readonly flyerEditor: FlyerEditorDriver;
  readonly flyerOutput: FlyerOutputDriver;
  readonly officers: OfficersDriver;
  readonly flyerDrawing: FlyerDrawingDriver;
  readonly calibrator: CalibratorDriver;
  readonly hunter: HunterDriver;
  readonly logoEditor: LogoEditorDriver;
  readonly logoStrip: LogoStripDriver;
  readonly flyerSections: FlyerSectionsDriver;
  readonly savedBrands: SavedBrandsDriver;
  readonly promotions: PromotionsDriver;
  readonly companyRegistry: CompanyRegistryDriver;
  readonly studio: StudioDriver;
  readonly commercialActions: CommercialActionsDriver;
  readonly benchmark: BenchmarkDriver;
  readonly admin: AdminDriver;
  readonly search: SearchDriver;
  /** Reaches the reference screens and decides how they look. */
  readonly screens: ScreensDriver;
}

export function createAppDriver(page: Page, target: AppTarget): AppDriver {
  if (target === "react") {
    throw new Error("No React driver yet: they arrive with each slice (see driver/react).");
  }
  const domains = {
    session: createLegacySessionDriver(page),
    flyerEditor: createLegacyFlyerEditorDriver(page),
    flyerOutput: createLegacyFlyerOutputDriver(page),
    officers: createLegacyOfficersDriver(page),
    flyerDrawing: createLegacyFlyerDrawingDriver(page),
    calibrator: createLegacyCalibratorDriver(page),
    hunter: createLegacyHunterDriver(page),
    logoEditor: createLegacyLogoEditorDriver(page),
    logoStrip: createLegacyLogoStripDriver(page),
    flyerSections: createLegacyFlyerSectionsDriver(page),
    savedBrands: createLegacySavedBrandsDriver(page),
    promotions: createLegacyPromotionsDriver(page),
    companyRegistry: createLegacyCompanyRegistryDriver(page),
    studio: createLegacyStudioDriver(page),
    commercialActions: createLegacyCommercialActionsDriver(page),
    benchmark: createLegacyBenchmarkDriver(page),
    admin: createLegacyAdminDriver(page),
    search: createLegacySearchDriver(page),
  };
  return { page, ...domains, screens: createLegacyScreensDriver(page, domains) };
}
