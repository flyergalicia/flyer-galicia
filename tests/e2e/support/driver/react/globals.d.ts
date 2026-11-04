// What the React app lets a test read: see web/src/shared/lib/test-probe.ts.
import { type CatalogPromotion, type PromotionQuery, type PromotionZone } from "../promotions.ts";

export interface PromotionsProbe {
  includeModo(): boolean;
  province(): string;
  locality(): string;
  localityAnswered(): boolean;
  catalog(): CatalogPromotion[];
  idsIn(provinces: readonly string[]): string[];
  currentOffers(title: string, province: string): number;
  flyerDays(query: PromotionQuery, zone: PromotionZone | null): Promise<string>;
  hasPercent(query: PromotionQuery, zone: PromotionZone | null): Promise<boolean>;
  withPercent(titles: readonly string[]): string[];
  ownDays(query: PromotionQuery): string;
  inProvince(query: PromotionQuery, province: string): boolean;
  modoShownInLocality(province: string, locality: string, cities: readonly string[]): boolean;
}

export interface CompanyRegistryProbe {
  ownCompanyCount(): number;
  companiesFailed(): boolean;
  editorCategory(row: number): {
    opcion?: number;
    txt?: string;
    importe?: string;
    importe2?: string;
  };
  destinationOption(company: unknown): number;
  sheetColumns(): readonly string[];
  exportAndReadBack(companies: unknown): { cells: string[][]; unchanged: boolean[] };
  capsOfSheetRow(cells: Record<string, string>): {
    opcion?: number;
    txt?: string;
    importe?: string;
    importe2?: string;
  };
  validateSheet(rows: readonly { cells: Record<string, string>; readerRow?: number }[]): {
    firstCompanyCap: string;
    problems: string[];
  };
}

declare global {
  interface Window {
    // Registered by each screen when it is opened.
    __flyerProbe?: {
      readonly promotions?: () => PromotionsProbe;
      readonly companyRegistry?: () => CompanyRegistryProbe;
    };
  }
}
