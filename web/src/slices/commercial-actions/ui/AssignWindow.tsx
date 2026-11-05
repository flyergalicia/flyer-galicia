// "Cambiar el hunter" or "Asignar a un hunter": the leader, the administrator and who forwarded it.
import { useState } from "react";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { Button } from "@/shared/ui/index.ts";
import { updateAction } from "../api/actions.ts";
import type { ActionChanges, ActionRow } from "../api/rows.ts";
import { failureText } from "../model/failure-text.ts";
import { timeOf, timeProblem } from "../model/formatting.ts";
import { useOverlapCheck } from "../model/use-overlap-check.ts";
import { useQuestions } from "../model/use-questions.tsx";
import { huntersOf, nameOf, type Who } from "../model/who.ts";
import { ActionWindow } from "./ActionWindow.tsx";
import { Availability } from "./Availability.tsx";
import { HunterOptions, TimesField } from "./form-parts.tsx";
import { TaxId } from "./parts.tsx";
import styles from "./CommercialActions.module.css";

const REASON_END = /[.\s]+$/;

function CannotAttendNotice({ who, action }: { readonly who: Who; readonly action: ActionRow }) {
  if (!action.no_puede_at) return null;
  const reason = action.no_puede_motivo?.replace(REASON_END, "");
  return (
    <div className={styles.notice}>
      <b>{nameOf(who, action.hunter_id)}</b> avisó que no puede{reason ? `: ${reason}` : ""}.
    </div>
  );
}

interface AssignWindowProps {
  readonly who: Who;
  readonly action: ActionRow;
  readonly onClose: () => void;
  /** Saved. Null: the person no longer sees it. */
  readonly onSaved: (action: ActionRow | null) => void;
}

function initialHunter(action: ActionRow, offered: readonly { readonly id: string }[]): string {
  const { hunter_id: hunter } = action;
  if (!hunter) return "";
  return offered.some(({ id }) => id === hunter) ? hunter : (offered[0]?.id ?? "");
}

export function AssignWindow({ who, action, onClose, onSaved }: AssignWindowProps) {
  const backend = useBackend();
  const { show } = useToast();
  const { askYes, dialogs } = useQuestions();
  const check = useOverlapCheck({ who, askYes, canChooseAnother: true });
  const isDataList = action.tipo === "datos";
  const onlyTeam =
    who.role === "lider" &&
    !who.isAdmin &&
    !(action.origen === "derivada" && action.creada_por === who.me);
  const hunters = huntersOf(who, onlyTeam);
  const [hunter, setHunter] = useState(() => initialHunter(action, hunters));
  const [date, setDate] = useState(action.fecha);
  const [from, setFrom] = useState(timeOf(action.hora_desde));
  const [to, setTo] = useState(timeOf(action.hora_hasta));
  const [isSaving, setSaving] = useState(false);
  const label = action.hunter_id ? "Guardar" : "Asignar";

  const changesOf = (): ActionChanges => {
    if (isDataList) return { hunter_id: hunter };
    return {
      hunter_id: hunter,
      fecha: date || action.fecha,
      hora_desde: from || null,
      hora_hasta: to || null,
    };
  };

  const isSame = (changes: ActionChanges) =>
    hunter === action.hunter_id &&
    (isDataList ||
      (changes.fecha === action.fecha &&
        timeOf(changes.hora_desde) === timeOf(action.hora_desde) &&
        timeOf(changes.hora_hasta) === timeOf(action.hora_hasta)));

  const save = async (changes: ActionChanges) => {
    const attempt = {
      fecha: changes.fecha ?? action.fecha,
      hora_desde: changes.hora_desde ?? null,
      hora_hasta: changes.hora_hasta ?? null,
      tipo: action.tipo,
      estado: action.estado,
    };
    if (!(await check(hunter, attempt, action.id))) return;
    const saved = await updateAction(backend, action.id, changes);
    // The database leaves the hunter as it was if whoever saves cannot change it.
    if (saved && saved.hunter_id !== hunter) {
      show("No podés cambiar el hunter de esta acción: lo hace el líder o quien la derivó.");
      return;
    }
    onClose();
    show(`Listo: ahora la tiene ${nameOf(who, hunter)}. Le aparece en su agenda.`);
    onSaved(saved);
  };

  const confirm = async () => {
    if (!hunter) {
      show("Elegí el hunter.");
      return;
    }
    const changes = changesOf();
    if (!isDataList) {
      if (!changes.hora_desde) {
        show("Poné el horario: así nadie le pisa la agenda al hunter.");
        return;
      }
      const problem = timeProblem(changes);
      if (problem) {
        show(problem);
        return;
      }
    }
    if (isSame(changes)) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      await save(changes);
    } catch (cause) {
      show(`No se pudo guardar: ${failureText(cause)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ActionWindow
      // Wide: the week of the hunter appears under the fields, and it has to fit.
      isWide={!isDataList}
      title={action.hunter_id ? "Cambiar el hunter" : "Asignar a un hunter"}
      subtitle={
        <>
          {action.empresa} <TaxId value={action.cuit} />
        </>
      }
      onClose={onClose}
    >
      <CannotAttendNotice who={who} action={action} />
      <div className={styles.form}>
        <label className={`${styles.full} ${styles.formField}`}>
          <span>Hunter</span>
          <select
            className={styles.input}
            data-testid="form-hunter"
            value={hunter}
            onChange={({ target }) => {
              setHunter(target.value);
            }}
          >
            {!action.hunter_id && <option value="">Elegí un hunter</option>}
            <HunterOptions hunters={hunters} withPrompt={false} failed={who.peopleFailed} />
          </select>
        </label>
        {!isDataList && (
          <>
            <label className={styles.formField}>
              <span>Fecha</span>
              <input
                type="date"
                className={styles.input}
                data-testid="form-date"
                value={date}
                onChange={({ target }) => {
                  setDate(target.value);
                }}
              />
            </label>
            <div className={styles.formField}>
              <span>Horario</span>
              <TimesField
                from={from}
                to={to}
                onChange={(start, end) => {
                  setFrom(start);
                  setTo(end);
                }}
              />
            </div>
          </>
        )}
        <Availability
          who={who}
          hunterField={hunter}
          hunter={null}
          date={date}
          from={from}
          to={to}
          isDataList={isDataList}
          exclude={action.id}
          onChooseHunter={setHunter}
        />
        {/* The week of the hunter goes here: gesAgPanel, with the agenda. */}
      </div>
      <div className={styles.windowFoot}>
        <Button variant="ghost" data-testid="window-dismiss" onClick={onClose}>
          Cancelar
        </Button>
        <Button data-testid="confirm-assignment" disabled={isSaving} onClick={() => void confirm()}>
          {isSaving ? "Guardando…" : label}
        </Button>
      </div>
      {dialogs}
    </ActionWindow>
  );
}
