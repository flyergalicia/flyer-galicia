import { useState } from "react";
import type { ImportDifference, SheetReport } from "@/shared/domain/company-registry/index.ts";
import { richTextOf } from "@/shared/domain/rich-text.ts";
import { DecisionDialog } from "@/shared/ui/decision-dialog/DecisionDialog.ts";
import { RichLine } from "./RichLine.tsx";
import styles from "./DatabaseWindow.module.css";

const LISTED = 10;
const WARN_ABOVE = 0.2;
const FEW_LEAVING = 5;

function Listing({
  title,
  items,
  open,
}: {
  readonly title: string;
  readonly items: readonly string[];
  readonly open: boolean;
}) {
  if (items.length === 0) return null;
  const more = items.length - LISTED;
  return (
    <details className={styles.importDetails} open={open}>
      <summary>
        {title} ({items.length})
      </summary>
      <p>
        {items.slice(0, LISTED).map((item) => (
          <span key={item} className={styles.importLine}>
            {item}
          </span>
        ))}
        {more > 0 && <span className={styles.importLine}>y {more} más</span>}
      </p>
    </details>
  );
}

function DifferenceSummary({ difference }: { readonly difference: ImportDifference }) {
  const { current, incoming, leaving, entering, changing, same } = difference;
  const share = leaving.length / current;
  const warns = share > WARN_ABOVE;
  return (
    <>
      <DecisionDialog.Text>
        Hoy tenés{" "}
        <strong>
          {current} empresa{current === 1 ? "" : "s"}
        </strong>
        . Este Excel trae <strong>{incoming}</strong> y <strong>reemplaza todo</strong> lo que tenés
        guardado:
      </DecisionDialog.Text>
      <div className={styles.differences}>
        <div className={leaving.length > 0 ? styles.leaving : undefined}>
          <b>{leaving.length}</b>se van
        </div>
        <div>
          <b>{entering.length}</b>entran
        </div>
        <div>
          <b>{changing.length}</b>cambian
        </div>
        <div>
          <b>{same}</b>sin cambios
        </div>
      </div>
      {warns && (
        <DecisionDialog.Alert>
          ⚠{" "}
          <strong>
            Se borra{leaving.length > 1 ? "n " : " "}
            {leaving.length} de tus {current} empresas.
          </strong>{" "}
          ¿Es el Excel correcto? Puede ser una copia vieja o una hoja filtrada.
        </DecisionDialog.Alert>
      )}
      <Listing title="Se van" items={leaving} open={warns || leaving.length <= FEW_LEAVING} />
      <Listing title="Entran" items={entering} open={false} />
      <Listing
        title="Cambian"
        items={changing.map(({ empresa, que }) => `${empresa} — ${que.join(", ")}`)}
        open={false}
      />
    </>
  );
}

function titleOf(report: SheetReport, hasDifference: boolean): string {
  if (report.serious > 0) return "⚠ Revisá el Excel";
  return hasDifference ? "📂 Antes de reemplazar tus empresas" : "ℹ Informe de la carga";
}

interface ImportSummaryDialogProps {
  readonly report: SheetReport;
  readonly difference: ImportDifference;
  readonly onReplace: () => Promise<void>;
  readonly onCancel: () => void;
}

/** What a sheet would change, before touching anything: only its buttons close it. */
export function ImportSummaryDialog({
  report,
  difference,
  onReplace,
  onCancel,
}: ImportSummaryDialogProps) {
  const [saving, setSaving] = useState(false);
  const hasDifference = difference.current > 0;
  const { rows, problems, serious } = report;
  const hasProblems = problems.length > 0;
  return (
    <DecisionDialog title={titleOf(report, hasDifference)}>
      {hasDifference && <DifferenceSummary difference={difference} />}
      {hasProblems && (
        <>
          <DecisionDialog.Text separated={hasDifference}>
            {hasDifference ? "Además, leí " : "Leí "}
            <strong>
              {rows.length} empresa{rows.length === 1 ? "" : "s"}
            </strong>
            {serious > 0
              ? ", pero hay cosas que conviene corregir antes de guardar:"
              : ", con estas observaciones:"}
          </DecisionDialog.Text>
          <DecisionDialog.List>
            {problems.map(({ text }) => (
              <DecisionDialog.Item key={richTextOf(text)}>
                <RichLine text={text} />
              </DecisionDialog.Item>
            ))}
          </DecisionDialog.List>
        </>
      )}
      <DecisionDialog.Text separated={!hasProblems}>
        Si cancelás, tus empresas quedan como estaban
        {hasProblems ? " y podés corregir el Excel y volver a subirlo" : ""}.
      </DecisionDialog.Text>
      <DecisionDialog.Foot>
        <DecisionDialog.No onClick={onCancel}>Cancelar</DecisionDialog.No>
        <DecisionDialog.Yes
          disabled={saving}
          onClick={() => {
            setSaving(true);
            void onReplace();
          }}
        >
          {saving
            ? "Guardando..."
            : `${hasDifference ? "Reemplazar" : "Guardar igual"} (${String(rows.length)})`}
        </DecisionDialog.Yes>
      </DecisionDialog.Foot>
    </DecisionDialog>
  );
}
