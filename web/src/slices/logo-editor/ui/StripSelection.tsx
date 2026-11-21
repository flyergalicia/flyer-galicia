import { useEffect, useRef, useSyncExternalStore } from "react";
import { promotionOfLogo } from "@/shared/domain/promotions/index.ts";
import { usePromotionLogoSource } from "@/shared/lib/promotions/logo-file.ts";
import type { BrandPicker } from "../model/brand-picker.ts";
import { attachRowDrag } from "../model/strip-row-drag.ts";
import {
  chosenOf,
  movedBy,
  removedAt,
  rowTouched,
  toggledInGroup,
} from "../model/strip-selection.ts";
import type { StripSession } from "../model/strip-session.ts";
import type { StripPick } from "../model/strip-types.ts";
import styles from "./StripWindow.module.css";

interface RowProps {
  readonly session: StripSession;
  readonly picker: BrandPicker;
  readonly pick: StripPick;
  readonly index: number;
  readonly total: number;
  readonly isChosen: boolean;
}

function SelectionRow({ session, picker, pick, index, total, isChosen }: RowProps) {
  const logoSource = usePromotionLogoSource();
  const hasPercent = picker.supermarkets.hasPercentDiscount(
    promotionOfLogo(picker.shown, pick.img),
    picker.zone,
  );
  return (
    <div
      className={styles.row}
      data-strip-row=""
      data-index={index}
      data-chosen={isChosen || undefined}
      data-testid="strip-row"
      title="Tocala para marcar el logo en la vista previa (con Shift, varios)"
    >
      <span
        className={styles.handle}
        data-strip-handle=""
        data-testid="strip-row-handle"
        aria-hidden="true"
        title="Mantené apretado y arrastrá para cambiar el orden"
      >
        ⠿
      </span>
      <b data-part="number">{index + 1}</b>
      <span className={styles.mini}>
        <img alt="" decoding="async" src={logoSource(pick.img)} />
        {hasPercent && <span className={styles.miniDot} data-testid="percent-dot" />}
      </span>
      <span className={styles.rowTitle} data-part="title">
        {pick.t}
      </span>
      {pick.sug && (
        <span className={styles.suggestedMark} data-part="suggested" title="Sugerida por la app">
          ✨
        </span>
      )}
      <button
        type="button"
        aria-label="Subir"
        disabled={index === 0}
        onClick={() => {
          session.change((choice) => movedBy(choice, index, -1));
        }}
      >
        ↑
      </button>
      <button
        type="button"
        aria-label="Bajar"
        disabled={index === total - 1}
        onClick={() => {
          session.change((choice) => movedBy(choice, index, 1));
        }}
      >
        ↓
      </button>
      <button
        type="button"
        aria-label="Quitar"
        onClick={() => {
          session.change((choice) => removedAt(choice, index));
        }}
      >
        ×
      </button>
    </div>
  );
}

function useRowGestures(session: StripSession) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = list.current;
    if (!element) return undefined;
    const { justDropped, detach } = attachRowDrag(element, session, {
      line: styles.dropLine ?? "",
      lifted: styles.lifted ?? "",
      ordering: styles.ordering ?? "",
    });
    // Touching a row marks its logo on the preview, unless it was just dragged.
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || event.target.closest("button")) return;
      const row = event.target.closest<HTMLElement>("[data-strip-row]");
      if (!row || justDropped()) return;
      const index = Number(row.dataset["index"]);
      session.change((choice) =>
        event.shiftKey ? toggledInGroup(choice, index) : rowTouched(choice, index),
      );
    };
    element.addEventListener("click", onClick);
    return () => {
      element.removeEventListener("click", onClick);
      detach();
    };
  }, [session]);
  return list;
}

export function StripSelection({
  session,
  picker,
}: {
  readonly session: StripSession;
  readonly picker: BrandPicker;
}) {
  const list = useRowGestures(session);
  const selection = useSyncExternalStore(session.subscribe, () => session.getState().selection);
  const marked = useSyncExternalStore(session.subscribe, () => session.getState().marked);
  const group = useSyncExternalStore(session.subscribe, () => session.getState().group);
  const chosen = chosenOf({ selection, marked, group });

  // The row of the logo marked on the preview comes into sight.
  useEffect(() => {
    if (marked < 0) return;
    list.current
      ?.querySelector(`[data-strip-row][data-index="${String(marked)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [list, marked]);

  return (
    <div ref={list} className={styles.selection} data-testid="strip-selection">
      {selection.length === 0 && (
        <div className={styles.selectionEmpty}>
          Tildá marcas a la izquierda. El orden en que las tildás es el orden en el flyer.
        </div>
      )}
      {selection.map((pick, index) => (
        <SelectionRow
          key={pick.img}
          session={session}
          picker={picker}
          pick={pick}
          index={index}
          total={selection.length}
          isChosen={chosen.includes(index)}
        />
      ))}
    </div>
  );
}
