// An action open: its people, its conversation and what each person can do with it.
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useCommercialDesk } from "@/shared/lib/commercial-actions/commercial-desk.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useCan } from "@/shared/session/index.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { Button } from "@/shared/ui/index.ts";
import { deleteAction, markActionUnread } from "../api/actions.ts";
import type { ActionRow, PersonRow } from "../api/rows.ts";
import { repetitionText } from "../model/action-list.ts";
import { failureText, messageOf } from "../model/failure-text.ts";
import { dateLabel, number, percent, timeRange } from "../model/formatting.ts";
import { ACTION_TYPES, labelOf, MODALITIES } from "../model/labels.ts";
import { packagesSummary } from "../model/packages.ts";
import { taxIdText } from "../model/tax-ids.ts";
import { askForNextDate, useRepeatAction } from "../model/use-action-saving.ts";
import { type ActionDetailValue, useActionDetail } from "../model/use-action-detail.ts";
import { invalidateActionList, refreshNotices } from "../model/use-actions-data.ts";
import { useOverlapCheck } from "../model/use-overlap-check.ts";
import { usePeopleEditing } from "../model/use-people-editing.ts";
import { useQuestions } from "../model/use-questions.tsx";
import {
  type ActionCommand,
  canEdit,
  canReassign,
  commandsFor,
  nameOf,
  type Who,
} from "../model/who.ts";
import { HunterOfAction } from "./ActionsList.tsx";
import { AssignWindow } from "./AssignWindow.tsx";
import { CannotAttendWindow } from "./CannotAttendWindow.tsx";
import { EditWindow } from "./EditWindow.tsx";
import { ConnectionProblem, Figure, Loading } from "./parts.tsx";
import { PeopleSection } from "./PeopleSection.tsx";
import { StateChip } from "./StateChip.tsx";
import { ThreadSection } from "./ThreadSection.tsx";
import styles from "./CommercialActions.module.css";

const REASON_END = /[.\s]+$/;
const DEFAULT_EVERY_DAYS = 30;

function BackLink({ onBack }: { readonly onBack: () => void }) {
  return (
    <button type="button" className={styles.link} data-testid="action-back" onClick={onBack}>
      ← Volver
    </button>
  );
}

function SubtitleWhen({ action }: { readonly action: ActionRow }) {
  const { tipo, fecha, vence, modalidad, lugar, frecuencia } = action;
  if (tipo === "datos") {
    const until = vence ? ` · hasta el ${dateLabel(vence)}` : "";
    return <>{`${labelOf(ACTION_TYPES, tipo)} · desde el ${dateLabel(fecha)}${until}`}</>;
  }
  const time = timeRange(action);
  const parts = [
    `${labelOf(ACTION_TYPES, tipo)} ${labelOf(MODALITIES, modalidad).toLowerCase()}`,
    dateLabel(fecha),
    time,
    lugar ?? "",
    frecuencia === "repite" ? repetitionText(action) : "Única vez",
  ];
  return <>{parts.filter(Boolean).join(" · ")}</>;
}

function Subtitle({ who, action }: { readonly who: Who; readonly action: ActionRow }) {
  const taxId = taxIdText(action.cuit);
  return (
    <p className={styles.subtitle}>
      {taxId && (
        <>
          <b className={styles.digits}>{taxId}</b>
          {" · "}
        </>
      )}
      <SubtitleWhen action={action} /> · Hunter: <HunterOfAction who={who} action={action} /> ·
      Oficial: {nameOf(who, action.dueno_id)}
      {action.origen === "derivada" ? ` · Derivada por ${nameOf(who, action.creada_por)}` : ""}
      {action.prueba && (
        <>
          {" · "}
          <span className={styles.trial}>prueba</span>
        </>
      )}
    </p>
  );
}

function reasonOf({ no_puede_motivo: reason }: ActionRow): string {
  return (reason ?? "").replace(REASON_END, "");
}

function Warning({ who, action }: { readonly who: Who; readonly action: ActionRow }) {
  if (action.estado !== "planificada") return null;
  if (!action.hunter_id) {
    return (
      <div className={styles.notice}>
        Está esperando que la asigne <b>{nameOf(who, action.lider_id)}</b>.
        {canReassign(who, action) && (
          <>
            {" "}
            Tocá <b>Asignar a un hunter</b>: te muestra quién está libre a esa hora.
          </>
        )}
      </div>
    );
  }
  if (!action.no_puede_at) return null;
  if (action.hunter_id === who.me) {
    const reason = action.no_puede_motivo ? ` (${action.no_puede_motivo})` : "";
    return (
      <div className={styles.notice}>
        Avisaste que no podés ir{reason}. Sigue en tu agenda hasta que te la saquen.
      </div>
    );
  }
  const reason = reasonOf(action);
  return (
    <div className={styles.notice}>
      <b>{nameOf(who, action.hunter_id)}</b> avisó que no puede ir{reason ? `: ${reason}` : ""}.
      {canReassign(who, action) ? (
        <>
          {" "}
          Tocá <b>Cambiar hunter</b> para pasársela a otro.
        </>
      ) : (
        " La reasigna el líder o quien la derivó."
      )}
    </div>
  );
}

function Figures({
  action,
  people,
}: {
  readonly action: ActionRow;
  readonly people: readonly PersonRow[];
}) {
  const signups = people.filter(({ estado }) => estado === "alta").length;
  const packages = packagesSummary(people);
  if (action.tipo === "datos") {
    const contacted = people.filter(({ estado }) => estado !== "a_contactar").length;
    const inProgress = people.filter(
      ({ estado }) => estado === "prospecto" || estado === "en_gestion",
    ).length;
    return (
      <div className={`${styles.figures} ${styles.figures5}`}>
        <Figure label="Personas" value={number(people.length)} detail="en la base" />
        <Figure
          label="Contactados"
          value={number(contacted)}
          detail={`${percent(contacted, people.length)} de la base`}
        />
        <Figure label="Prospectos" value={number(inProgress)} detail="en curso" />
        <Figure label="Altas" value={number(signups)} detail={packages} isHigh />
        <Figure
          label="Conversión"
          value={percent(signups, contacted)}
          detail="altas ÷ contactados"
        />
      </div>
    );
  }
  const { dotacion: staff, asistentes: attendees } = action;
  return (
    <div className={`${styles.figures} ${styles.figures5}`}>
      <Figure label="Dotación" value={staff === null ? "—" : number(staff)} detail="empleados" />
      <Figure
        label="Asistentes"
        value={attendees === null ? "—" : number(attendees)}
        detail="contactados"
      />
      <Figure
        label="Prospectos"
        value={number(people.length)}
        detail={attendees ? `${percent(people.length, attendees)} de los asistentes` : ""}
      />
      <Figure label="Altas" value={number(signups)} detail={packages} isHigh />
      <Figure
        label="Conversión"
        value={percent(signups, people.length)}
        detail="altas ÷ prospectos"
      />
    </div>
  );
}

type OpenWindow = "complete" | "edit" | "assign" | "cannot" | null;

interface CommandsProps {
  readonly who: Who;
  readonly action: ActionRow;
  readonly onWindow: (window: Exclude<OpenWindow, null>) => void;
  readonly onUnread: () => void;
  readonly onFlyer: () => void;
  readonly onRepeat: () => void;
  readonly onDelete: () => void;
}

function commandLabel(command: ActionCommand, action: ActionRow): string {
  const isDataList = action.tipo === "datos";
  const labels: Readonly<Record<ActionCommand, string>> = {
    complete: isDataList ? "Terminar la base" : "Marcar como realizada",
    assign: action.hunter_id ? "Cambiar hunter" : "Asignar a un hunter",
    cannot: "No puedo ir",
    flyer: "Ver su flyer",
    unread: "Dejar sin leer",
    edit: "Editar datos",
    repeat: `Crear la próxima (+${String(action.cada_dias ?? DEFAULT_EVERY_DAYS)} días)`,
    delete: "Eliminar",
  };
  return labels[command];
}

function commandTitle(command: ActionCommand, action: ActionRow): string | undefined {
  if (command === "flyer") return `Abrir el flyer de ${action.empresa}`;
  return command === "unread"
    ? "Vuelve a quedar marcada en la lista, como si no la hubieras abierto"
    : undefined;
}

/** What needs doing stands out: completing it, and assigning what nobody has or cannot attend. */
function isMainCommand(command: ActionCommand, action: ActionRow): boolean {
  if (command === "complete") return true;
  return command === "assign" && (!action.hunter_id || Boolean(action.no_puede_at));
}

function Commands({ who, action, onWindow, onUnread, onFlyer, onRepeat, onDelete }: CommandsProps) {
  const canSearch = useCan("padron_buscar");
  const run: Readonly<Record<ActionCommand, () => void>> = {
    complete: () => {
      onWindow("complete");
    },
    assign: () => {
      onWindow("assign");
    },
    cannot: () => {
      onWindow("cannot");
    },
    flyer: onFlyer,
    unread: onUnread,
    edit: () => {
      onWindow("edit");
    },
    repeat: onRepeat,
    delete: onDelete,
  };
  return (
    <div className={styles.commands} data-testid="action-commands">
      <StateChip action={action} />
      {commandsFor(who, action, canSearch).map((command) => (
        <Button
          key={command}
          variant={isMainCommand(command, action) ? "primary" : "ghost"}
          className={`${styles.small}${command === "delete" ? ` ${styles.danger}` : ""}`}
          title={commandTitle(command, action)}
          onClick={run[command]}
        >
          {commandLabel(command, action)}
        </Button>
      ))}
    </div>
  );
}

export interface DetailTarget {
  readonly id: string;
  /** It opens on the window that marks it as done. */
  readonly complete?: boolean;
  /** It opens on the window that assigns it. */
  readonly assign?: boolean;
  /** Who stays marked on its list, arriving from "Para contactar". */
  readonly person?: string;
  /** The list that could not be loaded when it was created. */
  readonly pendingList?: string;
}

interface ActionDetailProps {
  readonly who: Who;
  readonly myLeader: string | null;
  readonly isActive: boolean;
  readonly target: DetailTarget;
  readonly onBack: () => void;
  /** "Dejar sin leer": back to the list, which is where the mark shows. */
  readonly onBackToList: () => void;
  readonly onOpen: (id: string) => void;
}

function firstWindow({ complete, assign }: DetailTarget): OpenWindow {
  if (complete) return "complete";
  return assign ? "assign" : null;
}

export function ActionDetail(props: ActionDetailProps) {
  const { who, isActive, target, onBack } = props;
  const detail = useActionDetail(target.id, who, isActive);
  const { action, isReading, problem, retry } = detail;
  if (action) return <OpenAction {...props} action={action} detail={detail} />;
  if (isReading) return <Loading />;
  if (problem) return <ConnectionProblem cause={problem} onRetry={retry} />;
  return (
    <>
      <BackLink onBack={onBack} />
      <div className={styles.empty}>Esa gestión ya no existe o no tenés acceso.</div>
    </>
  );
}

function OpenAction({
  who,
  myLeader,
  target,
  onBack,
  onBackToList,
  onOpen,
  action,
  detail,
}: ActionDetailProps & { readonly action: ActionRow; readonly detail: ActionDetailValue }) {
  const backend = useBackend();
  const queryClient = useQueryClient();
  const desk = useCommercialDesk();
  const { show } = useToast();
  const questions = useQuestions();
  const { askYes, dialogs } = questions;
  const [window, setWindow] = useState<OpenWindow>(() => firstWindow(target));
  const check = useOverlapCheck({ who, askYes, canChooseAnother: false });
  const repeat = useRepeatAction(who.me, check, onOpen);
  const { people } = detail;
  const editing = usePeopleEditing(action, detail, questions);

  const offerNext = async (saved: ActionRow) => {
    if (await askForNextDate(saved, askYes)) await repeat(saved);
  };

  const leaveUnread = async () => {
    try {
      await markActionUnread(backend, action.id);
      invalidateActionList(queryClient);
      refreshNotices(queryClient);
      onBackToList();
      show("Queda marcada en la lista, como no leída.");
    } catch (cause) {
      show(`No se pudo: ${failureText(cause)}`);
    }
  };

  const remove = async () => {
    const isSure = await askYes({
      title: "¿Eliminar esta gestión?",
      text: `Se borran también sus ${String(people.length)} prospectos, la conversación y el historial. No se puede deshacer.`,
      confirmLabel: "Eliminar",
    });
    if (!isSure) return;
    try {
      await deleteAction(backend, action.id);
      invalidateActionList(queryClient);
      onBack();
      show("Gestión eliminada.");
    } catch (cause) {
      show(`No se pudo eliminar: ${messageOf(cause)}`);
    }
  };

  const edits = canEdit(who, action);
  return (
    <div data-testid="action-detail" data-action-id={action.id}>
      <BackLink onBack={onBack} />
      <div className={styles.detailTop}>
        <div>
          <h3 className={styles.title}>{action.empresa}</h3>
          <Subtitle who={who} action={action} />
        </div>
        <Commands
          who={who}
          action={action}
          onWindow={setWindow}
          onUnread={() => void leaveUnread()}
          onFlyer={() => {
            desk?.showFlyer(who.role === "hunter" ? "hunter" : "flyer", {
              company: action.empresa,
              taxIds: action.cuit,
            });
          }}
          onRepeat={() => void repeat(action)}
          onDelete={() => void remove()}
        />
      </div>
      <Warning who={who} action={action} />
      {action.nota && (
        <div className={styles.info} data-testid="action-note">
          {action.nota}
        </div>
      )}
      <Figures action={action} people={people} />
      <PeopleSection
        people={people}
        canEdit={edits}
        isDataList={action.tipo === "datos"}
        highlighted={target.person ?? null}
        pendingList={edits ? (target.pendingList ?? null) : null}
        editing={editing}
      />
      <ThreadSection
        who={who}
        actionId={action.id}
        messages={detail.messages}
        events={detail.events}
        failed={detail.threadFailed}
        onRetry={detail.retryThread}
        onSent={detail.reloadThread}
      />
      {(window === "complete" || window === "edit") && (
        <EditWindow
          who={who}
          myLeader={myLeader}
          action={action}
          isCompleting={window === "complete"}
          onClose={() => {
            setWindow(null);
          }}
          onSaved={(saved, stateBefore) => {
            detail.setAction(saved);
            void detail.reloadThread();
            if (stateBefore !== "realizada") void offerNext(saved);
          }}
        />
      )}
      {window === "assign" && canReassign(who, action) && (
        <AssignWindow
          who={who}
          action={action}
          onClose={() => {
            setWindow(null);
          }}
          onSaved={(saved) => {
            invalidateActionList(queryClient);
            // If they no longer see it, back to the list.
            if (saved) void detail.reload();
            else onBack();
          }}
        />
      )}
      {window === "cannot" && (
        <CannotAttendWindow
          who={who}
          action={action}
          onClose={() => {
            setWindow(null);
          }}
          onSaved={() => {
            invalidateActionList(queryClient);
            void detail.reload();
          }}
        />
      )}
      {dialogs}
    </div>
  );
}
