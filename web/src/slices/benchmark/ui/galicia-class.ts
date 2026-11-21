// The column of Galicia carries its own background.
import { GALICIA } from "../model/rows.ts";
import styles from "./BenchmarkView.module.css";

export function galiciaClass(bank: string): string | undefined {
  return bank === GALICIA ? styles.galicia : undefined;
}
