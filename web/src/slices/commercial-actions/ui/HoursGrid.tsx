// The calendar by hours: one column per day and the hours beside them.
import type { CSSProperties, ReactNode } from "react";
import { WEEKDAYS, weekdayOf } from "../model/agenda-dates.ts";
import { hourBand, HOUR_HEIGHT, hourLabel } from "../model/agenda-grid.ts";
import { HourColumn, type HourItem } from "./HourColumn.tsx";
import styles from "./Agenda.module.css";

export type PlacedHourItem = HourItem & { readonly fecha: string };

interface HoursGridProps {
  readonly className: string | undefined;
  readonly testId?: string;
  readonly days: readonly string[];
  readonly isMarked: (day: string) => boolean;
  readonly markClass: string | undefined;
  readonly items: readonly PlacedHourItem[];
  /** A row over the hours: what has no time. */
  readonly over?: ReactNode;
  readonly onTouch: (day: string, minutes: number) => void;
  readonly onOpen?: (id: string) => void;
}

export function HoursGrid({
  className,
  testId,
  days,
  isMarked,
  markClass,
  items,
  over,
  onTouch,
  onOpen,
}: HoursGridProps) {
  const band = hourBand(items);
  const hours = Array.from({ length: band.last - band.first }, (_, index) => band.first + index);
  const count: CSSProperties & { readonly "--n": number } = { "--n": days.length };
  return (
    <div
      className={[styles.hours, className].join(" ")}
      style={count}
      data-testid={testId}
      data-slides="calendar"
    >
      <div className={styles.hoursInner}>
        <div className={styles.hoursHead}>
          <div />
          {days.map((day) => (
            <div
              key={day}
              className={[styles.hoursDay, isMarked(day) && markClass].filter(Boolean).join(" ")}
              data-testid="agenda-day-head"
            >
              {WEEKDAYS[weekdayOf(day)]} <b>{Number(day.slice(8))}</b>
            </div>
          ))}
        </div>
        {over}
        <div className={styles.hoursBody}>
          <div className={styles.hoursMarks}>
            {hours.map((hour) => (
              <div key={hour} className={styles.hoursMark} style={{ height: HOUR_HEIGHT }}>
                <span>{hourLabel(hour)}</span>
              </div>
            ))}
          </div>
          <div className={styles.hoursColumns}>
            {days.map((day) => (
              <HourColumn
                key={day}
                day={day}
                items={items.filter(({ fecha }) => fecha === day)}
                band={band}
                onTouch={onTouch}
                {...(onOpen ? { onOpen } : {})}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
