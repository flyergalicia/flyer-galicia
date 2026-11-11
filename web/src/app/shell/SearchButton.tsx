import { isApplePlatform } from "@/shared/domain/platform.ts";
import { Icon } from "@/shared/ui/index.ts";
import styles from "./AppHeader.module.css";

const SEARCH_LABEL = "Buscar una pantalla o función";

interface SearchButtonProps {
  readonly onOpen: () => void;
  readonly platform?: string;
}

/** The door to the search of screens. The search slice brings what it opens. */
export function SearchButton({ onOpen, platform = navigator.platform }: SearchButtonProps) {
  const apple = isApplePlatform(platform);
  return (
    <button
      type="button"
      className={styles.searchButton}
      title={SEARCH_LABEL}
      aria-label={SEARCH_LABEL}
      onClick={onOpen}
    >
      <Icon name="search-glass" className={styles.searchIcon} />
      <b>Buscar</b>
      <kbd className={apple ? undefined : styles.searchKeyWords}>{apple ? "⌘K" : "Ctrl K"}</kbd>
    </button>
  );
}
