import type { ReactNode } from "react";
import { Button } from "@/shared/ui/index.ts";
import styles from "./Panel.module.css";

/** A box of filters: each one with its label, and Buscar / ✕ at the end when they apply on demand. */
export function LogFilters({
  children,
  onSearch,
  onClear,
  searchLabel = "Buscar",
}: {
  readonly children: ReactNode;
  readonly onSearch: () => void;
  readonly onClear?: () => void;
  readonly searchLabel?: string;
}) {
  return (
    <div className={styles.filters} data-testid="log-filters">
      {children}
      <div className={styles.filterButtons}>
        <Button size="sm" className={styles.search} onClick={onSearch}>
          {searchLabel}
        </Button>
        {onClear && (
          <Button
            variant="ghost"
            size="sm"
            className={styles.clear}
            aria-label="Limpiar filtros"
            onClick={onClear}
          >
            ✕
          </Button>
        )}
      </div>
    </div>
  );
}

export function FilterField({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <label className={styles.filter}>
      <span>{label}</span>
      {children}
    </label>
  );
}
