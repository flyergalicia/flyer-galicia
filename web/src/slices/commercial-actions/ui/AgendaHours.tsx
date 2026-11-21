// The week of one person by hours and days, or one single day. Whoever assigns chooses whose.
import { minutesOf, today } from "../model/formatting.ts";
import type { AgendaData, AgendaAction, OccupiedTime } from "../api/agenda.ts";
import { asHiddenItem, asOwnItem } from "../model/agenda-items.ts";
import { asksHiddenOccupancy, nameOf, type Who } from "../model/who.ts";
import { AgendaBlock } from "./AgendaBlock.tsx";
import { HoursGrid, type PlacedHourItem } from "./HoursGrid.tsx";
import base from "./CommercialActions.module.css";
import styles from "./Agenda.module.css";

function legendOf(who: Who) {
  if (who.role === "hunter") return "Tocá un hueco libre para agendar algo a esa hora.";
  return (
    <>
      Tocá un hueco libre para asignarle algo a esa hora.
      {asksHiddenOccupancy(who) && (
        <>
          {" "}
          En <b className={styles.red}>rojo</b>, horarios ya ocupados con empresas que no son tuyas:
          ves que no hay lugar, no de qué se trata.
        </>
      )}
    </>
  );
}

function ofHunter<Item extends { readonly hunter_id: string | null }>(
  items: readonly Item[],
  hunter: string | null,
): readonly Item[] {
  return items.filter(({ hunter_id: id }) => !hunter || id === hunter);
}

function asItems(
  actions: readonly AgendaAction[],
  occupied: readonly OccupiedTime[],
): readonly PlacedHourItem[] {
  return [
    ...actions.map((action) => asOwnItem(action)),
    ...occupied.map((time) => asHiddenItem(time)),
  ];
}

interface AgendaHoursProps {
  readonly who: Who;
  readonly days: readonly string[];
  readonly data: AgendaData;
  /** Whose agenda it is. */
  readonly hunter: string | null;
  readonly hunters: readonly string[];
  readonly onChooseHunter: (id: string) => void;
  readonly onTouch: (day: string, minutes: number) => void;
  readonly onOpen: (id: string) => void;
}

function NoTimeRow({
  who,
  days,
  actions,
  onOpen,
}: Pick<AgendaHoursProps, "who" | "days" | "onOpen"> & {
  readonly actions: readonly AgendaAction[];
}) {
  const withoutTime = actions.filter(({ hora_desde: from }) => minutesOf(from) === null);
  if (withoutTime.length === 0) return null;
  return (
    <div className={`${styles.hoursHead} ${styles.hoursNoTime}`}>
      <div>
        <span className={base.mini}>Sin horario</span>
      </div>
      {days.map((day) => (
        <div key={day} className={styles.noTimeDay}>
          {withoutTime
            .filter(({ fecha }) => fecha === day)
            .map((action) => (
              <AgendaBlock key={action.id} who={who} action={action} onOpen={onOpen} />
            ))}
        </div>
      ))}
    </div>
  );
}

export function AgendaHours({
  who,
  days,
  data,
  hunter,
  hunters,
  onChooseHunter,
  onTouch,
  onOpen,
}: AgendaHoursProps) {
  const isHunter = who.role === "hunter";
  const now = today();
  const actions = ofHunter(data.actions, hunter);
  const items = asItems(actions, ofHunter(data.occupied, hunter));
  const legend = legendOf(who);
  return (
    <>
      {isHunter ? (
        <p className={base.note}>{legend}</p>
      ) : (
        <div className={base.filters}>
          <label className={styles.whose}>
            <span className={base.label}>Agenda de</span>
            <select
              className={`${base.input} ${base.select}`}
              value={hunter ?? ""}
              onChange={({ target }) => {
                onChooseHunter(target.value);
              }}
            >
              {hunters.map((id) => (
                <option key={id} value={id}>
                  {nameOf(who, id)}
                </option>
              ))}
            </select>
          </label>
          <span className={`${base.mini} ${styles.legend}`}>{legend}</span>
        </div>
      )}
      <HoursGrid
        className={`${base.card} ${styles.hoursOnScreen}`}
        days={days}
        isMarked={(day) => day === now}
        markClass={styles.hoursDayOn}
        items={items}
        over={<NoTimeRow who={who} days={days} actions={actions} onOpen={onOpen} />}
        onTouch={onTouch}
        onOpen={onOpen}
      />
    </>
  );
}
