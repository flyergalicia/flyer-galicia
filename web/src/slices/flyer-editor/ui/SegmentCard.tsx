import { useMemo, useState, useSyncExternalStore } from "react";
import { destinationOf } from "@/shared/domain/company-registry/index.ts";
import { optionLabel } from "@/shared/domain/flyer-options.ts";
import { safeFileName } from "@/shared/flyer-engine/index.ts";
import { useFlyerOptions } from "@/shared/lib/app-config/flyer-options-query.ts";
import {
  type CompanyBatch,
  useFlyerWorkspace,
  useWorkspaceValue,
} from "@/shared/lib/flyer-workspace/index.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { usePermissions } from "@/shared/session/index.ts";
import { Button, ProgressBar, SectionLabel } from "@/shared/ui/index.ts";
import { useCompanies } from "@/slices/company-registry/index.ts";
import { useFlyerRules } from "../model/use-flyer-rules.ts";
import type { BulkProgress } from "../model/use-bulk-generation.ts";
import styles from "./BulkPanel.module.css";

interface SegmentCardProps {
  readonly companyBatch: CompanyBatch;
  readonly onOpenDatabase: () => void;
}

function howMany(count: number): string {
  return `${String(count)} empresa${count === 1 ? "" : "s"}`;
}

function Segment({ companyBatch, onOpenDatabase }: SegmentCardProps) {
  const workspace = useFlyerWorkspace();
  const { show } = useToast();
  const { rows, loading, failed, reload } = useCompanies();
  const rules = useFlyerRules();
  const { options } = useFlyerOptions();
  const option = useWorkspaceValue(({ slot }) => slot.option);
  const isRunning = useSyncExternalStore(workspace.batch.subscribe, workspace.batch.isRunning);
  const [progress, setProgress] = useState<BulkProgress | null>(null);
  const companies = useMemo(
    () => rows.filter((company) => destinationOf(company, rules) === option),
    [option, rows, rules],
  );
  const label = optionLabel(options, option);
  const count = companies.length;
  const generate = () => {
    if (count === 0) {
      show("No tenés empresas de este segmento");
      return;
    }
    void companyBatch.generate({
      companies,
      format: "pdf",
      onProgress: setProgress,
      zipBase: `Flyers_${safeFileName(label)}`,
    });
  };
  const flyers = count === 0 ? "todos" : `${String(count)} flyer${count === 1 ? "" : "s"}`;
  return (
    <div data-testid="segment-card">
      <div className={styles.segmentLabel}>
        <SectionLabel>Desde mis empresas</SectionLabel>
      </div>
      <div className={styles.segment} data-testid="segment-box">
        <strong className={styles.segmentTitle}>Todo el segmento «{label}»</strong>
        {failed && rows.length === 0 ? (
          <div className={styles.segmentText}>
            <p>No se pudo conectar para traer tus empresas.</p>
            <Button variant="soft-neutral" size="xs" onClick={() => void reload()}>
              ↻ Reintentar
            </Button>
          </div>
        ) : (
          !loading && (
            <p className={styles.segmentText} data-testid="segment-text">
              {count > 0 ? (
                <>
                  Genera de una el flyer de las <strong>{howMany(count)}</strong> de tu base que
                  salen con este formato, con sus oficiales, cashback y topes, en un ZIP.
                </>
              ) : (
                "Ninguna de tus empresas sale con este formato todavía."
              )}
            </p>
          )
        )}
        <Button
          variant="green"
          fullWidth
          data-testid="segment-generate"
          disabled={count === 0 || isRunning}
          onClick={generate}
        >
          ⚡ Descargar {flyers} de «{label}»
        </Button>
        {progress && (
          <div className={styles.segmentProgress}>
            <ProgressBar value={progress.percent} label={progress.text} />
            <div className={styles.progressText} data-testid="segment-progress">
              {progress.text}
            </div>
          </div>
        )}
        <p className={styles.segmentFoot}>
          ¿Querés bajar <b>todas tus empresas</b>, cada una en su formato? Andá a{" "}
          <button type="button" className={styles.segmentLink} onClick={onOpenDatabase}>
            Base de datos → Generar flyers
          </button>
          .
        </p>
      </div>
    </div>
  );
}

/** Every company of the list that comes out on the flyer on screen, from one button. */
export function SegmentCard(props: SegmentCardProps) {
  const { can } = usePermissions();
  return can("padron_buscar") ? <Segment {...props} /> : null;
}
