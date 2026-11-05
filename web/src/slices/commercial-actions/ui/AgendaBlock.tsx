// An action in few words, on the calendar of the month and over the hours when it has no time.
import type { AgendaAction } from "../api/agenda.ts";
import { shortTime } from "../model/agenda-dates.ts";
import { isNew } from "../model/action-list.ts";
import { ACTION_TYPES, labelOf } from "../model/labels.ts";
import { taxIdText } from "../model/tax-ids.ts";
import { nameOf, type Who } from "../model/who.ts";
import styles from "./Agenda.module.css";

const STATE_CLASS: Readonly<Record<string, string | undefined>> = {
  realizada: styles.actionDone,
  cancelada: styles.actionCancelled,
};

function titleOf(who: Who, action: AgendaAction, cannot: boolean): string {
  const { tipo, empresa, cuit, lugar, hunter_id: hunter } = action;
  return [
    labelOf(ACTION_TYPES, tipo),
    empresa,
    cuit ? taxIdText(cuit) : "",
    lugar ?? "",
    who.role === "hunter" ? "" : nameOf(who, hunter),
    cannot ? "pidió que se la pasen a otro" : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export function AgendaBlock({
  who,
  action,
  onOpen,
}: {
  readonly who: Who;
  readonly action: AgendaAction;
  readonly onOpen: (id: string) => void;
}) {
  const cannot = Boolean(action.no_puede_at) && action.estado === "planificada";
  const classes = [
    styles.action,
    STATE_CLASS[action.estado] ?? "",
    isNew(who, action) ? styles.actionNew : "",
    cannot ? styles.actionCannot : "",
  ];
  return (
    <button
      type="button"
      className={classes.filter(Boolean).join(" ")}
      title={titleOf(who, action, cannot)}
      onClick={() => {
        onOpen(action.id);
      }}
    >
      <span className={styles.actionTime}>
        {action.hora_desde ? shortTime(action) : "Sin horario"}
      </span>
      <span className={styles.actionCompany}>{action.empresa}</span>
    </button>
  );
}
