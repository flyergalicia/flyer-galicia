import styles from "./feedback.module.css";

/** Where a list will be, while it arrives. "row" and "card" have the height of the real ones. */
export function Skeleton({ shape = "row" }: { readonly shape?: "row" | "card" }) {
  const size = shape === "row" ? styles.skeletonRow : styles.skeletonCard;
  return <div aria-hidden="true" className={`${styles.skeleton} ${size}`} />;
}
