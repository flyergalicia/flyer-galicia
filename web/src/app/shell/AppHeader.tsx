import type { ScreenTitles } from "@/shared/domain/screen-titles.ts";
import { GaliciaLogo } from "@/shared/ui/index.ts";
import type { MenuRules } from "../registry/view-rules.ts";
import type { MenuWindow } from "../registry/views.ts";
import { AdminButton } from "./AdminButton.tsx";
import { HeaderTabs } from "./HeaderTabs.tsx";
import { SearchButton } from "./SearchButton.tsx";
import { useHeaderTabs } from "./use-header-tabs.ts";
import type { HeaderNotice } from "./use-waiting-notices.tsx";
import { UserMenu } from "./UserMenu.tsx";
import styles from "./AppHeader.module.css";

interface AppHeaderProps {
  readonly activeId: string;
  readonly titles: ScreenTitles;
  readonly rules: MenuRules;
  readonly name: string;
  readonly role: string;
  readonly isAdmin: boolean;
  readonly isTestAccount: boolean;
  readonly notice: HeaderNotice;
  readonly onSelectView: (id: string) => void;
  readonly onOpenWindow: (window: MenuWindow) => void;
  readonly onOpenSearch: () => void;
  readonly onOpenAdmin: () => void;
}

export function AppHeader({
  activeId,
  titles,
  rules,
  name,
  role,
  isAdmin,
  isTestAccount,
  notice,
  onSelectView,
  onOpenWindow,
  onOpenSearch,
  onOpenAdmin,
}: AppHeaderProps) {
  const { tabs, container, reorder, rename } = useHeaderTabs({ rules, titles, canEdit: isAdmin });
  return (
    <header className={styles.header}>
      <GaliciaLogo className={styles.logo} />
      <HeaderTabs
        tabs={tabs}
        activeId={activeId}
        canEdit={isAdmin}
        badges={notice.tabBadges}
        container={container}
        reorder={reorder}
        onSelect={onSelectView}
        onRename={rename}
      />
      <div className={styles.right}>
        <SearchButton onOpen={onOpenSearch} />
        <UserMenu
          name={name}
          role={role}
          isTestAccount={isTestAccount}
          rules={rules}
          notice={notice}
          onOpenWindow={onOpenWindow}
        />
        {rules.isAdminNow && <AdminButton onOpen={onOpenAdmin} />}
      </div>
    </header>
  );
}
