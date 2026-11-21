// "Registrar gestión", from the screen of the Hunter, with the company chosen there. The officer who
// ceded it is filled in by itself.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { RegisterableCompany } from "@/shared/lib/commercial-actions/commercial-desk.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { Button } from "@/shared/ui/index.ts";
import { insertAction, readPlannedForCompany } from "../api/actions.ts";
import type { ActionRow } from "../api/rows.ts";
import {
  type ActionFormState,
  initialForm,
  readForm,
  repetitionProblem,
} from "../model/action-form.ts";
import { failureText } from "../model/failure-text.ts";
import { dateLabel, timeProblem, today } from "../model/formatting.ts";
import { askForNextDate, useRepeatAction, useSeriesCreation } from "../model/use-action-saving.ts";
import { invalidateActionList } from "../model/use-actions-data.ts";
import { useOverlapCheck } from "../model/use-overlap-check.ts";
import { useQuestions } from "../model/use-questions.tsx";
import { useWho } from "../model/use-who.ts";
import { nameOf } from "../model/who.ts";
import { ActionForm } from "./ActionForm.tsx";
import { ActionWindow } from "./ActionWindow.tsx";
import { TaxId } from "./parts.tsx";
import styles from "./CommercialActions.module.css";

const SAVE = "Guardar y cargar prospectos";

function PlannedOffer({
  me,
  company,
  owner,
  onComplete,
}: {
  readonly me: string;
  readonly company: string;
  readonly owner: string;
  readonly onComplete: (id: string) => void;
}) {
  const backend = useBackend();
  const { data = [] } = useQuery({
    queryKey: ["commercial-actions", "planned-for-company", me, owner, company],
    gcTime: 0,
    staleTime: 0,
    queryFn: () => readPlannedForCompany(backend, { hunter: me, owner, company }),
  });
  if (data.length === 0) return null;
  const what =
    data.length === 1 ? "una acción planificada" : `${String(data.length)} acciones planificadas`;
  return (
    <div className={styles.notice}>
      Ya tenés {what} para esta empresa.{" "}
      {data.map(({ id, fecha }) => (
        <button
          key={id}
          type="button"
          className={styles.link}
          onClick={() => {
            onComplete(id);
          }}
        >
          Completar la del {dateLabel(fecha)}
        </button>
      ))}
    </div>
  );
}

function savedText(created: number): string {
  return created > 0
    ? `Guardada, y planificadas las otras ${String(created)} fechas. Ahora cargá los prospectos.`
    : "Gestión guardada. Ahora cargá los prospectos.";
}

export interface RegisterActionWindowProps {
  readonly company: RegisterableCompany;
  readonly onClose: () => void;
  /** The action opens on Gestiones. `complete`: on the window that marks it as done. */
  readonly onOpenAction: (id: string, complete: boolean) => void;
}

export function RegisterActionWindow({
  company,
  onClose,
  onOpenAction,
}: RegisterActionWindowProps) {
  const backend = useBackend();
  const queryClient = useQueryClient();
  const { show } = useToast();
  const who = useWho();
  const [form, setForm] = useState<ActionFormState>(() => initialForm());
  const [isSaving, setSaving] = useState(false);
  const [isAsking, setAsking] = useState(false);
  const { askYes, dialogs } = useQuestions();
  const check = useOverlapCheck({ who, askYes, canChooseAnother: false });
  const createSeries = useSeriesCreation();
  const owner = company.user_id ?? "";
  const repeat = useRepeatAction(who.me, check, (id) => {
    onOpenAction(id, false);
  });

  const afterSaving = async (saved: ActionRow) => {
    const { created, failed } = await createSeries(saved);
    if (failed.length === 0) show(savedText(created));
    onOpenAction(saved.id, false);
    if (created > 0) {
      onClose();
      return;
    }
    // The window is gone: what stays on screen is the question, if there is one.
    setAsking(true);
    if (await askForNextDate(saved, askYes)) await repeat(saved);
    onClose();
  };

  const confirm = async () => {
    const values = readForm(form, "registrar");
    if (values.estado === "realizada" && values.fecha > today()) {
      show(
        "Una acción realizada no puede tener fecha futura. Ponela como Planificada o cambiá la fecha.",
      );
      return;
    }
    const problem = repetitionProblem(values) ?? timeProblem(values);
    if (problem) {
      show(problem);
      return;
    }
    setSaving(true);
    try {
      if (await check(who.me, values)) {
        const saved = await insertAction(backend, {
          ...values,
          empresa: company.empresa,
          dueno_id: owner,
          origen: "propia",
          ...(values.frecuencia === "repite" ? { vez: 1 } : {}),
        });
        invalidateActionList(queryClient);
        await afterSaving(saved);
      }
    } catch (cause) {
      show(`No se pudo guardar: ${failureText(cause)}`);
    } finally {
      setSaving(false);
    }
  };

  if (isAsking) return <>{dialogs}</>;
  return (
    <ActionWindow
      title="Registrar gestión"
      subtitle={
        <>
          {company.empresa} <TaxId value={company.cuits ?? null} />
        </>
      }
      onClose={onClose}
    >
      <div className={styles.info}>
        Cedida por <b>{nameOf(who, owner)}</b>, el oficial de esta empresa en la base. Se completa
        sola.
      </div>
      <PlannedOffer
        me={who.me}
        company={company.empresa}
        owner={owner}
        onComplete={(id) => {
          onClose();
          onOpenAction(id, true);
        }}
      />
      <ActionForm
        form={form}
        mode="registrar"
        who={who}
        myLeader={who.myLeader}
        onChange={(changes) => {
          setForm((before) => ({ ...before, ...changes }));
        }}
      />
      <div className={styles.windowFoot}>
        <Button variant="ghost" data-testid="window-dismiss" onClick={onClose}>
          Cancelar
        </Button>
        <Button data-testid="confirm-register" disabled={isSaving} onClick={() => void confirm()}>
          {isSaving ? "Guardando…" : SAVE}
        </Button>
      </div>
      {dialogs}
    </ActionWindow>
  );
}
