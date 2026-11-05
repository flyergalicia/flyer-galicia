// The promotions of MODO valid with any bank: they make no difference, so they are listed apart.
import { useBenchmark } from "../model/benchmark-context.ts";
import { SHARED_SHOWN, sharedLine, sharedPromotions } from "../model/notes.ts";
import styles from "./BenchmarkView.module.css";

export function SharedPromotions() {
  const { data, screen, days } = useBenchmark();
  const shared = sharedPromotions(data.rows, screen.filters, days);
  if (shared.length === 0) return null;
  return (
    <div className={styles.card} data-testid="benchmark-shared">
      <h3>Con MODO y cualquier banco</h3>
      <p className={styles.sub}>
        Estas promos valen pagando con MODO desde cualquier banco, así que no hacen diferencia y no
        cuentan para ver quién gana.
      </p>
      <ul className={styles.list}>
        {shared.slice(0, SHARED_SHOWN).map((row) => (
          <li key={String(row.id)}>
            <b>{row.titulo}</b>
            {sharedLine(row, days.today)}
          </li>
        ))}
      </ul>
      {shared.length > SHARED_SHOWN && (
        <p className={styles.sub}>{`Y ${String(shared.length - SHARED_SHOWN)} más.`}</p>
      )}
    </div>
  );
}
