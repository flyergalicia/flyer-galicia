// Pieces the tables of Benchmark share.
import { BANKS } from "../model/rows.ts";
import { galiciaClass } from "./galicia-class.ts";
import styles from "./BenchmarkView.module.css";

export function BankHeaders({ first }: { readonly first: string }) {
  return (
    <tr>
      <th>{first}</th>
      {BANKS.map(({ code, name }) => (
        <th key={code} className={galiciaClass(code)}>
          {name}
        </th>
      ))}
    </tr>
  );
}

export function NothingWithFilters({ hint = "" }: { readonly hint?: string }) {
  return (
    <div className={styles.empty}>
      <strong>Sin promos con estos filtros</strong>
      {hint}
    </div>
  );
}
