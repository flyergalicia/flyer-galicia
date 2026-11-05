import { relativeDate } from "@/shared/domain/relative-date.ts";
import { DecisionDialog } from "@/shared/ui/decision-dialog/DecisionDialog.ts";
import { ConfirmDialog } from "@/shared/ui/index.ts";
import { batchObservations, type CompanyBatchReport, namesText } from "./company-batch.ts";
import styles from "./CompanyBatchDialogs.module.css";

/** The last stop before generating: with 180 flyers, finding a mistake afterwards is doing it all. */
export function CompanyBatchQuestion({
  text,
  onAnswer,
}: {
  readonly text: string;
  readonly onAnswer: (goAhead: boolean) => void;
}) {
  return (
    <ConfirmDialog
      title="Revisá antes de generar"
      confirmLabel="Generar"
      cancelLabel="Volver"
      onConfirm={() => {
        onAnswer(true);
      }}
      onCancel={() => {
        onAnswer(false);
      }}
    >
      {text}
    </ConfirmDialog>
  );
}

export function CompanyBatchReportDialog({
  report,
  onClose,
}: {
  readonly report: CompanyBatchReport;
  readonly onClose: () => void;
}) {
  const { total, format, zipName, date, perOption } = report;
  const observations = batchObservations(report);
  return (
    <DecisionDialog title={total > 0 ? "✓ Flyers generados" : "No se generó ningún flyer"}>
      <DecisionDialog.Text>
        <strong>
          {total} flyer{total === 1 ? "" : "s"}
        </strong>{" "}
        en {format.toUpperCase()} · {zipName} · {relativeDate(date.toISOString())}
      </DecisionDialog.Text>
      <table className={styles.table}>
        <thead>
          <tr className={styles.head}>
            <th className={styles.format}>Formato</th>
            <th className={styles.count}>Cantidad</th>
            <th className={styles.folderHead}>Carpeta</th>
          </tr>
        </thead>
        <tbody>
          {perOption.map(({ label, count, folder }) => (
            <tr key={label}>
              <td>{label}</td>
              <td className={styles.count}>
                <strong>{count}</strong>
              </td>
              <td className={styles.folder}>{folder}/</td>
            </tr>
          ))}
        </tbody>
      </table>
      {observations.length > 0 ? (
        <>
          <DecisionDialog.Text separated>
            <strong>Observaciones</strong>
          </DecisionDialog.Text>
          <DecisionDialog.List>
            {observations.map(({ text, names }) => (
              <DecisionDialog.Item key={text}>
                <strong>{names.length}</strong> {text}: {namesText(names)}
              </DecisionDialog.Item>
            ))}
          </DecisionDialog.List>
        </>
      ) : (
        <DecisionDialog.Text>
          Sin observaciones: todas las empresas tenían oficiales, cashback y topes.
        </DecisionDialog.Text>
      )}
      {total > 0 && (
        <DecisionDialog.Hint>
          El mismo resumen va dentro del ZIP como Resumen.txt.
        </DecisionDialog.Hint>
      )}
      <DecisionDialog.Foot>
        <DecisionDialog.Yes onClick={onClose}>Cerrar</DecisionDialog.Yes>
      </DecisionDialog.Foot>
    </DecisionDialog>
  );
}
