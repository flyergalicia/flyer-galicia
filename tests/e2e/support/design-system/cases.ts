// Which story has to look like which part of the old app. Each case names the part by its place in
// the old app: that name is the key of what was read from it, frozen in
// tests/fixtures/design-system/reference-look.json (see reference-look.ts). The old app is gone, so a case
// added here has nothing to be compared with.

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
  /** Where the old app had it: the first one on screen. With the story, its frozen values' key. */
  selector: string;
  /** The markup that was added to the page of the old app, for a state no screen of it shows. */
  probe?: string;
  /** What to read in the story. By default, the first element of the story. */
  target?: string;
  /** What goes to the place it had in the old app: by default, target. "none" leaves it there. */
  place?: string;
  /** Besides the height, it must come out with the same width by itself. */
  fits?: boolean;
  /** Properties that do not have to match, and why, in a comment where it is used. */
  ignore?: readonly string[];
  states?: readonly LookState[];
  /** The other parts of a slice over it, painted out on both images, where the old app had them. */
  mask?: readonly string[];
  /** Another part of the old app that gives the place, when `place` is a bigger piece. */
  placeFrom?: string;
  /** It is not in any reference image: only its computed values are compared. */
  noImage?: boolean;
  /** On a phone this screen shows something else in that place. */
  notOnPhone?: boolean;
  /** On a phone it is below what the reference image shows: only its computed values count. */
  belowThePhoneImage?: boolean;
  /** The corners of a window show what is behind it, which a story does not have. */
  cornerRadius?: number;
  /** A row of the old app stretched it to the height of its neighbor. */
  stretched?: boolean;
}

/** The cases of one screen of the old app. Its name is the key of their frozen values. */
export interface ScreenGroup {
  name: string;
  /** The first part of the name of its reference images. */
  image: string;
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
    image: "flyer-editor-advisor",
    appearances: ALL,
    cases: [
      { story: "EditorTabs", selector: ".tabs" },
      {
        story: "EditorTabs",
        selector: ".tab.active",
        target: '[aria-selected="true"]',
        place: "none",
        noImage: true,
      },
      { story: "OfficerName", selector: ".collapsible .field" },
      {
        story: "OfficerName",
        selector: ".collapsible input[type=text]",
        target: "input",
        place: "none",
        noImage: true,
        states: ["rest", "focus"],
      },
      {
        story: "CompanyCard",
        selector: ".fg-card",
        // The magnifying glass belongs to the editor, and it makes the box narrower.
        mask: [".fg-pad-wrap"],
      },
      {
        story: "ShowOfficers",
        selector: ".sw.on",
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
        selector: "#btn-dl-pdf",
        ignore: ["padding-left", "padding-right", "white-space"],
        states: ["rest", "hover"],
      },
      {
        story: "PreviewButton",
        belowThePhoneImage: true,
        selector: ".btn.bblue",
        ignore: ["padding-left", "padding-right", "white-space"],
        states: ["rest", "hover"],
      },
      { story: "PanelTitle", selector: ".ptitle" },
    ],
  },
  {
    name: "login",
    image: "login",
    appearances: WITH_PHONE,
    cases: [
      { story: "LoginEmail", selector: ".login-inp", states: ["rest", "focus"] },
      {
        story: "LoginLabel",
        selector: ".login-lbl",
        target: "label",
        place: "none",
        noImage: true,
      },
      {
        story: "LoginSubmit",
        selector: ".login-submit",
        ignore: ["display"],
        states: ["rest", "hover"],
      },
      // In the old app it was an inline button of a row; here, one that fits its text.
      { story: "LoginForgot", selector: ".login-link", fits: true, ignore: ["display", "cursor"] },
    ],
  },
  {
    name: "users",
    image: "admin-users",
    appearances: WITH_PHONE,
    cases: [
      { story: "AdminMainTabs", selector: ".atabs" },
      { story: "AdminSubTabs", selector: "#sg-admin" },
      {
        story: "NewUser",
        selector: ".btn-new-usr",
        fits: true,
        ignore: ["display"],
        states: ["rest", "hover"],
      },
      { story: "UserSearch", stretched: true, selector: ".usr-search-inp" },
      { story: "UserFilter", stretched: true, selector: ".usr-filter-sel" },
      {
        story: "AdminMainTabs",
        selector: ".atab.active",
        target: '[aria-selected="true"]',
        place: "none",
        noImage: true,
      },
      {
        story: "AdminMainTabs",
        selector: ".atab:not(.active)",
        target: '[role="tab"]:not([aria-selected="true"])',
        place: "none",
        noImage: true,
      },
      {
        story: "AdminSubTabs",
        selector: "#sg-admin .stab.active",
        target: '[aria-selected="true"]',
        place: "none",
        noImage: true,
      },
      {
        story: "AdminSubTabs",
        selector: "#sg-admin .stab:not(.active)",
        target: '[role="tab"]:not([aria-selected="true"])',
        place: "none",
        noImage: true,
      },
      { story: "SectionTitle", selector: ".ap-sec" },
      { story: "UserRow", selector: ".usr-row:has(.badge-asesor)", states: ["rest", "hover"] },
      { story: "BadgeActive", selector: ".badge-active", fits: true },
      { story: "BadgePending", selector: ".badge-pending", fits: true },
      {
        story: "ButtonDeactivate",
        selector: ".usr-btn.warn",
        fits: true,
        ignore: ["display"],
        states: ["rest", "hover"],
      },
      {
        story: "ButtonEdit",
        selector: ".usr-btn.edit",
        fits: true,
        ignore: ["display"],
        states: ["rest", "hover"],
      },
    ],
  },
  {
    name: "dashboard",
    image: "admin-dashboard",
    appearances: WITH_PHONE,
    cases: [
      { story: "StatTotal", selector: ".stat-card:has(#stat-total)", states: ["rest", "hover"] },
      { story: "StatActive", selector: ".stat-card.sc-green" },
      { story: "StatAdmins", selector: ".stat-card.sc-red" },
      { story: "StatFlyers", selector: ".stat-card.sc-blue" },
      { story: "StatPending", selector: ".stat-card.sc-yellow" },
    ],
  },
  {
    name: "menu",
    image: "user-menu",
    appearances: WITH_PHONE,
    cases: [
      { story: "UserMenu", selector: ".hdr-dropdown", target: '[role="menu"]' },
      {
        story: "UserMenu",
        selector: ".hdr-dd-item",
        target: '[role="menuitem"]',
        place: "none",
        noImage: true,
        states: ["rest", "hover"],
      },
      {
        story: "UserMenu",
        selector: ".hdr-dd-item.danger",
        target: '[role="menu"] > button:last-child',
        place: "none",
        noImage: true,
        states: ["rest", "hover"],
      },
      {
        story: "UserMenu",
        selector: ".hdr-dd-pal button.on",
        target: '[aria-pressed="true"]',
        place: "none",
        noImage: true,
      },
    ],
  },
  {
    name: "window",
    image: "database-companies",
    appearances: WITH_PHONE,
    cases: [
      {
        story: "DatabaseWindow",
        selector: "#pad-mine",
        target: "dialog",
        place: "none",
        noImage: true,
      },
      {
        story: "DatabaseWindow",
        selector: "#pad-mine-ov",
        target: "div:has(> dialog)",
        place: "none",
        noImage: true,
      },
      {
        story: "DatabaseWindow",
        selector: ".pm-head",
        target: "dialog > :first-child",
        place: "dialog",
        placeFrom: "#pad-mine",
        cornerRadius: 14,
      },
      { story: "WindowTabs", selector: ".pm-tabs", ignore: ["color"] },
      {
        story: "WindowTabs",
        selector: ".pm-tabs .stab.active",
        target: SELECTED_TAB,
        place: "none",
        noImage: true,
      },
      {
        story: "WindowTabs",
        selector: ".pm-tabs .stab:not(.active)",
        target: OTHER_TAB,
        place: "none",
        noImage: true,
      },
    ],
  },
  {
    name: "promotions",
    image: "promotions-active",
    appearances: WITH_PHONE,
    cases: [
      { story: "PromotionsTabs", selector: ".tabs:has(.ptab)" },
      { story: "ProvinceSelect", selector: ".field select", ignore: ["transition-property"] },
      { story: "HideOnline", selector: ".promos-chk" },
      { story: "UpdateCatalog", selector: "#promos-sync-btn", states: ["rest", "hover"] },
      { story: "ChipValid", selector: ".promos-chip.c-vigente", fits: true },
      {
        story: "BadgeValid",
        belowThePhoneImage: true,
        selector: ".promos-badge.b-vigente",
        fits: true,
      },
      {
        story: "BadgeExpired",
        belowThePhoneImage: true,
        selector: ".promos-badge.b-vencida",
        fits: true,
      },
      {
        story: "TableHeader",
        selector: ".promos-th-orden:nth-child(3)",
        target: "#storybook-root th",
        notOnPhone: true,
        place: "#storybook-root table",
      },
      {
        story: "TableCell",
        selector: ".promos-table tbody tr:first-child td:nth-child(4)",
        target: "#storybook-root td",
        notOnPhone: true,
        place: "#storybook-root table",
      },
    ],
  },
  {
    name: "commercial",
    image: "commercial-actions-list",
    appearances: DESKTOP,
    cases: [
      { story: "CommercialTabs", selector: ".ges-tabs" },
      {
        story: "CommercialTabs",
        selector: ".ges-tab.on",
        target: SELECTED_TAB,
        place: "none",
        noImage: true,
      },
      {
        story: "CommercialTabs",
        selector: ".ges-tab:not(.on)",
        target: OTHER_TAB,
        place: "none",
        noImage: true,
      },
      { story: "CommercialSearch", selector: "input.ges-inp" },
      // The old app left the arrow of the browser, with its default pointer.
      { story: "CommercialStateFilter", selector: "select.ges-inp", ignore: ["cursor"] },
    ],
  },
];

/** States that no screenshot shows: their markup was added to the old app, to read its rules. */
export const PROBE_CASES: readonly LookCase[] = [
  {
    story: "Feedback/ProgressHalf",
    selector: "[data-probe] .progress-bar",
    probe: '<div class="progress-bar"></div>',
    target: "progress",
    place: "none",
    noImage: true,
    // Only the bar: it has no text of its own.
    ignore: ["color", "font-size", "font-weight", "font-family"],
  },
  {
    story: "ListRow/Compact",
    selector: "[data-probe] .recent-row",
    probe: '<div class="recent-row">x</div>',
    noImage: true,
  },
  {
    story: "Card/WithSubtitles",
    selector: "[data-probe] .fg-card",
    probe: '<div class="fg-card">x</div>',
    noImage: true,
  },
  {
    story: "Card/WithSubtitles",
    selector: "[data-probe] .sec-sub",
    probe: '<div class="fg-card"><div class="sec">x</div><div class="sec-sub">x</div></div>',
    target: "h4",
    place: "none",
    noImage: true,
  },
  {
    story: "Button/Secondary",
    selector: "[data-probe] > *",
    probe: '<button class="btn bs">Reintentar</button>',
    ignore: ["display"],
    noImage: true,
    states: ["rest", "hover"],
  },
  {
    story: "Button/Green",
    selector: "[data-probe] > *",
    probe: '<button class="btn bgreen">Generar ZIP</button>',
    ignore: ["display"],
    noImage: true,
  },
  {
    story: "Button/Ghost",
    selector: "[data-probe] > *",
    probe: '<button class="btn bg">Restaurar</button>',
    ignore: ["display"],
    noImage: true,
    states: ["rest", "hover"],
  },
  {
    story: "Button/SoftOk",
    selector: "[data-probe] > *",
    probe: '<button class="usr-btn ok">Aprobar</button>',
    ignore: ["display"],
    noImage: true,
    states: ["rest", "hover"],
  },
  {
    story: "Button/SoftMuted",
    selector: "[data-probe] > *",
    probe: '<button class="usr-btn del">Cancelar</button>',
    ignore: ["display"],
    noImage: true,
    states: ["rest", "hover"],
  },
  {
    story: "Field/LongText",
    selector: "[data-probe] textarea",
    probe: '<div class="field"><label>Legal</label><textarea>x</textarea></div>',
    target: "textarea",
    place: "none",
    noImage: true,
    ignore: ["height", "width"],
    states: ["rest", "focus"],
  },
  {
    story: "Field/Invalid",
    selector: "[data-probe] input",
    probe:
      '<div class="field fg-inv"><label>Email</label><input type="text" value="ana.perez"><div class="fg-field-msg">x</div></div>',
    target: "input",
    place: "none",
    noImage: true,
  },
  {
    story: "Field/Invalid",
    selector: "[data-probe] .fg-field-msg",
    probe:
      '<div class="field fg-inv"><label>Email</label><input type="text" value="ana.perez"><div class="fg-field-msg">x</div></div>',
    target: "#storybook-root p",
    place: "none",
    noImage: true,
  },
  {
    story: "Field/Warning",
    selector: "[data-probe] input",
    probe:
      '<div class="field fg-warn"><label>Celular</label><input type="text" value="11"><div class="fg-field-msg">x</div></div>',
    target: "input",
    place: "none",
    noImage: true,
  },
  {
    story: "Field/Warning",
    selector: "[data-probe] .fg-field-msg",
    probe:
      '<div class="field fg-warn"><label>Celular</label><input type="text" value="11"><div class="fg-field-msg">x</div></div>',
    target: "#storybook-root p",
    place: "none",
    noImage: true,
  },
  {
    story: "Switch/InARow",
    selector: "[data-probe] .toggle-row",
    probe: '<div class="toggle-row"><span>Oficiales por sede</span><div class="sw on"></div></div>',
    target: '[role="switch"]',
    place: "none",
    noImage: true,
    ignore: ["cursor", "font-size"],
    states: ["rest", "hover"],
  },
  {
    story: "Switch/Off",
    selector: "[data-probe] .sw",
    probe: '<div class="sw"></div>',
    target: "#storybook-root > * > span",
    place: "none",
    noImage: true,
    // It has no text of its own.
    ignore: ["color", "font-size", "cursor"],
  },
  {
    story: "ConfirmDialog/Question",
    selector: "[data-probe] .fg-cf",
    probe: '<div class="fg-cf-ov"><div class="fg-cf" style="animation:none">x</div></div>',
    target: '[role="alertdialog"]',
    place: "none",
    noImage: true,
  },
  {
    story: "ConfirmDialog/Question",
    selector: "[data-probe] .fg-cf-t",
    probe:
      '<div class="fg-cf-ov"><div class="fg-cf" style="animation:none"><h3 class="fg-cf-t">x</h3></div></div>',
    target: '[role="alertdialog"] h2',
    place: "none",
    noImage: true,
  },
  {
    story: "ConfirmDialog/Question",
    selector: "[data-probe] .fg-cf-b",
    probe: '<div class="fg-cf"><div class="fg-cf-b">x</div></div>',
    target: '[role="alertdialog"] h2 + div',
    place: "none",
    noImage: true,
  },
  {
    story: "ConfirmDialog/Question",
    selector: "[data-probe] .fg-cf-ico",
    probe: '<div class="fg-cf"><span class="fg-cf-ico">x</span></div>',
    target: '[role="alertdialog"] span',
    place: "none",
    noImage: true,
  },
  {
    story: "ConfirmDialog/Danger",
    selector: "[data-probe] .fg-cf-ico",
    probe: '<div class="fg-cf"><span class="fg-cf-ico peligro">x</span></div>',
    target: '[role="alertdialog"] span',
    place: "none",
    noImage: true,
  },
  // The one the app uses is #toast-el: #toast is left over in the page and nothing shows it.
  {
    story: "Feedback/ToastShown",
    selector: "#toast-el",
    ignore: ["opacity", "transform"],
    noImage: true,
  },
  {
    story: "Feedback/Spinning",
    selector: "[data-probe] .lv-boot-spin",
    probe: '<div class="lv-boot-spin"></div>',
    noImage: true,
  },
  {
    story: "Feedback/SkeletonRow",
    selector: "[data-probe] .skel",
    probe: '<div class="skel skel-row"></div>',
    noImage: true,
  },
  {
    story: "Feedback/SkeletonCard",
    selector: "[data-probe] .skel",
    probe: '<div class="skel skel-card"></div>',
    noImage: true,
  },
  {
    story: "Feedback/Empty",
    selector: "[data-probe] .history-empty",
    probe: '<div class="history-empty"><span class="he-ic"></span><strong>x</strong></div>',
    noImage: true,
  },
  {
    story: "Feedback/NoticeOk",
    selector: "[data-probe] .val-summary",
    probe: '<div class="val-summary ok" style="display:block">x</div>',
    noImage: true,
  },
  {
    story: "Feedback/NoticeWarning",
    selector: "[data-probe] .val-summary",
    probe: '<div class="val-summary warn" style="display:block">x</div>',
    noImage: true,
  },
  {
    story: "Feedback/NoticeError",
    selector: "[data-probe] .val-summary",
    probe: '<div class="val-summary err" style="display:block">x</div>',
    noImage: true,
  },
  {
    story: "Feedback/NoticeAccent",
    selector: "[data-probe] .fg-draft",
    probe: '<div class="fg-draft">x</div>',
    noImage: true,
    ignore: ["display"],
  },
  {
    story: "Badge/Inactive",
    selector: "[data-probe] .badge",
    probe: '<span class="badge badge-inactive">x</span>',
    noImage: true,
    ignore: ["display"],
  },
  {
    story: "Badge/Admin",
    selector: "[data-probe] .badge",
    probe: '<span class="badge badge-admin">x</span>',
    noImage: true,
    ignore: ["display"],
  },
  {
    story: "Badge/Advisor",
    selector: "[data-probe] .badge",
    probe: '<span class="badge badge-asesor">x</span>',
    noImage: true,
    ignore: ["display"],
  },
  {
    story: "Badge/Vip",
    selector: "[data-probe] .badge",
    probe: '<span class="badge badge-vip">x</span>',
    noImage: true,
    ignore: ["display"],
  },
  {
    story: "Badge/Pro",
    selector: "[data-probe] .badge",
    probe: '<span class="badge badge-pro">x</span>',
    noImage: true,
    ignore: ["display"],
  },
  {
    story: "Badge/Hunter",
    selector: "[data-probe] .badge",
    probe: '<span class="badge badge-hunter">x</span>',
    noImage: true,
    ignore: ["display"],
  },
  {
    story: "Badge/Leader",
    selector: "[data-probe] .badge",
    probe: '<span class="badge badge-lider">x</span>',
    noImage: true,
    ignore: ["display"],
  },
  {
    story: "Badge/Ending",
    selector: "[data-probe] .promos-badge",
    probe: '<span class="promos-badge b-vence">x</span>',
    noImage: true,
  },
  {
    story: "Badge/Review",
    selector: "[data-probe] .promos-badge",
    probe: '<span class="promos-badge b-revisar">x</span>',
    noImage: true,
  },
  {
    story: "Badge/NotFound",
    selector: "[data-probe] .promos-badge",
    probe: '<span class="promos-badge b-no">x</span>',
    noImage: true,
  },
  {
    story: "Badge/Outside",
    selector: "[data-probe] .promos-badge",
    probe: '<span class="promos-badge b-fuera">x</span>',
    noImage: true,
  },
  {
    story: "Badge/Soon",
    selector: "[data-probe] .promos-badge",
    probe: '<span class="promos-badge b-proxima">x</span>',
    noImage: true,
  },
];

/** Custom properties of the old app that have another name here. */
export const RENAMED_TOKENS: Readonly<Record<string, string>> = {
  "--azul": "--blue",
  "--light": "--paper",
  "--dark": "--ink",
  "--red": "--accent",
};

/** Ones that are not design tokens: each screen of the old app defined its own. */
export const NOT_TOKENS = /^--(?:ges-|ben-|fg-|simbar-)/;
