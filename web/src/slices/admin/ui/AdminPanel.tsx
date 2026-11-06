import { type ComponentType, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePendingAccounts } from "@/shared/lib/app-config/pending-accounts-query.ts";
import type { MenuWindowProps } from "@/shared/lib/view-props.ts";
import { Tabs } from "@/shared/ui/index.ts";
import { useDialog } from "@/shared/ui/modal/use-dialog.ts";
import { useRegistryWork } from "@/slices/company-registry/index.ts";
import {
  goToPillar,
  goToSheet,
  type PanelPlace,
  PILLARS,
  pillarOf,
  rememberedPlace,
  rememberPlace,
  type SheetId,
  SHEETS,
} from "../model/panel.ts";
import { AuditSheet } from "./AuditSheet.tsx";
import { CompanyLogSheet } from "./CompanyLogSheet.tsx";
import { DashboardSheet } from "./DashboardSheet.tsx";
import { FacultiesSheet } from "./FacultiesSheet.tsx";
import { FlyerSheet } from "./FlyerSheet.tsx";
import { OtherPeopleSheet } from "./OtherPeopleSheet.tsx";
import { RegistrosSheet } from "./RegistrosSheet.tsx";
import { AdvisorsSheet, CompaniesSheet, PendingSheet } from "./RegistrySheets.tsx";
import type { SheetProps } from "./SheetProps.ts";
import { UsageSheet } from "./UsageSheet.tsx";
import { UsersSheet } from "./UsersSheet.tsx";
import styles from "./Panel.module.css";

const SLIDE_MS = 320;

/** What each sheet shows. Parts 2 and 3 of the panel replace the pending ones of Config. */
const SHEET_VIEWS: Readonly<Record<SheetId, ComponentType<SheetProps>>> = {
  dashboard: DashboardSheet,
  usuarios: UsersSheet,
  registros: RegistrosSheet,
  uso: UsageSheet,
  facultades: FacultiesSheet,
  auditoria: AuditSheet,
  varios: CompaniesSheet,
  asesores: AdvisorsSheet,
  padronotros: OtherPeopleSheet,
  padronlog: CompanyLogSheet,
  subir: FlyerSheet,
  cashback: PendingSheet,
  legales: PendingSheet,
  opciones: PendingSheet,
  vigiladas: PendingSheet,
};

function useSlide(onClose: () => void) {
  const [shown, setShown] = useState(false);
  const leaving = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setShown(true);
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer.current);
    };
  }, []);
  const slideOut = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    setShown(false);
    timer.current = setTimeout(onClose, SLIDE_MS);
  }, [onClose]);
  return { shown, slideOut };
}

function SheetTabs({
  place,
  onChoose,
}: {
  readonly place: PanelPlace;
  readonly onChoose: (place: PanelPlace) => void;
}) {
  const current = pillarOf(place.sheet);
  return PILLARS.map(([pillar, name]) => (
    <div key={pillar} className={styles.sheets} hidden={pillar !== current} data-sheets-of={name}>
      <Tabs
        value={place.sheet}
        variant="pills"
        onChange={(sheet) => {
          onChoose(goToSheet(place, sheet));
        }}
      >
        <Tabs.List label={`Hojas de ${name}`}>
          {SHEETS[pillar].map(([sheet, label]) => (
            <Tabs.Tab key={sheet} value={sheet}>
              {label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>
    </div>
  ));
}

/** ⚙ Admin: the panel of the administrator, in three pillars. It opens where it was left. */
export function AdminPanel({ onClose }: MenuWindowProps) {
  const [place, setPlace] = useState(rememberedPlace);
  const pending = usePendingAccounts();
  const work = useRegistryWork();
  const { leave } = work;
  const { shown, slideOut } = useSlide(onClose);
  const panel = useRef<HTMLDialogElement>(null);

  const closePanel = useCallback(
    (then?: () => void) => {
      leave(() => {
        then?.();
        slideOut();
      });
    },
    [leave, slideOut],
  );
  const closeWithKeyboard = useCallback(() => {
    closePanel();
  }, [closePanel]);
  useDialog(panel, closeWithKeyboard);

  const choose = (next: PanelPlace) => {
    rememberPlace(next);
    setPlace(next);
  };
  const Sheet = SHEET_VIEWS[place.sheet];

  return createPortal(
    <>
      <button
        type="button"
        tabIndex={-1}
        aria-label="Cerrar el panel"
        className={shown ? `${styles.backdrop} ${styles.shown}` : styles.backdrop}
        onClick={() => {
          closePanel();
        }}
      />
      <dialog
        ref={panel}
        open
        aria-modal="true"
        aria-label="Panel Administrador"
        tabIndex={-1}
        className={shown ? `${styles.panel} ${styles.shown}` : styles.panel}
        data-testid="admin-panel"
      >
        <div className={styles.header}>
          <h2 className={styles.title}>⚙ Panel Administrador</h2>
          <button
            type="button"
            className={styles.close}
            aria-label="Cerrar"
            onClick={() => {
              closePanel();
            }}
          >
            ✕
          </button>
        </div>
        <Tabs
          value={pillarOf(place.sheet)}
          variant="underline"
          onChange={(pillar) => {
            choose(goToPillar(place, pillar));
          }}
        >
          <Tabs.List label="Pilares del panel">
            {PILLARS.map(([pillar, name]) => (
              <Tabs.Tab key={pillar} value={pillar} dot={pillar === "admin" && pending > 0}>
                {name}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>
        <SheetTabs place={place} onChoose={choose} />
        <div className={styles.body} data-sheet={place.sheet}>
          <Sheet work={work} closePanel={closePanel} />
        </div>
        {work.question}
      </dialog>
    </>,
    document.body,
  );
}
