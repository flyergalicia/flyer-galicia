// A day of the calendar by hours, with its blocks at the time they go. Touching a free spot says at
// which time: what is hidden does not open anything, so touching it asks for that same time.
import type { MouseEvent } from "react";
import {
  frameOf,
  type HourBand,
  HOUR_HEIGHT,
  minutesAtTouch,
  placedBlocks,
} from "../model/agenda-grid.ts";
import { shortTime } from "../model/agenda-dates.ts";
import { ACTION_TYPES, labelOf } from "../model/labels.ts";
import styles from "./Agenda.module.css";

const HIDDEN_TITLE = "Ocupado: ya tiene algo a esa hora";
const TOUCH_TITLE = "Tocá un hueco libre para asignar algo a esa hora";

export interface HourItem {
  readonly id: string;
  readonly tipo: string;
  readonly empresa: string | null;
  readonly hora_desde: string | null;
  readonly hora_hasta: string | null;
  /** Taken with a company whoever looks cannot see. */
  readonly isHidden: boolean;
  readonly estado?: string;
  readonly lugar?: string | null;
  readonly no_puede_at?: string | null;
}

const STATE_CLASS: Readonly<Record<string, string | undefined>> = {
  realizada: styles.blockDone,
  cancelada: styles.blockCancelled,
};

function blockClass({ isHidden, estado, no_puede_at: cannot }: HourItem): string {
  const classes = [styles.block];
  if (isHidden) classes.push(styles.blockHidden);
  else classes.push(STATE_CLASS[estado ?? ""] ?? "");
  if (cannot && estado === "planificada") classes.push(styles.blockCannot);
  return classes.filter(Boolean).join(" ");
}

function titleOfBlock({ isHidden, tipo, empresa, lugar }: HourItem): string {
  if (isHidden) return HIDDEN_TITLE;
  return `${labelOf(ACTION_TYPES, tipo)} · ${empresa ?? ""}${lugar ? ` · ${lugar}` : ""}`;
}

function BlockBody({ item }: { readonly item: HourItem }) {
  return (
    <>
      <span className={styles.blockTime}>{shortTime(item)}</span>
      <span className={styles.blockCompany}>
        {item.isHidden ? "Ocupado" : (item.empresa ?? "")}
      </span>
    </>
  );
}

interface HourColumnProps {
  readonly day: string;
  readonly items: readonly HourItem[];
  readonly band: HourBand;
  readonly onTouch: (day: string, minutes: number) => void;
  /** Without it, the blocks are only for looking. */
  readonly onOpen?: (id: string) => void;
}

export function HourColumn({ day, items, band, onTouch, onOpen }: HourColumnProps) {
  const touch = ({ currentTarget, clientY }: MouseEvent<HTMLDivElement>) => {
    const { top, height } = currentTarget.getBoundingClientRect();
    onTouch(day, minutesAtTouch(clientY - top, height, band.first));
  };
  return (
    <div
      className={styles.hourColumn}
      data-testid="agenda-day"
      data-day={day}
      style={{ height: (band.last - band.first) * HOUR_HEIGHT }}
      role="presentation"
      title={TOUCH_TITLE}
      onClick={touch}
    >
      {placedBlocks(items).map((block) => {
        const { item } = block;
        const { top, height, left, width } = frameOf(block, band.first);
        const style = { top, height, left: `${String(left)}%`, width: `${String(width)}%` };
        if (item.isHidden || !onOpen) {
          return (
            <span
              key={item.id}
              className={blockClass(item)}
              data-taken={item.isHidden}
              data-testid="agenda-block"
              style={style}
              title={titleOfBlock(item)}
            >
              <BlockBody item={item} />
            </span>
          );
        }
        return (
          <button
            key={item.id}
            type="button"
            className={blockClass(item)}
            data-testid="agenda-block"
            style={style}
            title={titleOfBlock(item)}
            onClick={(event) => {
              event.stopPropagation();
              onOpen(item.id);
            }}
          >
            <BlockBody item={item} />
          </button>
        );
      })}
    </div>
  );
}
