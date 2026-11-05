import { useEffect, useRef, useState } from "react";
import { Button, Icon, useShortcutTip } from "@/shared/ui/index.ts";
import { useIsPhone } from "../model/use-is-phone.ts";
import type { DownloadKind } from "../model/use-flyer-download.ts";
import { BranchesSwitch } from "./BranchesSwitch.tsx";
import styles from "./FlyerForm.module.css";

interface FlyerActionsProps {
  readonly busy: boolean;
  readonly sharing: boolean;
  readonly canShare: boolean;
  readonly onPreview: () => void;
  readonly onDownload: (kind: DownloadKind) => void;
  readonly onShare: () => void;
  readonly onRestore: () => void;
}

const SHARE_LABEL = "Compartir el PDF (WhatsApp, mail, Teams)";

type OtherActionsProps = Pick<
  FlyerActionsProps,
  "sharing" | "canShare" | "onDownload" | "onShare"
> & { readonly isDocked: boolean };

/** What is hardly used: the menu Otros. On a computer it opens upward, over the fixed bar. */
function OtherActions({ isDocked, sharing, canShare, onDownload, onShare }: OtherActionsProps) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = ({ key }: KeyboardEvent) => {
      if (key === "Escape") setOpen(false);
    };
    const onClick = ({ target }: MouseEvent) => {
      if (isDocked && target instanceof Node && !box.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick, true);
    };
  }, [isDocked, open]);
  const onAction = (action: () => void) => () => {
    if (isDocked) setOpen(false);
    action();
  };
  return (
    <div ref={box} className={styles.others} data-testid="other-actions">
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
        {canShare && (
          <button
            type="button"
            className={styles.othersItem}
            disabled={sharing}
            onClick={onAction(onShare)}
          >
            {sharing ? (
              "Un momento…"
            ) : (
              <>
                <Icon name="share" className={styles.othersIcon} /> {SHARE_LABEL}
              </>
            )}
          </button>
        )}
        <button
          type="button"
          className={styles.othersItem}
          onClick={onAction(() => {
            onDownload("png");
          })}
        >
          <Icon name="image" className={styles.othersIcon} /> Descargar como imagen (PNG)
        </button>
        <BranchesSwitch
          onTurnedOn={() => {
            setOpen(false);
          }}
        />
      </div>
    </div>
  );
}

function PreviewButton({ onPreview }: Pick<FlyerActionsProps, "onPreview">) {
  return (
    <Button variant="blue" icon="eye" onClick={onPreview}>
      Vista previa
    </Button>
  );
}

function DownloadButton({ busy, onDownload }: Pick<FlyerActionsProps, "busy" | "onDownload">) {
  const tip = useShortcutTip("Enter");
  return (
    <>
      <Button
        {...(busy ? {} : { icon: "download" as const })}
        {...tip.target}
        busy={busy}
        data-testid="download-pdf"
        className={styles.downloadButton}
        onClick={() => {
          onDownload("pdf");
        }}
      >
        {busy ? "Un momento…" : "Descargar PDF"}
      </Button>
      {tip.element}
    </>
  );
}

function RestoreButton({ onRestore }: Pick<FlyerActionsProps, "onRestore">) {
  return (
    <Button variant="ghost" icon="restore" onClick={onRestore}>
      Restaurar
    </Button>
  );
}

/**
 * On a computer, what is used all the time stays in sight on a bar at the foot of the panel, and
 * Restaurar is left at the end of the form: it erases it, and it is better away from the PDF. On a
 * phone they go in a column, because there is the pill.
 */
export function FlyerActions({
  busy,
  sharing,
  canShare,
  onPreview,
  onDownload,
  onShare,
  onRestore,
}: FlyerActionsProps) {
  const isPhone = useIsPhone();
  const others = (
    <OtherActions
      isDocked={!isPhone}
      sharing={sharing}
      canShare={canShare}
      onDownload={onDownload}
      onShare={onShare}
    />
  );
  if (isPhone) {
    return (
      <div className={styles.buttons}>
        <PreviewButton onPreview={onPreview} />
        <DownloadButton busy={busy} onDownload={onDownload} />
        <RestoreButton onRestore={onRestore} />
        {others}
      </div>
    );
  }
  return (
    <>
      <div className={styles.buttons}>
        <RestoreButton onRestore={onRestore} />
      </div>
      <div className={styles.dock} data-testid="flyer-dock">
        <PreviewButton onPreview={onPreview} />
        <DownloadButton busy={busy} onDownload={onDownload} />
        {others}
      </div>
    </>
  );
}
