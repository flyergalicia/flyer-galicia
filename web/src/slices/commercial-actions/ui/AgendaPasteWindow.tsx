// "Pegar desde Excel": one row per position, reviewed against the database before anything is added.
// Nothing is saved until the button; what has a problem is told why and is left out.
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { Button } from "@/shared/ui/index.ts";
import { insertPastedActions } from "../api/agenda.ts";
import { type PastedLine, pastedRow, readyLines, summaryOf } from "../model/agenda-paste.ts";
import { failureText } from "../model/failure-text.ts";
import { dateLabel, timeRange } from "../model/formatting.ts";
import { invalidateActionList } from "../model/use-actions-data.ts";
import { usePasteReview } from "../model/use-paste-review.ts";
import { nameOf, type Who } from "../model/who.ts";
import { ActionWindow } from "./ActionWindow.tsx";
import { Chip } from "./parts.tsx";
import base from "./CommercialActions.module.css";
import styles from "./Agenda.module.css";

const ROWS_SHOWN = 60;
const PLACEHOLDER = "21/10\t10 a 12\tACME SA\tSofía\tPiso 3";

function Status({ line }: { readonly line: PastedLine }) {
  if (!line.ok) return <Chip tone="bad">{line.problem}</Chip>;
  return line.warning ? <Chip tone="warn">{line.warning}</Chip> : <Chip tone="ok">Lista</Chip>;
}

function Review({
  who,
  lines,
  onTryAgain,
}: {
  readonly who: Who;
  readonly lines: readonly PastedLine[];
  readonly onTryAgain: () => void;
}) {
  const { ready, overlapping, withProblems, canTryAgain } = summaryOf(lines);
  return (
    <>
      <div className={base.pasteResult} data-testid="agenda-paste-summary">
        <Chip tone="ok">{ready} listas</Chip>
        {overlapping > 0 && (
          <Chip tone="warn">{overlapping} se pisan con otra (se agregan igual)</Chip>
        )}
        {withProblems > 0 && <Chip tone="bad">{withProblems} con problemas (no se agregan)</Chip>}
        {canTryAgain && (
          <button type="button" className={base.link} onClick={onTryAgain}>
            Probar de nuevo
          </button>
        )}
      </div>
      <div className={base.tableBox}>
        <table className={base.table}>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Horario</th>
              <th>Empresa</th>
              <th>Hunter</th>
              <th>Lugar</th>
              <th aria-label="Estado" />
            </tr>
          </thead>
          <tbody>
            {lines.slice(0, ROWS_SHOWN).map((line, index) => (
              // The same line can come twice: the position is what tells them apart.
              <tr key={`${String(index)}${line.companyText}`} data-testid="agenda-paste-row">
                <td className={base.digits}>{line.fecha ? dateLabel(line.fecha) : "—"}</td>
                <td className={base.digits}>{timeRange(line) || "—"}</td>
                <td>{line.empresa ?? (line.companyText || "—")}</td>
                <td>{line.hunter_id ? nameOf(who, line.hunter_id) : "—"}</td>
                <td>{line.lugar ?? ""}</td>
                <td>
                  <Status line={line} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {lines.length > ROWS_SHOWN && (
        <p className={base.note}>
          Se muestran las primeras {ROWS_SHOWN} de {lines.length}.
        </p>
      )}
    </>
  );
}

function addText(isAdding: boolean, ready: number): string {
  if (isAdding) return "Agregando…";
  return ready > 0 ? `Agregar ${String(ready)} a la agenda` : "Agregar a la agenda";
}

export function AgendaPasteWindow({
  who,
  onClose,
  onAdded,
}: {
  readonly who: Who;
  readonly onClose: () => void;
  /** Added: it goes to the first date. */
  readonly onAdded: (firstDate: string) => void;
}) {
  const backend = useBackend();
  const queryClient = useQueryClient();
  const { show } = useToast();
  const review = usePasteReview(who);
  const [isAdding, setAdding] = useState(false);
  const { lines } = review;
  const ready = review.isWaiting || review.isReviewing ? [] : readyLines(lines ?? []);

  const add = async () => {
    setAdding(true);
    try {
      const saved = await insertPastedActions(backend, ready.map(pastedRow));
      const count = saved.length;
      const [first = ""] = ready.map(({ fecha }) => fecha ?? "").toSorted();
      invalidateActionList(queryClient);
      onClose();
      onAdded(first);
      show(
        `${String(count)}${count === 1 ? " posición agregada" : " posiciones agregadas"} a la agenda.`,
      );
    } catch (cause) {
      show(`No se pudo agregar: ${failureText(cause)}`);
    } finally {
      setAdding(false);
    }
  };

  return (
    <ActionWindow
      isWide
      title="Pegar la agenda desde Excel"
      subtitle={
        <>
          Una fila por posición, con las columnas en cualquier orden: <b>fecha</b> (21/10),{" "}
          <b>horario</b> (10 a 12), <b>empresa</b>, <b>hunter</b> y, si querés, el <b>lugar</b>.
          Quedan planificadas como posición comercial (salvo que la fila diga Acción o Feria). Las
          que se pisan con otra cosa del hunter no se agregan
          {who.role === "lider" || who.isAdmin
            ? " (como líder, las de tu equipo sí, con aviso)"
            : ""}
          .
        </>
      }
      onClose={onClose}
    >
      <textarea
        className={`${base.input} ${base.peopleText}`}
        rows={6}
        data-testid="agenda-paste-text"
        placeholder={PLACEHOLDER}
        value={review.text}
        onChange={({ target }) => {
          review.setText(target.value);
        }}
      />
      <div className={styles.pastePreview} data-testid="agenda-paste-preview">
        {review.isReviewing && <span className={base.mini}>Revisando…</span>}
        {!review.isReviewing && lines && (
          <Review who={who} lines={lines} onTryAgain={review.tryAgain} />
        )}
      </div>
      <div className={base.windowFoot}>
        <Button variant="ghost" data-testid="window-dismiss" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          data-testid="agenda-paste-add"
          disabled={ready.length === 0 || isAdding}
          onClick={() => void add()}
        >
          {addText(isAdding, ready.length)}
        </Button>
      </div>
    </ActionWindow>
  );
}
