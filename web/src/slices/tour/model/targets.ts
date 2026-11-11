// What each step lights up. Each element is found by its data-testid or by what the component says
// of itself (a role, an id, a name), never by a class: the buttons of the foot of the flyer editor
// move between its fixed bar and the column of the phone, and a class does not follow them
// (invariant 17).
import { type InnerTab } from "@/shared/domain/commercial-tabs.ts";

/** Where Gestiones lives on the header: what is lit while its code is still coming down. */
const COMMERCIAL_HEADER_TAB = '[data-tab-id="gestiones"]';

export const TARGETS = {
  company: '[data-testid="company-name"]',
  companySearch: '[data-testid="company-search-button"]',
  officerTitle: '[data-testid="officer-title-1"]',
  paste: '[data-testid="paste-button-1"]',
  addOfficer: '[data-testid="add-officer"]',
  cashback: '[data-testid="cashback-buttons"]',
  legal: '[data-testid="legal-text"]',
  legalBold: '[data-testid="legal-bold"]',
  zoom: '[data-testid="flyer-zoom"]',
  preview: '[data-testid="preview-button"]',
  download: '[data-testid="download-pdf"]',
  restore: '[data-testid="restore-button"]',
  others: '[data-testid="other-actions"]',
  branches: '[data-testid="other-actions"] [role="switch"]',
  template: '[data-testid="batch-template"]',
  excel: '[data-testid="batch-drop"]',
  segment: '[data-testid="segment-box"]',
  historyTab: '[role="tablist"][aria-label="Modo de armado"] [role="tab"][id$="-tab-historial"]',
  menuDatabase: '[role="menu"] [data-item="database"]',
  menuNotes: '[role="menu"] [data-item="notes"]',
  menuTheme: '[role="menu"] [data-item="theme"]',
  menuPalette: '[role="menu"] fieldset[aria-label="Tema"]',
  menuPassword: '[role="menu"] [data-item="password"]',
  menuTour: '[role="menu"] [data-item="tour"]',
  hunterSearch: '[data-testid="hunter-search"]',
  hunterList: '[data-testid="hunter-list"]',
  hunterZoom: '[data-testid="hunter-zoom"]',
  hunterOthers: '[data-testid="hunter-others"]',
  hunterDownload: '[data-testid="hunter-download"]',
  hunterRegister: '[data-testid="hunter-register"]',
  promotionsProvince: '[data-testid="promotions-province"]',
  promotionsBrands: '[data-testid="promotions-brands"]',
  promotionsMonth: '[data-testid="promotions-month"]',
  promotionsValidate: '[data-testid="promotions-validate"]',
  promotionsActive: '[data-screen="promotions"] [role="tab"][id$="-tab-active"]',
  promotionsCatalog: '[data-testid="promotions-update-catalog"]',
  commercialTab: COMMERCIAL_HEADER_TAB,
  optionBar: '[data-testid="flyer-options"]',
  categoryTab: '[data-tab-id="rubros"]',
  benefit: '[data-testid="benefit-fields"]',
} as const;

type SimpleTarget = keyof typeof TARGETS;

/** A solapa inside Gestiones: if Gestiones has not come down yet, its tab of the header (`gesTab`). */
export type CommercialTarget = `commercial:${InnerTab}`;

export type TargetKey = SimpleTarget | CommercialTarget;

export function commercialTarget(tab: InnerTab): CommercialTarget {
  return `commercial:${tab}`;
}

const COMMERCIAL_PREFIX = "commercial:";

function isCommercial(key: TargetKey): key is CommercialTarget {
  return key.startsWith(COMMERCIAL_PREFIX);
}

/** The selectors a step can light, in the order they are tried. */
export function selectorsOf(key: TargetKey): readonly string[] {
  if (isCommercial(key)) {
    const tab = key.slice(COMMERCIAL_PREFIX.length);
    return [`[data-testid="commercial-tabs"] [data-tab="${tab}"]`, COMMERCIAL_HEADER_TAB];
  }
  return [TARGETS[key]];
}

/** Where something is looked for: the page, or a part of it. */
export interface PagePart {
  readonly querySelector: (selectors: string) => unknown;
}

/** Whether the Gestiones of now has its solapas on the page: its code came down (`window.GES`). */
export function commercialTabsOnPage(root: PagePart = document): boolean {
  return root.querySelector('[data-testid="commercial-tabs"]') !== null;
}

/** The element of the step, whether it is seen or not. */
export function targetOf(key: TargetKey, root: ParentNode = document): Element | null {
  for (const selector of selectorsOf(key)) {
    const found = root.querySelector(selector);
    if (found) return found;
  }
  return null;
}

/** The element only if it is seen: with a size, and not hidden (`_tourEl`). */
export function visibleTarget(key: TargetKey, root: ParentNode = document): Element | null {
  const element = targetOf(key, root);
  if (!element) return null;
  const { width, height } = element.getBoundingClientRect();
  return width > 0 && height > 0 && getComputedStyle(element).visibility !== "hidden"
    ? element
    : null;
}

/** The code of the screen on top is still coming down: its place is there, and empty. */
export function screenLoading(root: ParentNode = document): boolean {
  const shown = root.querySelector("main > section[data-screen]:not([hidden])");
  return shown !== null && shown.childElementCount === 0;
}
