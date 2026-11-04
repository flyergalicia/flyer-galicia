import { initialsOf } from "@/shared/domain/initials.ts";
import { roleLabel, roleTone, useSessionActions } from "@/shared/session/index.ts";
import { Badge, Menu, PalettePicker, useTheme, useThemeActions } from "@/shared/ui/index.ts";
import { AccountSwitcher, TestProfilePicker, useAccountSwitch } from "@/slices/auth/index.ts";
import type { MenuRules } from "../registry/view-rules.ts";
import { MENU_WINDOWS_ABOVE, MENU_WINDOWS_BELOW, type MenuWindow } from "../registry/views.ts";
import styles from "./AppHeader.module.css";

interface UserMenuProps {
  readonly name: string;
  readonly role: string;
  readonly isTestAccount: boolean;
  readonly rules: MenuRules;
  /** How many things are waiting for this person, and what they are. */
  readonly notice: { readonly count: number; readonly hint: string };
  readonly onOpenWindow: (window: MenuWindow) => void;
}

function WindowItems({
  windows,
  rules,
  onOpenWindow,
}: Pick<UserMenuProps, "rules" | "onOpenWindow"> & { readonly windows: readonly MenuWindow[] }) {
  return windows
    .filter(({ visible }) => visible(rules))
    .map((window) => (
      <Menu.Item
        key={window.id}
        icon={window.icon}
        count={window.noticeSource ? rules.waiting(window.noticeSource) : 0}
        onSelect={() => {
          onOpenWindow(window);
        }}
      >
        {window.label}
      </Menu.Item>
    ));
}

function ThemeItem() {
  const { dark } = useTheme();
  const { toggleDark } = useThemeActions();
  return (
    <Menu.Item icon={dark ? "sun" : "moon"} keepOpen onSelect={toggleDark}>
      {dark ? "Modo claro" : "Modo oscuro"}
    </Menu.Item>
  );
}

/** The menu of the name: one's own account, the look and leaving. */
export function UserMenu({
  name,
  role,
  isTestAccount,
  rules,
  notice,
  onOpenWindow,
}: UserMenuProps) {
  const { signOut } = useSessionActions();
  const accountSwitch = useAccountSwitch();
  return (
    <Menu>
      <Menu.Trigger label={`Menú de ${name}`} className={styles.userButton} title={notice.hint}>
        <span className={styles.avatar} aria-hidden="true">
          {initialsOf(name)}
        </span>
        {notice.count > 0 && (
          <span className={styles.userNotice} data-testid="header-notice">
            {notice.count > 9 ? "9+" : notice.count}
          </span>
        )}
        <span className={styles.userName}>{name}</span>
        <svg className={styles.caret} viewBox="0 0 10 10" aria-hidden="true">
          <path d="M0 2h10L5 10z" />
        </svg>
      </Menu.Trigger>
      <Menu.List label="Tu cuenta">
        <Menu.Head name={name}>
          <Badge tone={roleTone(role)} uppercase>
            {roleLabel(role)}
          </Badge>
        </Menu.Head>
        <Menu.Separator />
        <WindowItems windows={MENU_WINDOWS_ABOVE} rules={rules} onOpenWindow={onOpenWindow} />
        <ThemeItem />
        <Menu.Label>Tema</Menu.Label>
        <PalettePicker />
        <WindowItems windows={MENU_WINDOWS_BELOW} rules={rules} onOpenWindow={onOpenWindow} />
        <AccountSwitcher {...accountSwitch} />
        {isTestAccount && <TestProfilePicker currentRole={role} />}
        <Menu.Separator />
        <Menu.Item
          icon="logout"
          danger
          onSelect={() => {
            void signOut();
          }}
        >
          Salir
        </Menu.Item>
      </Menu.List>
    </Menu>
  );
}
