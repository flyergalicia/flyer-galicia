import type { ReactNode } from "react";
import styles from "./DataTable.module.css";

type PartProps = {
  readonly children: ReactNode;
};

type TableProps = PartProps & {
  /** What the table is about, for readers. */
  readonly caption: string;
};

/** It slides inside its own box when it does not fit: the page never gets wider. */
export function DataTableRoot({ caption, children }: TableProps) {
  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <caption className={styles.caption}>{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export function DataTableHead({ children }: PartProps) {
  return <thead>{children}</thead>;
}

export function DataTableBody({ children }: PartProps) {
  return <tbody>{children}</tbody>;
}

export type SortDirection = "ascending" | "descending" | "none";

type HeaderProps = PartProps & {
  /** How it is sorted now. Given together with onSort, the header can be pressed. */
  readonly sort?: SortDirection;
  readonly onSort?: () => void;
};

const SORT_MARKS: Readonly<Record<SortDirection, string>> = {
  ascending: "\u25B2",
  descending: "\u25BC",
  none: "\u2195",
};

export function DataTableHeader({ sort = "none", onSort, children }: HeaderProps) {
  if (!onSort) {
    return (
      <th scope="col" className={styles.header}>
        {children}
      </th>
    );
  }
  return (
    <th scope="col" className={`${styles.header} ${styles.sortable}`} aria-sort={sort}>
      <button type="button" className={styles.sortButton} onClick={onSort}>
        {children}{" "}
        <span className={sort === "none" ? `${styles.mark} ${styles.markOff}` : styles.mark}>
          {SORT_MARKS[sort]}
        </span>
      </button>
    </th>
  );
}

type RowProps = PartProps & {
  readonly selected?: boolean;
  /** It stays in the list, faded. */
  readonly excluded?: boolean;
};

export function DataTableRow({ selected = false, excluded = false, children }: RowProps) {
  const classes = [selected && styles.selected, excluded && styles.excluded];
  return (
    <tr
      className={classes.filter(Boolean).join(" ") || undefined}
      aria-selected={selected || undefined}
    >
      {children}
    </tr>
  );
}

export function DataTableCell({ children }: PartProps) {
  return <td className={styles.cell}>{children}</td>;
}
