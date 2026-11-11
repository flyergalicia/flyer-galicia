import styles from "./feedback.module.css";

export function Spinner({ label }: { readonly label: string }) {
  return <output aria-label={label} className={styles.spinner} />;
}
