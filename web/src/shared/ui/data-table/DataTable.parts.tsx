import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import styles from "./DataTable.module.css";

type PartProps = {
  readonly children: ReactNode;
};

type TableProps = PartProps & {
  /** What the table is about, for readers. */
  readonly caption: string;
  /** For a screen that has its own look on a phone. */
  readonly className?: string | undefined;
  readonly scrollClassName?: string | undefined;
};

/** It slides inside its own box when it does not fit: the page never gets wider. */
export function DataTableRoot({ caption, className, scrollClassName, children }: TableProps) {
  return (
    <div className={[styles.scroll, scrollClassName].filter(Boolean).join(" ")}>
      <table className={[styles.table, className].filter(Boolean).join(" ")}>
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

type HeaderProps = PartProps &
  Omit<ThHTMLAttributes<HTMLTableCellElement>, "children"> & {
    /** How it is sorted now. Given together with onSort, the header can be pressed. */
    readonly sort?: SortDirection;
    readonly onSort?: () => void;
  };

const SORT_MARKS: Readonly<Record<SortDirection, string>> = {
  ascending: "\u25B2",
  descending: "\u25BC",
  none: "\u2195",
};

export function DataTableHeader({
  sort = "none",
  onSort,
  className,
  children,
  ...rest
}: HeaderProps) {
  if (!onSort) {
    return (
      <th {...rest} scope="col" className={[styles.header, className].filter(Boolean).join(" ")}>
        {children}
      </th>
    );
  }
  return (
    <th
      {...rest}
      scope="col"
      className={[styles.header, styles.sortable, className].filter(Boolean).join(" ")}
      aria-sort={sort}
    >
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
  readonly className?: string | undefined;
};

export function DataTableRow({
  selected = false,
  excluded = false,
  className,
  children,
}: RowProps) {
  const classes = [selected && styles.selected, excluded && styles.excluded, className];
  return (
    <tr
      className={classes.filter(Boolean).join(" ") || undefined}
      aria-selected={selected || undefined}
    >
      {children}
    </tr>
  );
}

type CellProps = PartProps & Omit<TdHTMLAttributes<HTMLTableCellElement>, "children">;

export function DataTableCell({ className, children, ...rest }: CellProps) {
  return (
    <td {...rest} className={[styles.cell, className].filter(Boolean).join(" ")}>
      {children}
    </td>
  );
}
