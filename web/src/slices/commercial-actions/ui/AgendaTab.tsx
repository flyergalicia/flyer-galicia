// The solapa of the agenda: a calendar of verdad, with four ways of looking at it. It says what could
// not be read, and it keeps showing the rest (invariant 24).
import { useState } from "react";
import { Button } from "@/shared/ui/index.ts";
import { WEEKDAYS } from "../model/agenda-dates.ts";
import { timeFromMinutes } from "../model/agenda-grid.ts";
import {
  type AgendaMove,
  type AgendaPlace,
  type AgendaView,
  atDate,
  dayShown,
  daysShown,
  monthShown,
  moved,
  moveWord,
  rangeOf,
  titleOf,
  viewOf,
  withView,
} from "../model/agenda-place.ts";
import { traysOf } from "../model/agenda-trays.ts";
import type { AgendaData } from "../api/agenda.ts";
import { today } from "../model/formatting.ts";
import type { PendingList } from "../model/use-action-saving.ts";
import { useAgendaData } from "../model/use-agenda-data.ts";
import { huntersOf, type Who } from "../model/who.ts";
import { AgendaHours } from "./AgendaHours.tsx";
import { AgendaMonth } from "./AgendaMonth.tsx";
import { AgendaPasteWindow } from "./AgendaPasteWindow.tsx";
import { AgendaTeamDay } from "./AgendaTeamDay.tsx";
import { AgendaTrays } from "./AgendaTrays.tsx";
import type { DetailTarget } from "./ActionDetail.tsx";
import { ContactListWindow } from "./ContactListWindow.tsx";
import { ConnectionProblem, Loading } from "./parts.tsx";
import { type ScheduleStart, ScheduleWindow } from "./ScheduleWindow.tsx";
import base from "./CommercialActions.module.css";
import styles from "./Agenda.module.css";

const VIEW_KEY = "fg_ges_agver";

function saveView(view: AgendaView): void {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    // Without a place to keep it, it is chosen again next time.
  }
}

/** Hunters to choose from, and whoever has something on the agenda without being of the team. */
function huntersListed(who: Who, { actions, occupied }: AgendaData): readonly string[] {
  const team = huntersOf(who, true).map(({ id }) => id);
  const others = [...actions, ...occupied].flatMap(({ hunter_id: id }) => (id ? [id] : []));
  return [...new Set([...team, ...others])];
}

function NoHunters({ who }: { readonly who: Who }) {
  if (who.peopleFailed) return <div className={base.empty}>No se pudieron traer los hunters.</div>;
  return who.role === "lider" ? (
    <div className={base.empty}>
      Todavía no tenés hunters en tu equipo. El administrador los asigna en Admin → Usuarios →
      «Líder a cargo».
    </div>
  ) : (
    <div className={base.empty}>No hay hunters activos.</div>
  );
}

interface ToolbarProps {
  readonly who: Who;
  readonly view: AgendaView;
  readonly title: string;
  readonly onMove: (by: AgendaMove) => void;
  readonly onView: (view: AgendaView) => void;
  readonly onSchedule: () => void;
  readonly onPaste: () => void;
}

function ViewButton({
  label,
  view,
  isOn,
  onView,
}: {
  readonly label: string;
  readonly view: AgendaView;
  readonly isOn: boolean;
  readonly onView: (view: AgendaView) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={isOn}
      onClick={() => {
        onView(view);
      }}
    >
      {label}
    </button>
  );
}

function Toolbar({ who, view, title, onMove, onView, onSchedule, onPaste }: ToolbarProps) {
  const isHunter = who.role === "hunter";
  const word = moveWord(view);
  return (
    <div className={styles.tool}>
      <div className={styles.nav} data-testid="agenda-nav">
        <Button
          variant="ghost"
          className={base.small}
          aria-label={`${word} anterior`}
          title={`${word} anterior`}
          onClick={() => {
            onMove(-1);
          }}
        >
          ←
        </Button>
        <Button
          variant="ghost"
          className={base.small}
          onClick={() => {
            onMove(0);
          }}
        >
          Hoy
        </Button>
        <Button
          variant="ghost"
          className={base.small}
          aria-label={`${word} siguiente`}
          title={`${word} siguiente`}
          onClick={() => {
            onMove(1);
          }}
        >
          →
        </Button>
        <span className={styles.range} data-testid="agenda-range">
          {title}
        </span>
      </div>
      <div className={styles.nav}>
        <fieldset className={styles.views} aria-label="Cómo ver la agenda">
          <ViewButton label="Semana" view="sem" isOn={view === "sem"} onView={onView} />
          {isHunter ? (
            <ViewButton label="Día" view="dia" isOn={view === "dia"} onView={onView} />
          ) : (
            <ViewButton
              label="Día del equipo"
              view="equipo"
              isOn={view === "equipo"}
              onView={onView}
            />
          )}
          <ViewButton label="Mes" view="mes" isOn={view === "mes"} onView={onView} />
        </fieldset>
        {!isHunter && (
          <Button variant="ghost" className={base.small} onClick={onPaste}>
            Pegar desde Excel
          </Button>
        )}
        <Button className={base.small} onClick={onSchedule}>
          {isHunter ? "+ Agendar" : "+ Asignar"}
        </Button>
      </div>
    </div>
  );
}

function DayPills({
  days,
  day,
  onDay,
}: {
  readonly days: readonly string[];
  readonly day: string | null;
  readonly onDay: (day: string) => void;
}) {
  return (
    <div className={styles.pills} role="tablist">
      {days.map((date, index) => (
        <button
          key={date}
          type="button"
          role="tab"
          aria-selected={date === day}
          onClick={() => {
            onDay(date);
          }}
        >
          {WEEKDAYS[index]}
          <b>{Number(date.slice(8))}</b>
        </button>
      ))}
    </div>
  );
}

type OpenWindow =
  | { readonly kind: "schedule"; readonly start: ScheduleStart }
  | { readonly kind: "paste" }
  | { readonly kind: "contacts" }
  | null;

export interface AgendaTabProps {
  readonly who: Who;
  readonly myLeader: string | null;
  readonly place: AgendaPlace;
  readonly onPlace: (place: AgendaPlace) => void;
  readonly onOpen: (target: DetailTarget) => void;
  /** Something did not go through: the action opens on the list, to go on from there. */
  readonly onOpenAction: (id: string, pending: PendingList | null) => void;
}

function Missing({ data, onRetry }: { readonly data: AgendaData; readonly onRetry: () => void }) {
  if (!data.occupiedFailed && !data.extrasFailed) return null;
  return (
    <div className={base.notice} data-testid="agenda-missing">
      {data.occupiedFailed && "No se pudieron traer los horarios ocupados de los hunters. "}
      {data.extrasFailed && "No se pudieron traer las bandejas. "}
      <button type="button" className={base.link} onClick={onRetry}>
        Reintentar
      </button>
    </div>
  );
}

interface SettledView {
  readonly who: Who;
  readonly view: AgendaView;
  readonly data: AgendaData;
  readonly days: readonly string[];
  readonly day: string | null;
  readonly month: string;
  readonly hunter: string;
  readonly hunters: readonly string[];
  readonly onChooseHunter: (id: string) => void;
  readonly onSchedule: (start: ScheduleStart) => void;
  readonly onOpen: (id: string) => void;
}

function ViewOnScreen(props: SettledView) {
  const { who, view, data, days, day, month, hunter, hunters } = props;
  const { onChooseHunter, onSchedule, onOpen } = props;
  const isHunter = who.role === "hunter";
  if (view === "mes") {
    return (
      <AgendaMonth
        who={who}
        month={month}
        actions={data.actions}
        hunter={hunter}
        hunters={hunters}
        onChooseHunter={onChooseHunter}
        onOpen={onOpen}
      />
    );
  }
  if (hunters.length === 0 && (view === "equipo" || !isHunter)) return <NoHunters who={who} />;
  if (view === "equipo") {
    return (
      <AgendaTeamDay
        who={who}
        day={day ?? today()}
        data={data}
        hunters={hunters}
        onAssign={(chosen, date, time) => {
          onSchedule({ hunter: chosen, date, time });
        }}
        onOpen={onOpen}
      />
    );
  }
  return (
    <AgendaHours
      who={who}
      days={view === "dia" && day ? [day] : days}
      data={data}
      hunter={isHunter ? who.me : hunter}
      hunters={hunters}
      onChooseHunter={onChooseHunter}
      onTouch={(date, minutes) => {
        const time = timeFromMinutes(minutes);
        onSchedule({ date, time, ...(hunter && !isHunter ? { hunter } : {}) });
      }}
      onOpen={onOpen}
    />
  );
}

function shownHunterOf(place: AgendaPlace, view: AgendaView, who: Who, hunters: readonly string[]) {
  const isByHours = view === "sem" || view === "dia";
  return isByHours && who.role !== "hunter" ? place.hunter || (hunters[0] ?? "") : place.hunter;
}

function AgendaOnScreen({
  who,
  myLeader,
  place,
  onPlace,
  onOpen,
  onOpenAction,
  data,
  onRetry,
}: AgendaTabProps & { readonly data: AgendaData; readonly onRetry: () => void }) {
  const [window, setWindow] = useState<OpenWindow>(null);
  const view = viewOf(place, who.role);
  const days = daysShown(place, data.actions);
  const day = dayShown(place, view, days);
  const hunters = huntersListed(who, data);
  const hunter = shownHunterOf(place, view, who, hunters);
  // What the screen settled on stays once something else is touched.
  const settled: AgendaPlace = { ...place, hunter, day };
  const openHere = (target: DetailTarget) => {
    onPlace(settled);
    onOpen(target);
  };
  const close = () => {
    setWindow(null);
  };
  return (
    <div data-testid="agenda" data-view={view} data-month={monthShown(place)} data-day={day ?? ""}>
      <Toolbar
        who={who}
        view={view}
        title={titleOf(place, view, day, days)}
        onMove={(by) => {
          onPlace(moved(settled, view, by));
        }}
        onView={(next) => {
          if (next === view) return;
          saveView(next);
          onPlace(withView(settled, view, next));
        }}
        onSchedule={() => {
          setWindow({ kind: "schedule", start: {} });
        }}
        onPaste={() => {
          setWindow({ kind: "paste" });
        }}
      />
      <Missing data={data} onRetry={onRetry} />
      <AgendaTrays
        who={who}
        trays={traysOf(data.extras, {
          isHunter: who.role === "hunter",
          hunter: place.hunter,
          view,
        })}
        extras={data.extras}
        onOpen={(id, assign) => {
          openHere({ id, ...(assign ? { assign } : {}) });
        }}
        onContact={({ gestion_id: id, id: person }) => {
          openHere({ id, person });
        }}
        onSeeAllContacts={() => {
          setWindow({ kind: "contacts" });
        }}
      />
      {(view === "equipo" || view === "dia") && (
        <DayPills
          days={days}
          day={day}
          onDay={(date) => {
            onPlace({ ...settled, day: date });
          }}
        />
      )}
      <ViewOnScreen
        who={who}
        view={view}
        data={data}
        days={days}
        day={day}
        month={monthShown(place)}
        hunter={hunter}
        hunters={hunters}
        onChooseHunter={(chosen) => {
          onPlace({ ...settled, hunter: chosen });
        }}
        onSchedule={(start) => {
          setWindow({ kind: "schedule", start });
        }}
        onOpen={(id) => {
          openHere({ id });
        }}
      />
      {window?.kind === "schedule" && (
        <ScheduleWindow
          who={who}
          myLeader={myLeader}
          start={window.start}
          onClose={close}
          onSaved={(date) => {
            if (date) onPlace(atDate(settled, date));
          }}
          onOpenAction={(id, pending) => {
            close();
            onOpenAction(id, pending);
          }}
        />
      )}
      {window?.kind === "paste" && (
        <AgendaPasteWindow
          who={who}
          onClose={close}
          onAdded={(first) => {
            onPlace(atDate(settled, first));
          }}
        />
      )}
      {window?.kind === "contacts" && (
        <ContactListWindow
          extras={data.extras}
          onClose={close}
          onChoose={({ gestion_id: id, id: person }) => {
            close();
            openHere({ id, person });
          }}
        />
      )}
    </div>
  );
}

export function AgendaTab(props: AgendaTabProps) {
  const { who, place } = props;
  const view = viewOf(place, who.role);
  const { data, error, isPending, retry } = useAgendaData(who, rangeOf(place, view), view);
  if (isPending) return <Loading />;
  if (error || !data) return <ConnectionProblem cause={error} onRetry={retry} />;
  return <AgendaOnScreen {...props} data={data} onRetry={retry} />;
}
