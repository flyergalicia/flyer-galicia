import type { Company } from "@/shared/domain/company-registry/index.ts";
import {
  companyKey,
  flyerLabel,
  flyerOfCompany,
  type HunterFlyerRules,
  officerNames,
} from "../model/company-flyer-rules.ts";
import styles from "./HunterView.module.css";

interface TickedListProps {
  readonly companies: readonly Company[];
  readonly rules: HunterFlyerRules;
  readonly onUntick: (company: Company) => void;
}

/** What is going to come down, to check it before saying yes. */
export function TickedList({ companies, rules, onUntick }: TickedListProps) {
  return (
    <div className={styles.ticked} data-testid="hunter-ticked">
      <div className={styles.tickedHead}>Seleccionadas ({companies.length})</div>
      {companies.map((company) => (
        <div key={companyKey(company)} className={styles.tickedRow} data-testid="hunter-ticked-row">
          <div className={styles.tickedBody}>
            <span className={styles.tickedCompany} data-part="company">
              {company.empresa || "(sin nombre)"}
            </span>
            <span className={styles.tickedDetail}>
              {flyerLabel(flyerOfCompany(company, rules), rules)} · {officerNames(company)}
            </span>
          </div>
          <button
            type="button"
            className={styles.untick}
            title="Quitar de la selección"
            aria-label="Quitar"
            onClick={() => {
              onUntick(company);
            }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
