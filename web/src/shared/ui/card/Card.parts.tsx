import type { ReactNode } from "react";
import styles from "./Card.module.css";

type PartProps = {
  readonly className?: string;
  readonly children: ReactNode;
};

function join(base: string | undefined, className: string | undefined): string {
  return [base, className].filter(Boolean).join(" ");
}

export function CardRoot({ className, children }: PartProps) {
  return <section className={join(styles.card, className)}>{children}</section>;
}

/** The name of the card. Whatever goes beside it, such as a switch, stays on the same line. */
export function CardTitle({ className, children }: PartProps) {
  return <h3 className={join(styles.title, className)}>{children}</h3>;
}

export function CardSubtitle({ className, children }: PartProps) {
  return <h4 className={join(styles.subtitle, className)}>{children}</h4>;
}
