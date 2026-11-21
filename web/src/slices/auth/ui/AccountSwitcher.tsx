import { useId } from "react";
import { initialsOf } from "@/shared/domain/initials.ts";
import { roleLabel } from "@/shared/session/index.ts";
import type { AccountSwitch } from "../api/account-switch.ts";
import styles from "./TestAccountSections.module.css";

/** The other test accounts, in the name menu. Without any, it does not exist. */
export function AccountSwitcher({ accounts, switchTo }: AccountSwitch) {
  const headingId = useId();
  if (accounts.length === 0) return null;
  return (
    <fieldset aria-labelledby={headingId} className={styles.group}>
      <div id={headingId} className={styles.heading}>
        Cambiar de cuenta
      </div>
      <div className={styles.accounts}>
        {accounts.map((account) => (
          <button
            key={account.id}
            type="button"
            className={styles.account}
            title={account.email}
            data-testid="switchable-account"
            onClick={() => {
              switchTo(account);
            }}
          >
            <span className={styles.initials}>{initialsOf(account.name)}</span>
            <span className={styles.name} data-testid="switchable-name">
              {account.name}
            </span>
            <span className={styles.role} data-testid="switchable-profile">
              {roleLabel(account.role)}
            </span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
