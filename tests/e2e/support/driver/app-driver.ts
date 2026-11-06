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
import { createReactAdminDriver } from "./react/admin.ts";
import { createReactBenchmarkDriver } from "./react/benchmark.ts";
import { createReactCalibratorDriver } from "./react/calibrator.ts";
import { createReactCommercialActionsDriver } from "./react/commercial-actions.ts";
import { createReactCompanyRegistryDriver } from "./react/company-registry.ts";
import { createReactFlyerDrawingDriver } from "./react/flyer-drawing.ts";
import { createReactFlyerEditorDriver } from "./react/flyer-editor.ts";
import { createReactFlyerOutputDriver } from "./react/flyer-output.ts";
import { createReactOfficersDriver } from "./react/officers.ts";
import { createReactFlyerSectionsDriver } from "./react/flyer-sections.ts";
import { createReactHunterDriver } from "./react/hunter.ts";
import { createReactLogoEditorDriver } from "./react/logo-editor.ts";
import { createReactLogoStripDriver } from "./react/logo-strip.ts";
import { createReactPromotionsDriver } from "./react/promotions.ts";
import { createReactSavedBrandsDriver } from "./react/saved-brands.ts";
import { createReactScreensDriver } from "./react/screens.ts";
import { createReactSearchDriver } from "./react/search.ts";
import { createReactSessionDriver } from "./react/session.ts";
import { createReactStudioDriver } from "./react/studio.ts";
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

/** Every domain, whole: what a person cannot do fails saying why (see driver/react). */
function createReactAppDriver(page: Page): AppDriver {
  const session = createReactSessionDriver(page);
  const promotions = createReactPromotionsDriver(page);
  const companyRegistry = createReactCompanyRegistryDriver(page);
  const logoEditor = createReactLogoEditorDriver(page);
  const logoStrip = createReactLogoStripDriver(page);
  const studio = createReactStudioDriver(page);
  const commercialActions = createReactCommercialActionsDriver(page);
  const benchmark = createReactBenchmarkDriver(page);
  const admin = createReactAdminDriver(page);
  const search = createReactSearchDriver(page);
  return {
    page,
    session,
    flyerEditor: createReactFlyerEditorDriver(page),
    flyerOutput: createReactFlyerOutputDriver(page),
    officers: createReactOfficersDriver(page),
    flyerDrawing: createReactFlyerDrawingDriver(page),
    calibrator: createReactCalibratorDriver(page),
    hunter: createReactHunterDriver(page),
    logoEditor,
    logoStrip,
    flyerSections: createReactFlyerSectionsDriver(page),
    savedBrands: createReactSavedBrandsDriver(page),
    promotions,
    companyRegistry,
    studio,
    commercialActions,
    benchmark,
    admin,
    search,
    screens: createReactScreensDriver(page, {
      session,
      promotions,
      companyRegistry,
      logoEditor,
      logoStrip,
      studio,
      commercialActions,
      benchmark,
      admin,
      search,
    }),
  };
}

export function createAppDriver(page: Page, target: AppTarget): AppDriver {
  if (target === "react") return createReactAppDriver(page);
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
