// The calendar of the month: Monday to Sunday, with the days of the months beside it faded.
import type { AgendaAction } from "../api/agenda.ts";
import { daysBetween, mondayOf, monthEnd, monthStart, WEEKDAYS } from "../model/agenda-dates.ts";
import { addDays, today } from "../model/formatting.ts";
import { nameOf, type Who } from "../model/who.ts";
import { AgendaBlock } from "./AgendaBlock.tsx";
import base from "./CommercialActions.module.css";
import styles from "./Agenda.module.css";

const DAYS_PER_WEEK = 7;

function daysOfCalendar(month: string): readonly string[] {
  const start = mondayOf(monthStart(month));
  const end = monthEnd(month);
  const days: string[] = [];
  let day = start;
  while (day <= end || daysBetween(start, day) % DAYS_PER_WEEK !== 0) {
    days.push(day);
    day = addDays(day, 1);
  }
  return days;
}

interface AgendaMonthProps {
  readonly who: Who;
  readonly month: string;
  readonly actions: readonly AgendaAction[];
  readonly hunter: string;
  readonly hunters: readonly string[];
  readonly onChooseHunter: (id: string) => void;
  readonly onOpen: (id: string) => void;
}

function HunterFilter({
  who,
  hunter,
  hunters,
  onChooseHunter,
}: Pick<AgendaMonthProps, "who" | "hunter" | "hunters" | "onChooseHunter">) {
  return (
    <label className={styles.whose}>
      <span className={base.label}>Hunter</span>
      <select
        className={`${base.input} ${base.select}`}
        value={hunter}
        onChange={({ target }) => {
          onChooseHunter(target.value);
        }}
      >
        <option value="">Todos</option>
        {hunters.map((id) => (
          <option key={id} value={id}>
            {nameOf(who, id)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function AgendaMonth({
  who,
  month,
  actions,
  hunter,
  hunters,
  onChooseHunter,
  onOpen,
}: AgendaMonthProps) {
  const isHunter = who.role === "hunter";
  const now = today();
  const first = monthStart(month);
  const last = monthEnd(month);
  const items = hunter ? actions.filter(({ hunter_id: id }) => id === hunter) : actions;
  return (
    <>
      {!isHunter && (
        <div className={base.filters}>
          <HunterFilter
            who={who}
            hunter={hunter}
            hunters={hunters}
            onChooseHunter={onChooseHunter}
          />
          <span className={`${base.mini} ${styles.legend}`}>
            En el mes se ve lo que tenés cargado. Para ver los horarios y dónde hay lugar, pasá a{" "}
            <b>Semana</b> o <b>Día del equipo</b>.
          </span>
        </div>
      )}
      <div className={`${base.card} ${base.padded}`}>
        <div className={styles.month} data-testid="agenda-month">
          {WEEKDAYS.map((name) => (
            <div key={name} className={styles.monthHead}>
              {name}
            </div>
          ))}
          {daysOfCalendar(month).map((day) => {
            const classes = [
              styles.monthDay,
              day < first || day > last ? styles.monthOther : "",
              day === now ? styles.monthToday : "",
            ];
            return (
              <div key={day} className={classes.filter(Boolean).join(" ")}>
                <span className={styles.monthNumber}>
                  {Number(day.slice(8))}
                  {day === now ? " · hoy" : ""}
                </span>
                {items
                  .filter(({ fecha }) => fecha === day)
                  .map((action) => (
                    <AgendaBlock key={action.id} who={who} action={action} onOpen={onOpen} />
                  ))}
              </div>
            );
          })}
        </div>
      </div>
      {items.length === 0 && (
        <p className={base.note}>
          {isHunter ? "Este mes no tenés nada agendado." : "No hay nada agendado este mes."}
        </p>
      )}
    </>
  );
}
