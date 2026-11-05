// "Editar datos", and completing an action: the same form with it marked as done.
import { useState } from "react";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { Button } from "@/shared/ui/index.ts";
import { saveAction } from "../api/actions.ts";
import type { ActionChanges, ActionRow } from "../api/rows.ts";
import {
  type ActionFormDefaults,
  type ActionFormState,
  initialForm,
  readForm,
  repetitionProblem,
} from "../model/action-form.ts";
import { failureText } from "../model/failure-text.ts";
import { timeOf, timeProblem, today } from "../model/formatting.ts";
import { useOverlapCheck } from "../model/use-overlap-check.ts";
import { useQuestions } from "../model/use-questions.tsx";
import type { Who } from "../model/who.ts";
import { ActionForm } from "./ActionForm.tsx";
import { ActionWindow } from "./ActionWindow.tsx";
import { TaxId } from "./parts.tsx";
import styles from "./CommercialActions.module.css";

function titleOf(action: ActionRow, isCompleting: boolean): string {
  if (!isCompleting) return "Editar datos";
  return action.tipo === "datos" ? "Terminar la base" : "Completar la acción";
}

function defaultsOf(action: ActionRow, isCompleting: boolean): ActionFormDefaults {
  if (!isCompleting) return action;
  const date = action.fecha > today() ? today() : action.fecha;
  return { ...action, estado: "realizada", fecha: date };
}

function changedTime(values: ActionChanges, action: ActionRow): boolean {
  return (
    values.fecha !== action.fecha ||
    timeOf(values.hora_desde) !== timeOf(action.hora_desde) ||
    timeOf(values.hora_hasta) !== timeOf(action.hora_hasta) ||
    (action.estado === "cancelada" && values.estado !== "cancelada")
  );
}

interface EditWindowProps {
  readonly who: Who;
  readonly myLeader: string | null;
  readonly action: ActionRow;
  readonly isCompleting: boolean;
  readonly onClose: () => void;
  readonly onSaved: (action: ActionRow, stateBefore: string) => void;
}

export function EditWindow({
  who,
  myLeader,
  action,
  isCompleting,
  onClose,
  onSaved,
}: EditWindowProps) {
  const backend = useBackend();
  const { show } = useToast();
  const { askYes, dialogs } = useQuestions();
  const check = useOverlapCheck({ who, askYes, canChooseAnother: false });
  const [form, setForm] = useState<ActionFormState>(() =>
    initialForm(defaultsOf(action, isCompleting)),
  );
  const [isSaving, setSaving] = useState(false);
  // In a series already built the number of times does not change.
  const isBuilt = Boolean(action.veces && action.vez);

  const changesOf = (): ActionChanges => {
    const values = readForm(form, "editar", !isBuilt);
    return {
      ...values,
      // The series keeps its number.
      ...(values.frecuencia === "repite" && action.veces && values.veces === undefined
        ? { veces: action.veces }
        : {}),
      ...(values.frecuencia === "repite" && !action.vez ? { vez: 1 } : {}),
    };
  };

  const confirm = async () => {
    const changes = changesOf();
    const fecha = changes.fecha ?? action.fecha;
    if (changes.estado === "realizada" && fecha > today() && changes.tipo !== "datos") {
      show("Una acción realizada no puede tener fecha futura.");
      return;
    }
    const problem =
      repetitionProblem({
        frecuencia: changes.frecuencia ?? "",
        cada_dias: changes.cada_dias ?? null,
        veces: changes.veces,
      }) ?? timeProblem(changes);
    if (problem) {
      show(problem);
      return;
    }
    setSaving(true);
    try {
      const mustCheck = changedTime(changes, action) && changes.estado !== "cancelada";
      const attempt = { ...changes, fecha };
      if (!mustCheck || (await check(action.hunter_id, attempt, action.id))) {
        const saved = await saveAction(backend, action.id, changes);
        onClose();
        show("Guardado.");
        onSaved(saved, action.estado);
      }
    } catch (cause) {
      show(`No se pudo guardar: ${failureText(cause)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ActionWindow
      title={titleOf(action, isCompleting)}
      subtitle={
        <>
          {action.empresa} <TaxId value={action.cuit} />
        </>
      }
      onClose={onClose}
    >
      <ActionForm
        form={form}
        mode="editar"
        who={who}
        myLeader={myLeader}
        times={
          isBuilt && action.vez && action.veces ? { time: action.vez, of: action.veces } : null
        }
        hunterOfDay={action.hunter_id}
        exclude={action.id}
        onChange={(changes) => {
          setForm((before) => ({ ...before, ...changes }));
        }}
      />
      <div className={styles.windowFoot}>
        <Button variant="ghost" data-testid="window-dismiss" onClick={onClose}>
          Cancelar
        </Button>
        <Button disabled={isSaving} onClick={() => void confirm()}>
          {isSaving ? "Guardando…" : "Guardar"}
        </Button>
      </div>
      {dialogs}
    </ActionWindow>
  );
}
