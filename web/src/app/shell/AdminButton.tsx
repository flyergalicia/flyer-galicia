import { usePendingAccounts } from "@/shared/lib/app-config/pending-accounts-query.ts";
import styles from "./AppHeader.module.css";

/** The door to the panel, with how many accounts are waiting. The admin slice opens the panel. */
export function AdminButton({ onOpen }: { readonly onOpen: () => void }) {
  const pending = usePendingAccounts();
  return (
    <button type="button" className={styles.adminButton} onClick={onOpen}>
      ⚙ Admin
      {pending > 0 && <span className={styles.adminCount}>{pending}</span>}
    </button>
  );
}
