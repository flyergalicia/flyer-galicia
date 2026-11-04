// Which story has to look like which part of the current app. Each case names the part by its
// place in the current app, so this file goes away with that app, together with the project.
import { type ReferenceScreen } from "../driver/screens.ts";

export const APPEARANCES = {
  "desktop-light": {
    viewport: { width: 1366, height: 800 },
    dark: false,
    palette: "marfil",
    touch: false,
  },
  "desktop-dark": {
    viewport: { width: 1366, height: 800 },
    dark: true,
    palette: "marfil",
    touch: false,
  },
  "phone-light": {
    viewport: { width: 390, height: 844 },
    dark: false,
    palette: "marfil",
    touch: true,
  },
  "desktop-marino": {
    viewport: { width: 1366, height: 800 },
    dark: false,
    palette: "marino",
    touch: false,
  },
  "desktop-grafito": {
    viewport: { width: 1366, height: 800 },
    dark: false,
    palette: "grafito",
    touch: false,
  },
  "desktop-cielo": {
    viewport: { width: 1366, height: 800 },
    dark: false,
    palette: "cielo",
    touch: false,
  },
} as const;

export type AppearanceName = keyof typeof APPEARANCES;

/** The state of the element in which it is read. It is pressed the same way on both sides. */
export type LookState = "rest" | "hover" | "focus";

export interface LookCase {
  /** Name of the export in its stories file: Shared/UI/Reference if it does not say another. */
  story: string;
  /** Where the current app has it; the first one on screen. */
  legacy: string;
  /** Markup to add to the page of the current app, for a state that no screen of it shows. */
  probe?: string;
  /** What to read in the story. By default, the first element of the story. */
  target?: string;
  /** What goes to the place of the current app: by default, target. "none" leaves it there. */
  place?: string;
  /** Besides the height, it must come out with the same width by itself. */
  fits?: boolean;
  /** Properties that do not have to match, and why, in a comment where it is used. */
  ignore?: readonly string[];
  states?: readonly LookState[];
  /** The other parts of a slice over it, painted out on both images. */
  mask?: readonly string[];
  /** Another part of the current app that gives the place, when `place` is a bigger piece. */
  placeFrom?: string;
  /** It is not in any reference image: only its computed values are compared. */
  noImage?: boolean;
  /** On a phone this screen shows something else in that place. */
  notOnPhone?: boolean;
  /** On a phone it is below what the reference image shows: only its computed values count. */
  belowThePhoneImage?: boolean;
  /** The corners of a window show what is behind it, which a story does not have. */
  cornerRadius?: number;
  /** A row of the current app stretches it to the height of its neighbor. */
  stretched?: boolean;
}

export interface ScreenGroup {
  name: string;
  screen: ReferenceScreen;
  /** The first part of the name of its reference images. */
  image: string;
  user?: string;
  commercialActions?: boolean;
  noFlyer?: boolean;
  signedOut?: boolean;
  appearances: readonly AppearanceName[];
  cases: readonly LookCase[];
}

const DESKTOP: readonly AppearanceName[] = ["desktop-light", "desktop-dark"];
const WITH_PHONE: readonly AppearanceName[] = [...DESKTOP, "phone-light"];
const ALL: readonly AppearanceName[] = [
  ...WITH_PHONE,
  "desktop-marino",
  "desktop-grafito",
  "desktop-cielo",
];

export const STORY_FIRST_ELEMENT = "#storybook-root > *";
const SELECTED_TAB = '[aria-selected="true"]';
const OTHER_TAB = '[role="tab"]:not([aria-selected="true"])';

export const SCREEN_GROUPS: readonly ScreenGroup[] = [
  {
    name: "editor",
    screen: "flyer-editor",
    image: "flyer-editor-advisor",
    appearances: ALL,
    cases: [
      { story: "EditorTabs", legacy: ".tabs" },
      {
        story: "EditorTabs",
        legacy: ".tab.active",
        target: '[aria-selected="true"]',
        place: "none",
        noImage: true,
      },
      { story: "OfficerName", legacy: ".collapsible .field" },
      {
        story: "OfficerName",
        legacy: ".collapsible input[type=text]",
        target: "input",
        place: "none",
        noImage: true,
        states: ["rest", "focus"],
      },
      {
        story: "CompanyCard",
        legacy: ".fg-card",
        // The magnifying glass belongs to the editor, and it makes the box narrower.
        mask: [".fg-pad-wrap"],
      },
      {
        story: "ShowOfficers",
        legacy: ".sw.on",
        fits: true,
        target: "#storybook-root > * > span",
        place: STORY_FIRST_ELEMENT,
        // It has no text of its own.
        ignore: ["color", "font-size", "font-weight", "cursor"],
      },
      // In the dock of the editor, its width is shared with the buttons beside it.
      {
        story: "DownloadPdf",
        belowThePhoneImage: true,
        legacy: "#btn-dl-pdf",
        ignore: ["padding-left", "padding-right", "white-space"],
        states: ["rest", "hover"],
      },
      {
        story: "PreviewButton",
        belowThePhoneImage: true,
        legacy: ".btn.bblue",
        ignore: ["padding-left", "padding-right", "white-space"],
        states: ["rest", "hover"],
      },
      { story: "PanelTitle", legacy: ".ptitle" },
    ],
  },
  {
    name: "login",
    screen: "login",
    image: "login",
    noFlyer: true,
    signedOut: true,
    appearances: WITH_PHONE,
    cases: [
      { story: "LoginEmail", legacy: ".login-inp", states: ["rest", "focus"] },
      { story: "LoginLabel", legacy: ".login-lbl", target: "label", place: "none", noImage: true },
      {
        story: "LoginSubmit",
        legacy: ".login-submit",
        ignore: ["display"],
        states: ["rest", "hover"],
      },
      // In the current app it is an inline button of a row; here, one that fits its text.
      { story: "LoginForgot", legacy: ".login-link", fits: true, ignore: ["display", "cursor"] },
    ],
  },
  {
    name: "users",
    screen: "admin-users",
    image: "admin-users",
    user: "admin",
    appearances: WITH_PHONE,
    cases: [
      { story: "AdminMainTabs", legacy: ".atabs" },
      { story: "AdminSubTabs", legacy: "#sg-admin" },
      {
        story: "NewUser",
        legacy: ".btn-new-usr",
        fits: true,
        ignore: ["display"],
        states: ["rest", "hover"],
      },
      { story: "UserSearch", stretched: true, legacy: ".usr-search-inp" },
      { story: "UserFilter", stretched: true, legacy: ".usr-filter-sel" },
      {
        story: "AdminMainTabs",
        legacy: ".atab.active",
        target: '[aria-selected="true"]',
        place: "none",
        noImage: true,
      },
      {
        story: "AdminMainTabs",
        legacy: ".atab:not(.active)",
        target: '[role="tab"]:not([aria-selected="true"])',
        place: "none",
        noImage: true,
      },
      {
        story: "AdminSubTabs",
        legacy: "#sg-admin .stab.active",
        target: '[aria-selected="true"]',
        place: "none",
        noImage: true,
      },
      {
        story: "AdminSubTabs",
        legacy: "#sg-admin .stab:not(.active)",
        target: '[role="tab"]:not([aria-selected="true"])',
        place: "none",
        noImage: true,
      },
      { story: "SectionTitle", legacy: ".ap-sec" },
      { story: "UserRow", legacy: ".usr-row:has(.badge-asesor)", states: ["rest", "hover"] },
      { story: "BadgeActive", legacy: ".badge-active", fits: true },
      { story: "BadgePending", legacy: ".badge-pending", fits: true },
      {
        story: "ButtonDeactivate",
        legacy: ".usr-btn.warn",
        fits: true,
        ignore: ["display"],
        states: ["rest", "hover"],
      },
      {
        story: "ButtonEdit",
        legacy: ".usr-btn.edit",
        fits: true,
        ignore: ["display"],
        states: ["rest", "hover"],
      },
    ],
  },
  {
    name: "dashboard",
    screen: "admin-dashboard",
    image: "admin-dashboard",
    user: "admin",
    appearances: WITH_PHONE,
    cases: [
      { story: "StatTotal", legacy: ".stat-card:has(#stat-total)", states: ["rest", "hover"] },
      { story: "StatActive", legacy: ".stat-card.sc-green" },
      { story: "StatAdmins", legacy: ".stat-card.sc-red" },
      { story: "StatFlyers", legacy: ".stat-card.sc-blue" },
      { story: "StatPending", legacy: ".stat-card.sc-yellow" },
    ],
  },
  {
    name: "menu",
    screen: "user-menu",
    image: "user-menu",
    appearances: WITH_PHONE,
    cases: [
      { story: "UserMenu", legacy: ".hdr-dropdown", target: '[role="menu"]' },
      {
        story: "UserMenu",
        legacy: ".hdr-dd-item",
        target: '[role="menuitem"]',
        place: "none",
        noImage: true,
        states: ["rest", "hover"],
      },
      {
        story: "UserMenu",
        legacy: ".hdr-dd-item.danger",
        target: '[role="menu"] > button:last-child',
        place: "none",
        noImage: true,
        states: ["rest", "hover"],
      },
      {
        story: "UserMenu",
        legacy: ".hdr-dd-pal button.on",
        target: '[aria-pressed="true"]',
        place: "none",
        noImage: true,
      },
    ],
  },
  {
    name: "window",
    screen: "database-companies",
    image: "database-companies",
    appearances: WITH_PHONE,
    cases: [
      {
        story: "DatabaseWindow",
        legacy: "#pad-mine",
        target: "dialog",
        place: "none",
        noImage: true,
      },
      {
        story: "DatabaseWindow",
        legacy: "#pad-mine-ov",
        target: "div:has(> dialog)",
        place: "none",
        noImage: true,
      },
      {
        story: "DatabaseWindow",
        legacy: ".pm-head",
        target: "dialog > :first-child",
        place: "dialog",
        placeFrom: "#pad-mine",
        cornerRadius: 14,
      },
      { story: "WindowTabs", legacy: ".pm-tabs", ignore: ["color"] },
      {
        story: "WindowTabs",
        legacy: ".pm-tabs .stab.active",
        target: SELECTED_TAB,
        place: "none",
        noImage: true,
      },
      {
        story: "WindowTabs",
        legacy: ".pm-tabs .stab:not(.active)",
        target: OTHER_TAB,
        place: "none",
        noImage: true,
      },
    ],
  },
  {
    name: "promotions",
    screen: "promotions-active",
    image: "promotions-active",
    appearances: WITH_PHONE,
    cases: [
      { story: "PromotionsTabs", legacy: ".tabs:has(.ptab)" },
      { story: "ProvinceSelect", legacy: ".field select", ignore: ["transition-property"] },
      { story: "HideOnline", legacy: ".promos-chk" },
      { story: "UpdateCatalog", legacy: "#promos-sync-btn", states: ["rest", "hover"] },
      { story: "ChipValid", legacy: ".promos-chip.c-vigente", fits: true },
      {
        story: "BadgeValid",
        belowThePhoneImage: true,
        legacy: ".promos-badge.b-vigente",
        fits: true,
      },
      {
        story: "BadgeExpired",
        belowThePhoneImage: true,
        legacy: ".promos-badge.b-vencida",
        fits: true,
      },
      {
        story: "TableHeader",
        legacy: ".promos-th-orden:nth-child(3)",
        target: "#storybook-root th",
        notOnPhone: true,
        place: "#storybook-root table",
      },
      {
        story: "TableCell",
        legacy: ".promos-table tbody tr:first-child td:nth-child(4)",
        target: "#storybook-root td",
        notOnPhone: true,
        place: "#storybook-root table",
      },
    ],
  },
  {
    name: "commercial",
    screen: "commercial-actions-list",
    image: "commercial-actions-list",
    user: "officer",
    commercialActions: true,
    noFlyer: true,
    appearances: DESKTOP,
    cases: [
      { story: "CommercialTabs", legacy: ".ges-tabs" },
      {
        story: "CommercialTabs",
        legacy: ".ges-tab.on",
        target: SELECTED_TAB,
        place: "none",
        noImage: true,
      },
      {
        story: "CommercialTabs",
        legacy: ".ges-tab:not(.on)",
        target: OTHER_TAB,
        place: "none",
        noImage: true,
      },
      { story: "CommercialSearch", legacy: "input.ges-inp" },
      // The current app leaves the arrow of the browser, with its default pointer.
      { story: "CommercialStateFilter", legacy: "select.ges-inp", ignore: ["cursor"] },
    ],
  },
];

/** States that no screenshot shows: their markup goes into the current app, to read its rules. */
export const PROBE_CASES: readonly LookCase[] = [
  {
    story: "Feedback/ProgressHalf",
    legacy: "[data-probe] .progress-bar",
    probe: '<div class="progress-bar"></div>',
    target: "progress",
    place: "none",
    noImage: true,
    // Only the bar: it has no text of its own.
    ignore: ["color", "font-size", "font-weight", "font-family"],
  },
  {
    story: "ListRow/Compact",
    legacy: "[data-probe] .recent-row",
    probe: '<div class="recent-row">x</div>',
    noImage: true,
  },
  {
    story: "Card/WithSubtitles",
    legacy: "[data-probe] .fg-card",
    probe: '<div class="fg-card">x</div>',
    noImage: true,
  },
  {
    story: "Card/WithSubtitles",
    legacy: "[data-probe] .sec-sub",
    probe: '<div class="fg-card"><div class="sec">x</div><div class="sec-sub">x</div></div>',
    target: "h4",
    place: "none",
    noImage: true,
  },
  {
    story: "Button/Secondary",
    legacy: "[data-probe] > *",
    probe: '<button class="btn bs">Reintentar</button>',
    ignore: ["display"],
    noImage: true,
    states: ["rest", "hover"],
  },
  {
    story: "Button/Green",
    legacy: "[data-probe] > *",
    probe: '<button class="btn bgreen">Generar ZIP</button>',
    ignore: ["display"],
    noImage: true,
  },
  {
    story: "Button/Ghost",
    legacy: "[data-probe] > *",
    probe: '<button class="btn bg">Restaurar</button>',
    ignore: ["display"],
    noImage: true,
    states: ["rest", "hover"],
  },
  {
    story: "Button/SoftOk",
    legacy: "[data-probe] > *",
    probe: '<button class="usr-btn ok">Aprobar</button>',
    ignore: ["display"],
    noImage: true,
    states: ["rest", "hover"],
  },
  {
    story: "Button/SoftMuted",
    legacy: "[data-probe] > *",
    probe: '<button class="usr-btn del">Cancelar</button>',
    ignore: ["display"],
    noImage: true,
    states: ["rest", "hover"],
  },
  {
    story: "Field/LongText",
    legacy: "[data-probe] textarea",
    probe: '<div class="field"><label>Legal</label><textarea>x</textarea></div>',
    target: "textarea",
    place: "none",
    noImage: true,
    ignore: ["height", "width"],
    states: ["rest", "focus"],
  },
  {
    story: "Field/Invalid",
    legacy: "[data-probe] input",
    probe:
      '<div class="field fg-inv"><label>Email</label><input type="text" value="ana.perez"><div class="fg-field-msg">x</div></div>',
    target: "input",
    place: "none",
    noImage: true,
  },
  {
    story: "Field/Invalid",
    legacy: "[data-probe] .fg-field-msg",
    probe:
      '<div class="field fg-inv"><label>Email</label><input type="text" value="ana.perez"><div class="fg-field-msg">x</div></div>',
    target: "#storybook-root p",
    place: "none",
    noImage: true,
  },
  {
    story: "Field/Warning",
    legacy: "[data-probe] input",
    probe:
      '<div class="field fg-warn"><label>Celular</label><input type="text" value="11"><div class="fg-field-msg">x</div></div>',
    target: "input",
    place: "none",
    noImage: true,
  },
  {
    story: "Field/Warning",
    legacy: "[data-probe] .fg-field-msg",
    probe:
      '<div class="field fg-warn"><label>Celular</label><input type="text" value="11"><div class="fg-field-msg">x</div></div>',
    target: "#storybook-root p",
    place: "none",
    noImage: true,
  },
  {
    story: "Switch/InARow",
    legacy: "[data-probe] .toggle-row",
    probe: '<div class="toggle-row"><span>Oficiales por sede</span><div class="sw on"></div></div>',
    target: '[role="switch"]',
    place: "none",
    noImage: true,
    ignore: ["cursor", "font-size"],
    states: ["rest", "hover"],
  },
  {
    story: "Switch/Off",
    legacy: "[data-probe] .sw",
    probe: '<div class="sw"></div>',
    target: "#storybook-root > * > span",
    place: "none",
    noImage: true,
    // It has no text of its own.
    ignore: ["color", "font-size", "cursor"],
  },
  {
    story: "ConfirmDialog/Question",
    legacy: "[data-probe] .fg-cf",
    probe: '<div class="fg-cf-ov"><div class="fg-cf" style="animation:none">x</div></div>',
    target: '[role="alertdialog"]',
    place: "none",
    noImage: true,
  },
  {
    story: "ConfirmDialog/Question",
    legacy: "[data-probe] .fg-cf-t",
    probe:
      '<div class="fg-cf-ov"><div class="fg-cf" style="animation:none"><h3 class="fg-cf-t">x</h3></div></div>',
    target: '[role="alertdialog"] h2',
    place: "none",
    noImage: true,
  },
  {
    story: "ConfirmDialog/Question",
    legacy: "[data-probe] .fg-cf-b",
    probe: '<div class="fg-cf"><div class="fg-cf-b">x</div></div>',
    target: '[role="alertdialog"] h2 + div',
    place: "none",
    noImage: true,
  },
  {
    story: "ConfirmDialog/Question",
    legacy: "[data-probe] .fg-cf-ico",
    probe: '<div class="fg-cf"><span class="fg-cf-ico">x</span></div>',
    target: '[role="alertdialog"] span',
    place: "none",
    noImage: true,
  },
  {
    story: "ConfirmDialog/Danger",
    legacy: "[data-probe] .fg-cf-ico",
    probe: '<div class="fg-cf"><span class="fg-cf-ico peligro">x</span></div>',
    target: '[role="alertdialog"] span',
    place: "none",
    noImage: true,
  },
  // The one the app uses is #toast-el: #toast is left over in the page and nothing shows it.
  {
    story: "Feedback/ToastShown",
    legacy: "#toast-el",
    ignore: ["opacity", "transform"],
    noImage: true,
  },
  {
    story: "Feedback/Spinning",
    legacy: "[data-probe] .lv-boot-spin",
    probe: '<div class="lv-boot-spin"></div>',
    noImage: true,
  },
  {
    story: "Feedback/SkeletonRow",
    legacy: "[data-probe] .skel",
    probe: '<div class="skel skel-row"></div>',
    noImage: true,
  },
  {
    story: "Feedback/SkeletonCard",
    legacy: "[data-probe] .skel",
    probe: '<div class="skel skel-card"></div>',
    noImage: true,
  },
  {
    story: "Feedback/Empty",
    legacy: "[data-probe] .history-empty",
    probe: '<div class="history-empty"><span class="he-ic"></span><strong>x</strong></div>',
    noImage: true,
  },
  {
    story: "Feedback/NoticeOk",
    legacy: "[data-probe] .val-summary",
    probe: '<div class="val-summary ok" style="display:block">x</div>',
    noImage: true,
  },
  {
    story: "Feedback/NoticeWarning",
    legacy: "[data-probe] .val-summary",
    probe: '<div class="val-summary warn" style="display:block">x</div>',
    noImage: true,
  },
  {
    story: "Feedback/NoticeError",
    legacy: "[data-probe] .val-summary",
    probe: '<div class="val-summary err" style="display:block">x</div>',
    noImage: true,
  },
  {
    story: "Feedback/NoticeAccent",
    legacy: "[data-probe] .fg-draft",
    probe: '<div class="fg-draft">x</div>',
    noImage: true,
    ignore: ["display"],
  },
  {
    story: "Badge/Inactive",
    legacy: "[data-probe] .badge",
    probe: '<span class="badge badge-inactive">x</span>',
    noImage: true,
    ignore: ["display"],
  },
  {
    story: "Badge/Admin",
    legacy: "[data-probe] .badge",
    probe: '<span class="badge badge-admin">x</span>',
    noImage: true,
    ignore: ["display"],
  },
  {
    story: "Badge/Advisor",
    legacy: "[data-probe] .badge",
    probe: '<span class="badge badge-asesor">x</span>',
    noImage: true,
    ignore: ["display"],
  },
  {
    story: "Badge/Vip",
    legacy: "[data-probe] .badge",
    probe: '<span class="badge badge-vip">x</span>',
    noImage: true,
    ignore: ["display"],
  },
  {
    story: "Badge/Pro",
    legacy: "[data-probe] .badge",
    probe: '<span class="badge badge-pro">x</span>',
    noImage: true,
    ignore: ["display"],
  },
  {
    story: "Badge/Hunter",
    legacy: "[data-probe] .badge",
    probe: '<span class="badge badge-hunter">x</span>',
    noImage: true,
    ignore: ["display"],
  },
  {
    story: "Badge/Leader",
    legacy: "[data-probe] .badge",
    probe: '<span class="badge badge-lider">x</span>',
    noImage: true,
    ignore: ["display"],
  },
  {
    story: "Badge/Ending",
    legacy: "[data-probe] .promos-badge",
    probe: '<span class="promos-badge b-vence">x</span>',
    noImage: true,
  },
  {
    story: "Badge/Review",
    legacy: "[data-probe] .promos-badge",
    probe: '<span class="promos-badge b-revisar">x</span>',
    noImage: true,
  },
  {
    story: "Badge/NotFound",
    legacy: "[data-probe] .promos-badge",
    probe: '<span class="promos-badge b-no">x</span>',
    noImage: true,
  },
  {
    story: "Badge/Outside",
    legacy: "[data-probe] .promos-badge",
    probe: '<span class="promos-badge b-fuera">x</span>',
    noImage: true,
  },
  {
    story: "Badge/Soon",
    legacy: "[data-probe] .promos-badge",
    probe: '<span class="promos-badge b-proxima">x</span>',
    noImage: true,
  },
];

/** Custom properties of the current app that have another name here. */
export const RENAMED_TOKENS: Readonly<Record<string, string>> = {
  "--azul": "--blue",
  "--light": "--paper",
  "--dark": "--ink",
  "--red": "--accent",
};

/** Ones that are not design tokens: each screen of the current app defines its own. */
export const NOT_TOKENS = /^--(?:ges-|ben-|fg-|simbar-)/;
