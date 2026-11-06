import { useCashbackConfigs } from "@/shared/lib/app-config/cashback-query.ts";
import { useFlyerHasNoAmounts } from "@/shared/lib/flyer-workspace/index.ts";
import { Card } from "@/shared/ui/index.ts";
import { useFlyerForm, useFormTab, useFormValue } from "../model/form-context.ts";
import { amountOnFlyer, withCashback } from "../model/form-state.ts";
import styles from "./FlyerForm.module.css";

const AMOUNT_ROWS = [
  { label: "Eminent Black", key: "m1", tone: styles.amountBlue },
  { label: "Eminent Platinum", key: "m2", tone: styles.amountBlue },
  { label: "Plus Gold", key: "m3", tone: styles.amountOrange },
  { label: "Plus", key: "m4", tone: styles.amountOrange },
] as const;

const EMPTY_AMOUNT = "—";
const AMOUNT_ON_FLYER = "Es el importe que sale impreso en este flyer";

function ActiveAmounts() {
  const { configs } = useCashbackConfigs();
  const cashback = useFormValue((state) => state.cashback);
  const noCashback = useFormValue((state) => state.noCashback);
  const tab = useFormTab();
  const config = configs[cashback] ?? configs[0];
  const amounts = AMOUNT_ROWS.map(({ key }) => (noCashback ? EMPTY_AMOUNT : (config?.[key] ?? "")));
  const printed = amountOnFlyer(amounts, { noCashback }, tab);
  return (
    <div className={styles.amounts} data-testid="active-amounts">
      <strong className={styles.amountsTitle}>Montos activos</strong>
      {AMOUNT_ROWS.map(({ label, key, tone }, position) => (
        <div
          key={key}
          className={
            position === printed ? `${styles.amountRow} ${styles.amountPrinted}` : styles.amountRow
          }
          title={position === printed ? AMOUNT_ON_FLYER : undefined}
        >
          <span>{label}</span>
          <span className={tone}>{amounts[position]}</span>
        </div>
      ))}
    </div>
  );
}

export function AmountsCard() {
  const form = useFlyerForm();
  const { names } = useCashbackConfigs();
  const cashback = useFormValue((state) => state.cashback);
  const noCashback = useFormValue((state) => state.noCashback);
  const hasNoAmounts = useFlyerHasNoAmounts();
  if (hasNoAmounts) {
    return (
      <Card>
        <Card.Title>Configuración de Montos</Card.Title>
        <div className={styles.noAmounts} data-testid="no-amounts">
          Este flyer no lleva importes de cashback (se quitó esa parte del flyer).
        </div>
      </Card>
    );
  }
  return (
    <Card>
      <Card.Title>Configuración de Montos</Card.Title>
      <div className={styles.cashbackButtons} data-testid="cashback-buttons">
        {names.map((name, position) => (
          <button
            key={name}
            type="button"
            className={styles.cashbackButton}
            aria-pressed={!noCashback && position === cashback}
            data-cashback={name}
            onClick={() => {
              form.update((state) => withCashback(state, position));
            }}
          >
            {name}
          </button>
        ))}
      </div>
      {noCashback && (
        <div className={styles.noCashback} data-testid="no-cashback">
          ⚠ <strong>Sin cashback</strong> — en tu base esta empresa no tiene un cashback válido, así
          que el flyer sale con los importes en blanco. Si en realidad le corresponde uno, elegílo
          acá arriba.
        </div>
      )}
      <ActiveAmounts />
    </Card>
  );
}
