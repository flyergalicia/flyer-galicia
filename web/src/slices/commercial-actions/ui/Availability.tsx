// Under the form: what that hunter has that day, what overlaps and, if it cannot be saved like this,
// who is free at that time. Each answer has its key, so a late one does not step on a newer one.
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useBackend } from "@/shared/supabase/index.ts";
import { readDayOccupancy, readHunterDay } from "../api/actions.ts";
import type { TakenTime } from "../api/rows.ts";
import { canAskDay } from "../model/action-form.ts";
import { overlaps } from "../model/formatting.ts";
import { HUNTER_DAY_KEY, takenText } from "../model/use-overlap-check.ts";
import { canForce, huntersOf, nameOf, type Who } from "../model/who.ts";
import styles from "./CommercialActions.module.css";

const MAX_FREE = 8;

export interface AvailabilityProps {
  readonly who: Who;
  /** The field of hunters of the window, if it has one. */
  readonly hunterField: string | null;
  /** Without that field: whose day it is. */
  readonly hunter: string | null;
  readonly date: string;
  readonly from: string;
  readonly to: string;
  readonly isDataList: boolean;
  /** The action being edited does not overlap with itself. */
  readonly exclude: string | null;
  readonly onChooseHunter: (id: string) => void;
}

function FreeHunters({
  who,
  date,
  from,
  to,
  hunter,
  onChooseHunter,
}: {
  readonly who: Who;
  readonly date: string;
  readonly from: string;
  readonly to: string;
  readonly hunter: string;
  readonly onChooseHunter: (id: string) => void;
}) {
  const backend = useBackend();
  const { data: occupied } = useQuery({
    queryKey: ["commercial-actions", "day-occupancy", date],
    gcTime: 0,
    staleTime: 0,
    queryFn: () => readDayOccupancy(backend, date),
  });
  // Not knowing is not the same as everybody being free (invariant 24).
  if (!occupied) return <div className={styles.free} />;
  const attempt = { hora_desde: from, hora_hasta: to || null };
  const free = huntersOf(who, who.role === "lider" && !who.isAdmin).filter(
    ({ id }) =>
      id !== hunter &&
      !occupied.some((taken) => taken.hunter_id === id && overlaps(taken, attempt)),
  );
  return (
    <div className={styles.free} data-testid="free-hunters">
      {free.length > 0 ? (
        <>
          <span className={styles.mini}>Libres a esa hora:</span>
          {free.slice(0, MAX_FREE).map(({ id }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                onChooseHunter(id);
              }}
            >
              {nameOf(who, id)}
            </button>
          ))}
        </>
      ) : (
        <span className={styles.mini}>Ningún hunter está libre a esa hora.</span>
      )}
    </div>
  );
}

function DayOfHunter({
  taken,
  attempt,
}: {
  readonly taken: readonly TakenTime[];
  readonly attempt: { readonly hora_desde: string | null; readonly hora_hasta: string | null };
}) {
  return (
    <>
      {taken.map((item, index) => {
        const crosses = overlaps(item, attempt);
        return (
          <span key={item.id}>
            {index > 0 && " · "}
            <span className={crosses ? styles.overlapping : undefined}>
              {takenText(item)}
              {crosses ? " (se pisa)" : ""}
            </span>
          </span>
        );
      })}
    </>
  );
}

function hunterOfForm({ who, hunterField, hunter }: AvailabilityProps): string {
  return hunterField ?? (hunter || who.me);
}

function NothingThatDay({ who, hunter }: { readonly who: Who; readonly hunter: string }) {
  return hunter === who.me
    ? "Ese día no tenés nada agendado."
    : `${nameOf(who, hunter)} no tiene nada agendado ese día.`;
}

export function Availability(props: AvailabilityProps) {
  const { who, hunterField, date, from, to, isDataList, exclude, onChooseHunter } = props;
  const backend = useBackend();
  const hunter = hunterOfForm(props);
  const isOn = canAskDay(hunter, date, isDataList);
  const { data, isError } = useQuery({
    queryKey: [...HUNTER_DAY_KEY, hunter, date],
    enabled: isOn,
    gcTime: 0,
    staleTime: 0,
    placeholderData: keepPreviousData,
    queryFn: () => readHunterDay(backend, hunter, date),
  });
  if (!isOn || isError || !data) return null;
  const attempt = { hora_desde: from || null, hora_hasta: to || null };
  const taken = data.filter(({ id, tipo }) => id !== exclude && tipo !== "datos");
  const crosses = taken.some((item) => overlaps(item, attempt));
  const isStopped = crosses && !canForce(who, hunter);
  const hasField = hunterField !== null;
  return (
    <div className={`${styles.full} ${styles.availability}`} data-testid="hunter-day">
      {taken.length > 0 ? (
        <>
          <b>{hunter === who.me ? "Ese día tenés" : `${nameOf(who, hunter)} ese día tiene`}:</b>{" "}
          <DayOfHunter taken={taken} attempt={attempt} />
        </>
      ) : (
        <NothingThatDay who={who} hunter={hunter} />
      )}
      {crosses && (
        <div className={styles.overlapping}>
          {isStopped
            ? `Así no se puede guardar: cambiá el horario${hasField ? " o elegí otro hunter" : ""}.`
            : "Como líder podés guardar igual, pero el hunter va a tener dos cosas a la vez."}
        </div>
      )}
      {isStopped && hasField && from ? (
        <FreeHunters
          who={who}
          date={date}
          from={from}
          to={to}
          hunter={hunter}
          onChooseHunter={onChooseHunter}
        />
      ) : (
        <div className={styles.free} />
      )}
    </div>
  );
}
