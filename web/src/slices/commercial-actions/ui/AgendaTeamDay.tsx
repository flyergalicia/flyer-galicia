// The day of the team: hunters by hours, to see at a glance who has room at each time.
import type { AgendaData } from "../api/agenda.ts";
import { asHiddenItem, asOwnItem } from "../model/agenda-items.ts";
import { hourBand, hourLabel, type TeamCell, teamCells } from "../model/agenda-grid.ts";
import { ACTION_TYPES, labelOf } from "../model/labels.ts";
import { asksHiddenOccupancy, nameOf, type Who } from "../model/who.ts";
import base from "./CommercialActions.module.css";
import styles from "./Agenda.module.css";

const HIDDEN_TITLE = "Ocupado: ya tiene algo a esa hora";

interface DayItem {
  readonly id: string;
  readonly hunter_id: string | null;
  readonly tipo: string;
  readonly empresa: string | null;
  readonly hora_desde: string | null;
  readonly hora_hasta: string | null;
  readonly isHidden: boolean;
}

function itemsOfDay({ actions, occupied }: AgendaData, day: string): readonly DayItem[] {
  return [
    ...actions
      .filter(({ fecha, estado }) => fecha === day && estado !== "cancelada")
      .map((action) => asOwnItem(action)),
    ...occupied.filter(({ fecha }) => fecha === day).map((time) => asHiddenItem(time)),
  ];
}

interface AgendaTeamDayProps {
  readonly who: Who;
  readonly day: string;
  readonly data: AgendaData;
  readonly hunters: readonly string[];
  readonly onAssign: (hunter: string, day: string, time: string) => void;
  readonly onOpen: (id: string) => void;
}

function Cell({
  cell,
  hunter,
  onAssign,
  onOpen,
  day,
}: Pick<AgendaTeamDayProps, "onAssign" | "onOpen" | "day"> & {
  readonly cell: TeamCell<DayItem>;
  readonly hunter: string;
}) {
  if (cell.kind === "free") {
    const time = hourLabel(cell.hour);
    return (
      <td className={styles.free}>
        <button
          type="button"
          title={`Libre: asignarle algo a las ${time}`}
          onClick={() => {
            onAssign(hunter, day, time);
          }}
        >
          Libre
        </button>
      </td>
    );
  }
  const { item, span } = cell;
  if (item.isHidden) {
    return (
      <td
        colSpan={span > 1 ? span : undefined}
        className={styles.hiddenCell}
        title={HIDDEN_TITLE}
        data-taken="true"
      >
        <span>Ocupado</span>
      </td>
    );
  }
  return (
    <td
      colSpan={span > 1 ? span : undefined}
      className={styles.takenCell}
      title={`${labelOf(ACTION_TYPES, item.tipo)} · ${item.empresa ?? ""}`}
    >
      <button
        type="button"
        onClick={() => {
          onOpen(item.id);
        }}
      >
        {item.empresa ?? ""}
      </button>
    </td>
  );
}

export function AgendaTeamDay({ who, day, data, hunters, onAssign, onOpen }: AgendaTeamDayProps) {
  const items = itemsOfDay(data, day);
  const band = hourBand(items);
  const hours = Array.from({ length: band.last - band.first }, (_, index) => band.first + index);
  return (
    <>
      <div className={base.filters}>
        <span className={`${base.mini} ${styles.legend}`}>
          Tocá <b>Libre</b> para asignarle algo a esa hora.
          {asksHiddenOccupancy(who) && (
            <>
              {" "}
              En <b className={styles.red}>rojo</b>, horarios ocupados con empresas que no son
              tuyas.
            </>
          )}
        </span>
      </div>
      <div className={base.card}>
        <div className={base.tableBox} data-slides="calendar">
          <table className={styles.team} data-testid="agenda-team">
            <thead>
              <tr>
                <th className={styles.teamName}>Hunter</th>
                {hours.map((hour) => (
                  <th key={hour}>{hourLabel(hour)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hunters.map((hunter) => (
                <tr key={hunter}>
                  <td className={styles.teamName}>
                    {nameOf(who, hunter)}
                    {who.people[hunter]?.es_prueba && (
                      <>
                        {" "}
                        <span className={base.trial}>prueba</span>
                      </>
                    )}
                  </td>
                  {teamCells(
                    items.filter(({ hunter_id: id }) => id === hunter),
                    band,
                  ).map((cell) => (
                    <Cell
                      key={cell.kind === "free" ? cell.hour : cell.item.id}
                      cell={cell}
                      hunter={hunter}
                      day={day}
                      onAssign={onAssign}
                      onOpen={onOpen}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
