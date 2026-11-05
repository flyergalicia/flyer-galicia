// "Derivar a un hunter", from Mis empresas.
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { Button } from "@/shared/ui/index.ts";
import { insertAction } from "../api/actions.ts";
import type { ActionRow } from "../api/rows.ts";
import {
  type ActionFormState,
  type ActionFormValues,
  assignmentProblem,
  initialForm,
  readForm,
  repetitionProblem,
} from "../model/action-form.ts";
import { failureText } from "../model/failure-text.ts";
import { timeProblem } from "../model/formatting.ts";
import type { CompanyLine } from "../model/my-companies.ts";
import { type PastedPerson, peopleReady } from "../model/people-paste.ts";
import { type PendingList, useListSaving, useSeriesCreation } from "../model/use-action-saving.ts";
import { invalidateActionList } from "../model/use-actions-data.ts";
import { useOverlapCheck } from "../model/use-overlap-check.ts";
import { useQuestions } from "../model/use-questions.tsx";
import { leaderChoices, nameOf, type Who } from "../model/who.ts";
import { ActionForm } from "./ActionForm.tsx";
import { ActionWindow } from "./ActionWindow.tsx";
import { TaxId } from "./parts.tsx";
import styles from "./CommercialActions.module.css";

function doneText(
  who: Who,
  values: ActionFormValues,
  created: number,
  people: readonly PastedPerson[] | null,
): string {
  const { hunter_id: hunter, lider_id: leader } = values;
  const start = hunter
    ? `Derivada a ${nameOf(who, hunter)}`
    : `Queda para que la asigne ${nameOf(who, leader)}`;
  const list = people?.length
    ? `, con ${String(people.length)}${people.length === 1 ? " persona para contactar" : " personas para contactar"}`
    : "";
  const dates = created > 0 ? `, con las ${String(created + 1)} fechas planificadas` : "";
  const end = hunter
    ? " Le aparece en su agenda y en la marca de su avatar."
    : ' Le aparece en su bandeja "Por asignar".';
  return `${start}${list}${dates}.${end}`;
}

function firstProblem(values: ActionFormValues, people: readonly PastedPerson[] | null) {
  const problem = assignmentProblem(values) ?? repetitionProblem(values) ?? timeProblem(values);
  if (problem) return problem;
  return people?.length === 0 ? "Pegá al menos una persona para contactar." : null;
}

interface ForwardWindowProps {
  readonly who: Who;
  readonly myLeader: string | null;
  readonly company: CompanyLine;
  readonly onClose: () => void;
  /** Something did not go through: the action opens, to go on from there. */
  readonly onOpenAction: (id: string, pending: PendingList | null) => void;
}

export function ForwardWindow({
  who,
  myLeader,
  company,
  onClose,
  onOpenAction,
}: ForwardWindowProps) {
  const backend = useBackend();
  const queryClient = useQueryClient();
  const { show } = useToast();
  const [form, setForm] = useState<ActionFormState>(() => initialForm());
  const [isSaving, setSaving] = useState(false);
  const { askYes, dialogs } = useQuestions();
  const check = useOverlapCheck({ who, askYes, canChooseAnother: true });
  const createSeries = useSeriesCreation();
  const saveList = useListSaving();

  const saveNew = async (values: ActionFormValues, people: readonly PastedPerson[] | null) => {
    const saved: ActionRow = await insertAction(backend, {
      ...values,
      empresa: company.empresa,
      origen: "derivada",
      ...(values.frecuencia === "repite" ? { vez: 1 } : {}),
    });
    invalidateActionList(queryClient);
    const list = await saveList(saved, people);
    const series = await createSeries(saved);
    if (!list.saved || series.failed.length > 0) {
      onOpenAction(saved.id, list.saved ? null : list.pending);
      return;
    }
    onClose();
    show(doneText(who, values, series.created, people));
  };

  const confirm = async () => {
    const leader = form.lider || leaderChoices(who, myLeader)[0]?.id || "";
    const values = readForm({ ...form, lider: leader }, "derivar");
    const people = values.tipo === "datos" ? peopleReady(form.personas) : null;
    const problem = firstProblem(values, people);
    if (problem) {
      show(problem);
      return;
    }
    setSaving(true);
    try {
      if (await check(values.hunter_id ?? null, values)) await saveNew(values, people);
    } catch (cause) {
      show(`No se pudo guardar: ${failureText(cause)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ActionWindow
      isWide
      title="Derivar a un hunter"
      subtitle={
        <>
          {company.empresa} <TaxId value={company.cuits} />
        </>
      }
      onClose={onClose}
    >
      <ActionForm
        form={form}
        mode="derivar"
        who={who}
        myLeader={myLeader}
        onChange={(changes) => {
          setForm((before) => ({ ...before, ...changes }));
        }}
      />
      <div className={styles.windowFoot}>
        <Button variant="ghost" data-testid="window-dismiss" onClick={onClose}>
          Cancelar
        </Button>
        <Button data-testid="confirm-forwarding" disabled={isSaving} onClick={() => void confirm()}>
          {isSaving ? "Derivando…" : "Derivar"}
        </Button>
      </div>
      {dialogs}
    </ActionWindow>
  );
}
