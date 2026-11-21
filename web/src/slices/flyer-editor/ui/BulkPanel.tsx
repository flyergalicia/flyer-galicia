import { type DragEvent, useRef, useState } from "react";
import type { RichText } from "@/shared/domain/rich-text.ts";
import { Button, Icon, ProgressBar } from "@/shared/ui/index.ts";
import { useWorkspaceValue, type CompanyBatch } from "@/shared/lib/flyer-workspace/index.ts";
import { optionLabel } from "@/shared/domain/flyer-options.ts";
import { useFlyerOptions } from "@/shared/lib/app-config/flyer-options-query.ts";
import { RichLine } from "@/slices/company-registry/index.ts";
import { useFormTab } from "../model/form-context.ts";
import type { BulkReport } from "../model/bulk-sheet.ts";
import {
  type BulkGenerationOptions,
  type BulkProgress,
  useBulkGeneration,
} from "../model/use-bulk-generation.ts";
import { SegmentCard } from "./SegmentCard.tsx";
import styles from "./BulkPanel.module.css";

const SECOND_CAP_MARKER = "{importe2}";
const FIRST_CAP_LABEL = "Tope de reintegro mensual";
const SECOND_CAP_LABEL = "Segundo tope (si es distinto)";
const SEVERITY_MARK = { error: "✗", warning: "⚠", ok: "✓" } as const;

/** The lines of what was read never move, and two of them can say the same. */
function withKeys<Line>(lines: readonly Line[]) {
  return lines.map((line, position) => ({ line, key: String(position) }));
}

function Validation({ report }: { readonly report: BulkReport }) {
  const { severity, lines } = report;
  return (
    <div className={styles.validation} data-testid="batch-validation" data-severity={severity}>
      {SEVERITY_MARK[severity]}{" "}
      {withKeys<RichText>(lines).map(({ line, key }) => (
        <div key={key} className={styles.validationLine}>
          <RichLine text={line} />
        </div>
      ))}
    </div>
  );
}

function Preview({ report }: { readonly report: BulkReport }) {
  const { columns, preview, notShown } = report;
  return (
    <div className={styles.preview}>
      <table data-testid="batch-preview">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {withKeys(preview).map(({ line, key }) => (
            <tr key={key}>
              {withKeys(columns).map(({ line: column, key: place }) => (
                <td key={column}>{line[Number(place)]}</td>
              ))}
            </tr>
          ))}
          {notShown > 0 && (
            <tr>
              <td colSpan={columns.length} className={styles.more}>
                ...y {notShown} más
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Progress({ progress }: { readonly progress: BulkProgress | null }) {
  return (
    <>
      {progress && <ProgressBar value={progress.percent} label={progress.text} />}
      <div className={styles.progressText} data-testid="batch-progress">
        {progress?.text}
      </div>
    </>
  );
}

/** In Rubros: which columns fill the sign of this flyer. */
function SignHint() {
  const benefit = useWorkspaceValue(({ slot: { scene } }) => scene?.calibration.benef);
  const option = useWorkspaceValue(({ slot }) => slot.option);
  const { options } = useFlyerOptions();
  const usesSecond = benefit?.lineas.some(({ t }) => t.includes(SECOND_CAP_MARKER)) ?? false;
  return (
    <div className={styles.signHint} data-testid="batch-sign-hint">
      <b>Columnas del cartel en {optionLabel(options, option)}:</b> <code>beneficio</code> = nombre
      en «¡Beneficio exclusivo …!» (vacío = la empresa, <code>-</code> = sin nombre) ·{" "}
      <code>importe</code> = <b>{benefit?.campos.importe ?? FIRST_CAP_LABEL}</b>
      {usesSecond && (
        <>
          {" "}
          · <code>importe2</code> = <b>{benefit?.campos.importe2 ?? SECOND_CAP_LABEL}</b> (vacío =
          igual al otro)
        </>
      )}
      . Sin importe en la fila se usa el del formulario.
    </div>
  );
}

interface BulkPanelProps extends Pick<BulkGenerationOptions, "goTo" | "goBack"> {
  readonly companyBatch: CompanyBatch;
  readonly onOpenDatabase: () => void;
}

/** Upload a sheet and download every flyer in a ZIP. */
export function BulkPanel({ goTo, goBack, companyBatch, onOpenDatabase }: BulkPanelProps) {
  const benefit = useWorkspaceValue(({ slot: { scene } }) => scene?.calibration.benef);
  const bulk = useBulkGeneration({
    goTo,
    goBack,
    sign: () => ({
      firstCapLabel: benefit?.campos.importe ?? FIRST_CAP_LABEL,
      secondCapLabel: benefit?.campos.importe2 ?? SECOND_CAP_LABEL,
      usesSecondCap: benefit?.lineas.some(({ t }) => t.includes(SECOND_CAP_MARKER)) ?? false,
    }),
  });
  const { rows, report, progress, generating } = bulk;
  const tab = useFormTab();
  const input = useRef<HTMLInputElement>(null);
  const [isOver, setIsOver] = useState(false);
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setIsOver(false);
    const file = event.dataTransfer.files[0];
    if (file) bulk.chooseFile(file);
  };
  return (
    <div data-testid="bulk-panel">
      <p className={styles.lead}>
        Cargá tu Excel y generá todos los PDFs en un ZIP. El texto legal se toma del campo de la
        pestaña Individual.
      </p>
      <button
        type="button"
        className={styles.template}
        data-testid="batch-template"
        onClick={bulk.downloadTemplate}
      >
        <Icon name="download" className={styles.icon} /> Descargar plantilla Excel
      </button>
      {tab === "rubros" && <SignHint />}
      <button
        type="button"
        className={styles.drop}
        data-over={isOver}
        data-testid="batch-drop"
        onClick={() => input.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setIsOver(true);
        }}
        onDragLeave={() => {
          setIsOver(false);
        }}
        onDrop={onDrop}
      >
        <span className={styles.dropIcon} aria-hidden="true">
          📊
        </span>
        <span className={styles.dropText}>
          <strong>Click o arrastrá</strong> tu Excel aquí
        </span>
        <span className={styles.dropKinds}>.xlsx o .xls</span>
      </button>
      <input
        ref={input}
        type="file"
        accept=".xlsx,.xls"
        hidden
        aria-label="Tu Excel"
        data-testid="batch-file"
        onChange={({ target }) => {
          const file = target.files?.[0];
          // Choosing the same sheet again, already corrected, has to do something.
          target.value = "";
          if (file) bulk.chooseFile(file);
        }}
      />
      {report && (
        <div>
          <Validation report={report} />
          <div className={styles.count} data-testid="batch-row-count" data-rows={rows.length}>
            {report.countText}
          </div>
          <Preview report={report} />
          <Progress progress={progress} />
          <div className={styles.buttons}>
            <Button
              variant="green"
              data-testid="batch-generate"
              disabled={!report.canGenerate || generating}
              onClick={() => void bulk.generate()}
            >
              <Icon name="bolt" className={styles.buttonIcon} /> Generar ZIP
            </Button>
            <Button variant="ghost" data-testid="batch-clear" onClick={bulk.clear}>
              <Icon name="close" className={styles.buttonIcon} /> Limpiar
            </Button>
          </div>
        </div>
      )}
      <SegmentCard companyBatch={companyBatch} onOpenDatabase={onOpenDatabase} />
    </div>
  );
}
