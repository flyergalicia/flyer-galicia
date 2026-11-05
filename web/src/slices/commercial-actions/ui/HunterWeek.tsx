// "Ver cómo tiene la agenda", inside the windows that give a hunter something to do: their week by
// hours. Touching a free spot fills the day and the time, without losing what was written. A hunter
// sees their own: the database does not answer them what the others have.
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useBackend } from "@/shared/supabase/index.ts";
import { readHunterWeek, type WeekBlock } from "../api/agenda.ts";
import { canAskDay, TO_LEADER } from "../model/action-form.ts";
import { daysOfWeek, mondayOf } from "../model/agenda-dates.ts";
import { anHourLater, timeFromMinutes } from "../model/agenda-grid.ts";
import { addDays, minutesOf } from "../model/formatting.ts";
import { nameOf, type Who } from "../model/who.ts";
import { HoursGrid } from "./HoursGrid.tsx";
import base from "./CommercialActions.module.css";
import styles from "./Agenda.module.css";

const DAYS_PER_WEEK = 7;

export interface HunterWeekProps {
  readonly who: Who;
  /** The field of hunters of the window, if it has one. */
  readonly hunterField: string | null;
  /** Without that field: whose day it is. */
  readonly hunter: string | null;
  readonly date: string;
  readonly isDataList: boolean;
  /** The action being edited. */
  readonly exclude: string | null;
  readonly onTouch: (date: string, from: string, to: string) => void;
}

interface Asked {
  readonly hunter: string;
  readonly date: string;
}

function ownerOf({ who, hunterField, hunter }: HunterWeekProps): string | null {
  const owner = who.role === "hunter" ? who.me : (hunterField ?? hunter);
  return owner && owner !== TO_LEADER ? owner : null;
}

function asItem(block: WeekBlock) {
  return { ...block, isHidden: !block.empresa };
}

/** While the window has nothing to ask (no hunter chosen, a data list), it keeps what it showed. */
function useWhatToAsk(props: HunterWeekProps): Asked | null {
  const { who, hunterField, hunter, date, isDataList } = props;
  const [asked, setAsked] = useState<Asked | null>(null);
  if (!canAskDay(hunterField ?? (hunter || who.me), date, isDataList)) return asked;
  const owner = ownerOf(props);
  const wanted = owner ? { hunter: owner, date } : null;
  if (wanted?.hunter !== asked?.hunter || wanted?.date !== asked?.date) setAsked(wanted);
  return wanted;
}

export function HunterWeek(props: HunterWeekProps) {
  const { who, exclude, onTouch } = props;
  const backend = useBackend();
  const asked = useWhatToAsk(props);
  const isOwn = who.role === "hunter";
  const owner = asked?.hunter ?? "";
  const monday = mondayOf(asked?.date ?? "");
  const { data } = useQuery({
    queryKey: ["commercial-actions", "hunter-week", owner, monday, isOwn],
    enabled: asked !== null,
    gcTime: 0,
    staleTime: 0,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const range = { from: monday, to: addDays(monday, DAYS_PER_WEEK - 1) };
      const blocks = await readHunterWeek(backend, range, owner, isOwn);
      return { owner, monday, blocks };
    },
  });
  if (!asked || !data) return null;
  const items = data.blocks
    .filter(
      ({ hunter_id: id, id: action, tipo, hora_desde: from }) =>
        id === data.owner && action !== exclude && tipo !== "datos" && minutesOf(from) !== null,
    )
    .map((block) => asItem(block));
  return (
    <div className={`${base.full} ${styles.week}`} data-testid="hunter-week">
      <div className={styles.weekTitle}>
        <b data-testid="hunter-week-title">
          {isOwn ? "Tu semana" : `La semana de ${nameOf(who, data.owner)}`}
        </b>
        <span className={base.mini}>Tocá un hueco libre y se completan el día y el horario.</span>
      </div>
      <HoursGrid
        className={styles.hoursMini}
        testId="hunter-week-grid"
        days={daysOfWeek(data.monday)}
        isMarked={(day) => day === asked.date}
        markClass={styles.hoursDayOn}
        items={items}
        onTouch={(touched, minutes) => {
          const from = timeFromMinutes(minutes);
          onTouch(touched, from, anHourLater(from));
        }}
      />
    </div>
  );
}
