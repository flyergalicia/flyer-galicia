// "+ Asignar", or "+ Agendar" for a hunter: the same as forwarding, starting from a company of the
// database that may be another officer's, and the action stays with that officer.
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { Button } from "@/shared/ui/index.ts";
import { insertAction } from "../api/actions.ts";
import { type CompanyFound, searchCompanies } from "../api/agenda.ts";
import {
  type ActionFormState,
  type ActionFormValues,
  assignmentProblem,
  initialForm,
  readForm,
  repetitionProblem,
} from "../model/action-form.ts";
import { anHourLater } from "../model/agenda-grid.ts";
import { assignedText } from "../model/assigned-text.ts";
import { failureText, messageOf } from "../model/failure-text.ts";
import { timeProblem, today } from "../model/formatting.ts";
import { type PastedPerson, peopleReady } from "../model/people-paste.ts";
import { taxIdText } from "../model/tax-ids.ts";
import { type PendingList, useListSaving, useSeriesCreation } from "../model/use-action-saving.ts";
import { invalidateActionList } from "../model/use-actions-data.ts";
import { useOverlapCheck } from "../model/use-overlap-check.ts";
import { useQuestions } from "../model/use-questions.tsx";
import { huntersOf, leaderChoices, nameOf, ownerText, type Who } from "../model/who.ts";
import { ActionForm } from "./ActionForm.tsx";
import { ActionWindow } from "./ActionWindow.tsx";
import { Chip, TaxId } from "./parts.tsx";
import base from "./CommercialActions.module.css";
import styles from "./Agenda.module.css";

const WAIT_TO_SEARCH_MS = 200;
const MIN_SEARCH = 2;
const ASSIGNED = /^Derivada/;

export interface ScheduleStart {
  readonly hunter?: string;
  readonly date?: string;
  readonly time?: string;
}

interface ScheduleWindowProps {
  readonly who: Who;
  readonly myLeader: string | null;
  readonly start: ScheduleStart;
  readonly onClose: () => void;
  /** Saved. With the date it has to show, if it goes on the agenda of a hunter. */
  readonly onSaved: (date: string | null) => void;
  /** Something did not go through: the action opens, to go on from there. */
  readonly onOpenAction: (id: string, pending: PendingList | null) => void;
}

function startingForm(who: Who, { hunter, date, time }: ScheduleStart): ActionFormState {
  const offered = huntersOf(who, true);
  const shown = hunter && !offered.some(({ id }) => id === hunter) ? offered[0]?.id : hunter;
  return initialForm({
    fecha: date ?? today(),
    tipo: "posicion",
    estado: "planificada",
    hunter_id: shown ?? null,
    ...(time ? { hora_desde: time, hora_hasta: anHourLater(time) } : {}),
  });
}

function CompanySearch({
  who,
  chosen,
  onChosen,
}: {
  readonly who: Who;
  readonly chosen: CompanyFound | null;
  readonly onChosen: (company: CompanyFound | null) => void;
}) {
  const backend = useBackend();
  const [text, setText] = useState("");
  const [asked, setAsked] = useState("");
  const search = text.trim();
  // Choosing one writes its name, as the field shows it: that is not a new search.
  useEffect(() => {
    if (chosen || search.length < MIN_SEARCH) return undefined;
    const timer = setTimeout(() => {
      setAsked(search);
    }, WAIT_TO_SEARCH_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [chosen, search]);
  const { data, error } = useQuery({
    queryKey: ["commercial-actions", "companies-to-assign", asked],
    enabled: asked.length >= MIN_SEARCH,
    gcTime: 0,
    staleTime: 0,
    placeholderData: keepPreviousData,
    queryFn: () => searchCompanies(backend, asked),
  });
  const isEmpty = search.length < MIN_SEARCH;
  return (
    <div className={`${base.form} ${styles.formCompany}`}>
      <label className={`${base.full} ${base.formField}`}>
        <span>Empresa</span>
        <input
          type="search"
          className={base.input}
          placeholder="Buscá por razón social o CUIT"
          autoComplete="off"
          data-testid="form-company"
          value={text}
          onChange={({ target }) => {
            setText(target.value);
            onChosen(null);
          }}
        />
      </label>
      <div className={`${base.full} ${styles.companies}`} data-testid="form-company-results">
        {chosen ? (
          <Chip tone="ok">
            {ownerText(who, chosen.dueno_id)}
            {taxIdText(chosen.cuits) ? ` · ${taxIdText(chosen.cuits)}` : ""}
          </Chip>
        ) : (
          !isEmpty && (
            <Results
              who={who}
              found={data}
              problem={error}
              onChoose={(company) => {
                setText(company.empresa);
                onChosen(company);
              }}
            />
          )
        )}
      </div>
    </div>
  );
}

function Results({
  who,
  found,
  problem,
  onChoose,
}: {
  readonly who: Who;
  readonly found: readonly CompanyFound[] | undefined;
  readonly problem: unknown;
  readonly onChoose: (company: CompanyFound) => void;
}) {
  if (problem) return <span className={base.mini}>No se pudo buscar: {messageOf(problem)}</span>;
  if (!found) return null;
  if (found.length === 0) {
    return <span className={base.mini}>Ninguna empresa de la base coincide.</span>;
  }
  return (
    <>
      {found.map((company) => (
        <button
          key={`${company.dueno_id}|${company.empresa}`}
          type="button"
          onClick={() => {
            onChoose(company);
          }}
        >
          {company.empresa} <TaxId value={company.cuits} />{" "}
          <span className={base.mini}>· {nameOf(who, company.dueno_id)}</span>
        </button>
      ))}
    </>
  );
}

function firstProblem(
  values: ActionFormValues,
  people: readonly PastedPerson[] | null,
  isHunter: boolean,
): string | null {
  const problem =
    (isHunter ? null : assignmentProblem(values)) ??
    repetitionProblem(values) ??
    timeProblem(values);
  if (problem) return problem;
  return people?.length === 0 ? "Pegá al menos una persona para contactar." : null;
}

export function ScheduleWindow({
  who,
  myLeader,
  start,
  onClose,
  onSaved,
  onOpenAction,
}: ScheduleWindowProps) {
  const backend = useBackend();
  const queryClient = useQueryClient();
  const { show } = useToast();
  const isHunter = who.role === "hunter";
  const mode = isHunter ? "agendar" : "asignar";
  const [form, setForm] = useState(() => startingForm(who, start));
  const [company, setCompany] = useState<CompanyFound | null>(null);
  const [isSaving, setSaving] = useState(false);
  const { askYes, dialogs } = useQuestions();
  const check = useOverlapCheck({ who, askYes, canChooseAnother: !isHunter });
  const createSeries = useSeriesCreation();
  const saveList = useListSaving();

  const saveNew = async (
    chosen: CompanyFound,
    values: ActionFormValues,
    people: readonly PastedPerson[] | null,
  ) => {
    const saved = await insertAction(backend, {
      ...values,
      empresa: chosen.empresa,
      dueno_id: chosen.dueno_id,
      origen: isHunter ? "propia" : "derivada",
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
    const dates = series.created > 0 ? `, con las ${String(series.created + 1)} fechas` : "";
    show(
      isHunter
        ? `Agendada${dates}.`
        : assignedText(who, values, series.created, people).replace(ASSIGNED, "Asignada"),
    );
    onSaved(values.tipo !== "datos" && values.hunter_id ? values.fecha : null);
  };

  const confirm = async () => {
    if (!company) {
      show("Elegí la empresa de la lista.");
      return;
    }
    const leader = form.lider || leaderChoices(who, myLeader)[0]?.id || "";
    const read = readForm({ ...form, lider: leader }, mode);
    const values = isHunter ? { ...read, hunter_id: who.me } : read;
    const people = values.tipo === "datos" ? peopleReady(form.personas) : null;
    const problem = firstProblem(values, people, isHunter);
    if (problem) {
      show(problem);
      return;
    }
    setSaving(true);
    try {
      if (await check(values.hunter_id ?? null, values)) await saveNew(company, values, people);
    } catch (cause) {
      show(`No se pudo guardar: ${failureText(cause)}`);
    } finally {
      setSaving(false);
    }
  };

  const label = isHunter ? "Agendar" : "Asignar";
  return (
    <ActionWindow
      isWide={!isHunter}
      title={isHunter ? "Agendar" : "Asignar a un hunter"}
      subtitle={
        isHunter
          ? "Queda en tu agenda como planificada. Después la marcás como realizada y cargás los prospectos."
          : "Le aparece en su agenda y en la marca de su avatar."
      }
      onClose={onClose}
    >
      <CompanySearch who={who} chosen={company} onChosen={setCompany} />
      <ActionForm
        form={form}
        mode={mode}
        who={who}
        myLeader={myLeader}
        onChange={(changes) => {
          setForm((before) => ({ ...before, ...changes }));
        }}
      />
      <div className={base.windowFoot}>
        <Button variant="ghost" data-testid="window-dismiss" onClick={onClose}>
          Cancelar
        </Button>
        <Button data-testid="confirm-agenda" disabled={isSaving} onClick={() => void confirm()}>
          {isSaving ? "Guardando…" : label}
        </Button>
      </div>
      {dialogs}
    </ActionWindow>
  );
}
