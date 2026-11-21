import type { ReactNode } from "react";
import { Avatar, ListRow } from "@/shared/ui/index.ts";
import { avatarColor } from "../model/people.ts";
import styles from "./Panel.module.css";

/** A line of the dashboard: who, a detail under it, and what goes on the right. */
export function PersonRow({
  name,
  initials,
  colorOf,
  detail,
  children,
}: {
  readonly name: string;
  readonly initials: string;
  /** What decides the color of the avatar: always the same for the same person. */
  readonly colorOf: string;
  readonly detail: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <ListRow density="compact" data-testid="person-row">
      <Avatar initials={initials} color={avatarColor(colorOf)} size="sm" />
      <div className={styles.recentInfo}>
        <strong>{name}</strong>
        <small>{detail}</small>
      </div>
      {children}
    </ListRow>
  );
}
