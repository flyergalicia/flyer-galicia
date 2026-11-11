/** The light palettes of the app; dark mode goes on top of any of them. */
export type Palette = "marfil" | "marino" | "grafito" | "cielo";

export interface Appearance {
  dark: boolean;
  palette: Palette;
}

/** The places the reference screenshots show, for any version of the app. */
export type ReferenceScreen =
  | "login"
  | "flyer-editor"
  | "preview-window"
  | "logo-editor"
  | "logo-strip-window"
  | "promotions-active"
  | "promotions-search"
  | "studio"
  | "database-companies"
  | "database-advisors"
  | "hunter"
  | "commercial-actions-list"
  | "commercial-actions-agenda"
  | "commercial-actions-dashboard"
  | "benchmark-summary"
  | "benchmark-brands"
  | "benchmark-week"
  | "benchmark-merchant"
  | "benchmark-versus"
  | "benchmark-cards"
  | "admin-dashboard"
  | "admin-users"
  | "admin-permissions"
  | "admin-flyer-config"
  | "user-menu"
  | "screen-search";

/** What the reference screenshots need from the app. */
export interface ScreensDriver {
  /** Goes to that place the way a user does and waits until it stops changing. */
  open(screen: ReferenceScreen): Promise<void>;
  /** Scrolls to what that place is for, when it opens below the fold, and waits again. */
  showContent(screen: ReferenceScreen): Promise<void>;
  setAppearance(appearance: Appearance): Promise<void>;
}
