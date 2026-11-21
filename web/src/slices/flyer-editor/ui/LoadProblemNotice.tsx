import { optionLabel, type FlyerOption } from "@/shared/domain/flyer-options.ts";
import { useWorkspaceValue } from "@/shared/lib/flyer-workspace/index.ts";
import { usePermissions } from "@/shared/session/index.ts";
import styles from "./FlyerEditorView.module.css";

interface LoadProblemNoticeProps {
  readonly options: readonly FlyerOption[];
  readonly onRetry: () => void;
}

/** Takes the place of a flyer that did not arrive: what is below is another flyer (invariant 23). */
export function LoadProblemNotice({ options, onRetry }: LoadProblemNoticeProps) {
  const { isAdminNow } = usePermissions();
  const failure = useWorkspaceValue((state) => state.slot.failure);
  const option = useWorkspaceValue((state) => state.slot.option);
  if (!failure) return null;
  const label = optionLabel(options, option);
  const isNetwork = failure === "network";
  const title = isNetwork
    ? `No se pudo cargar el flyer «${label}»`
    : `«${label}» todavía no tiene flyer cargado`;
  let next = "Avisale al administrador. ";
  if (isNetwork) next = "Revisá tu conexión y tocá Reintentar. ";
  else if (isAdminNow) next = "Subilo desde Config → Flyers. ";
  return (
    <div className={styles.loadProblem} role="alert" data-testid="flyer-load-problem">
      <div className={styles.loadProblemText}>
        {title}
        <span>{next}Mientras tanto no se puede descargar: saldría con el flyer equivocado.</span>
      </div>
      <button type="button" onClick={onRetry}>
        ↻ Reintentar
      </button>
    </div>
  );
}
