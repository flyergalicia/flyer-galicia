import { useEffect, useRef, useState } from "react";
import { MENU_CLOSED, usePlaceRequests } from "@/shared/lib/places/place-desk.ts";
import { Icon } from "@/shared/ui/index.ts";
import styles from "./HunterView.module.css";

/** The board of Beneficios Haberes opens apart: it cannot go inside this page. */
export const BENEFITS_BOARD_URL =
  "https://app.powerbi.com/groups/b5dbdf80-3bb7-4a0e-9f78-1a9cd8dc26c1/reports/a60e3ec9-1933-41ba-a817-45877a061d72/ReportSection?experience=power-bi";

/** It hangs from a head that stays in place, so it opens over what is below and closes outside. */
export function OtherMenu({ onMultiple }: { readonly onMultiple: () => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // The tutorial opens it for its step, and closes it for the others (`_hunOtrosOpen`).
  usePlaceRequests("hunter-others", (place) => {
    setOpen(place !== MENU_CLOSED);
  });
  useEffect(() => {
    if (!open) return undefined;
    const onKey = ({ key }: KeyboardEvent) => {
      if (key === "Escape") setOpen(false);
    };
    const onClick = ({ target }: MouseEvent) => {
      if (target instanceof Node && !box.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
    };
  }, [open]);
  return (
    <div ref={box} className={styles.others} data-testid="hunter-others">
      <button
        type="button"
        className={styles.othersToggle}
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        Otros{" "}
        <span className={styles.othersCaret} aria-hidden="true">
          ▾
        </span>
      </button>
      <div className={styles.othersMenu} hidden={!open}>
        <a
          className={styles.othersItem}
          href={BENEFITS_BOARD_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Icon name="chart" className={styles.othersIcon} /> Beneficios Haberes
        </a>
        <button
          type="button"
          className={styles.othersItem}
          onClick={() => {
            setOpen(false);
            onMultiple();
          }}
        >
          <Icon name="grid" className={styles.othersIcon} /> Descarga múltiple
        </button>
      </div>
    </div>
  );
}
