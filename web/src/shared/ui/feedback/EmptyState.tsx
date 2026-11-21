import type { ReactNode } from "react";
import { Icon, type IconName } from "../icon/Icon.tsx";
import styles from "./feedback.module.css";

type EmptyStateProps = {
  readonly icon: IconName;
  readonly title: string;
  /** More explanation, or the button that gets out of it. */
  readonly children?: ReactNode;
};

export function EmptyState({ icon, title, children }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      <span className={styles.emptyIcon}>
        <Icon name={icon} size={20} />
      </span>
      <strong className={styles.emptyTitle}>{title}</strong>
      {children}
    </div>
  );
}
