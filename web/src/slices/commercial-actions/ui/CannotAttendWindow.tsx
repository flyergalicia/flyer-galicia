// "No puedo ir": the hunter warns, and the action stays on their agenda until it is passed on.
import { useState } from "react";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { Button } from "@/shared/ui/index.ts";
import { reportCannotAttend } from "../api/actions.ts";
import type { ActionRow } from "../api/rows.ts";
import { failureText } from "../model/failure-text.ts";
import { dateLabel, timeRange } from "../model/formatting.ts";
import { nameOf, type Who } from "../model/who.ts";
import { ActionWindow } from "./ActionWindow.tsx";
import { Optional } from "./form-parts.tsx";
import styles from "./CommercialActions.module.css";

interface CannotAttendWindowProps {
  readonly who: Who;
  readonly action: ActionRow;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}

export function CannotAttendWindow({ who, action, onClose, onSaved }: CannotAttendWindowProps) {
  const backend = useBackend();
  const { show } = useToast();
  const [reason, setReason] = useState("");
  const [isSaving, setSaving] = useState(false);
  const leader = who.people[action.hunter_id ?? ""]?.lider_id;
  const time = timeRange(action);
  const confirm = async () => {
    setSaving(true);
    try {
      await reportCannotAttend(backend, action.id, reason.trim() || null);
      onClose();
      show("Listo: les avisamos. Sigue en tu agenda hasta que la pasen a otro hunter.");
      onSaved();
    } catch (cause) {
      setSaving(false);
      show(`No se pudo avisar: ${failureText(cause)}`);
    }
  };
  return (
    <ActionWindow
      title="No puedo ir"
      subtitle={`${action.empresa} · ${dateLabel(action.fecha)}${time ? ` ${time}` : ""}`}
      onClose={onClose}
    >
      <div className={styles.info}>
        Le avisamos a <b>{nameOf(who, action.creada_por)}</b>
        {leader && leader !== action.creada_por && (
          <>
            {" y a "}
            <b>{nameOf(who, leader)}</b>
          </>
        )}
        {" para que se la pasen a otro hunter. Mientras tanto sigue en tu agenda."}
      </div>
      <div className={styles.form}>
        <label className={`${styles.full} ${styles.formField}`}>
          <span>
            ¿Por qué? <Optional />
          </span>
          <textarea
            className={styles.input}
            rows={2}
            maxLength={500}
            data-testid="cannot-attend-reason"
            placeholder="Tengo otra visita, estoy de licencia…"
            value={reason}
            onChange={({ target }) => {
              setReason(target.value);
            }}
          />
        </label>
      </div>
      <div className={styles.windowFoot}>
        <Button variant="ghost" data-testid="window-dismiss" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          data-testid="confirm-cannot-attend"
          disabled={isSaving}
          onClick={() => void confirm()}
        >
          {isSaving ? "Avisando…" : "Avisar"}
        </Button>
      </div>
    </ActionWindow>
  );
}
