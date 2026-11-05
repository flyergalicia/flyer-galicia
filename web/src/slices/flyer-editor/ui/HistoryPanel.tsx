import { type CSSProperties, useState } from "react";
import { optionColor, optionLabel, optionNumber } from "@/shared/domain/flyer-options.ts";
import { useFlyerOptions } from "@/shared/lib/app-config/flyer-options-query.ts";
import { useFlyerWorkspace } from "@/shared/lib/flyer-workspace/index.ts";
import { Button, ConfirmDialog, Icon } from "@/shared/ui/index.ts";
import { uploadedLogoName, uploadedLogosIn } from "@/slices/logo-editor/index.ts";
import { whenOf } from "../model/flyer-history.ts";
import { useFlyerHistory, useHistoryItems } from "../model/history-context.ts";
import type { HistoryItem } from "../model/stored-flyer.ts";
import styles from "./HistoryPanel.module.css";

interface HistoryPanelProps {
  readonly onLoad: (item: HistoryItem) => void;
  readonly onDownload: (item: HistoryItem) => void;
  readonly onBackToForm: () => void;
}

function colorStyle(color: string): CSSProperties {
  const style: CSSProperties & { readonly "--option-color": string } = { "--option-color": color };
  return style;
}

function NoFlyers({ onBackToForm }: Pick<HistoryPanelProps, "onBackToForm">) {
  return (
    <div className={styles.empty}>
      <span className={styles.emptyIcon}>
        <Icon name="clock" size={20} />
      </span>
      <strong>Todavía no hay flyers en tu historial</strong>
      <span>Armá uno en Individual y queda guardado acá.</span>
      <Button size="sm" onClick={onBackToForm}>
        Ir a Individual
      </Button>
    </div>
  );
}

/** A logo uploaded from the PC does not survive a reload: in its place comes the one of the flyer. */
function MissingLogosQuestion({
  logos,
  onCancel,
  onGoAhead,
}: {
  readonly logos: readonly string[];
  readonly onCancel: () => void;
  readonly onGoAhead: () => void;
}) {
  const [first = ""] = logos;
  const isOne = logos.length === 1;
  return (
    <ConfirmDialog
      title={
        isOne
          ? "Falta un logo subido de la PC"
          : `Faltan ${String(logos.length)} logos subidos de la PC`
      }
      confirmLabel="Descargar igual"
      onCancel={onCancel}
      onConfirm={onGoAhead}
    >
      Ese flyer llevaba{" "}
      {isOne ? `el logo «${uploadedLogoName(first)}»` : `${String(logos.length)} logos`} subido
      {isOne ? "" : "s"} de la PC, que se perdió al recargar la página. Si lo bajás ahora, en su
      lugar sale el logo original del flyer.
    </ConfirmDialog>
  );
}

function HistoryRow({
  item,
  position,
  onLoad,
  onDownload,
}: {
  readonly item: HistoryItem;
  readonly position: number;
  readonly onLoad: (item: HistoryItem) => void;
  readonly onDownload: (item: HistoryItem) => void;
}) {
  const history = useFlyerHistory();
  const { options } = useFlyerOptions();
  const option = optionNumber(options, item.opt || 1);
  const color = optionColor(options, option);
  return (
    <div className={styles.row} style={colorStyle(color)} data-testid="history-row">
      <button
        type="button"
        className={styles.rowPress}
        aria-label={`Cargar ${item.v.empresa || item.fn}`}
        onClick={() => {
          onLoad(item);
        }}
      />
      <img className={styles.thumbnail} src={item.thumb || undefined} alt="" />
      <div className={styles.info}>
        <strong>{item.v.empresa}</strong>
        <span className={styles.detail}>
          {item.fn} · {whenOf(item)}
        </span>
        <div className={styles.badgeLine}>
          <span className={styles.badge} title={optionLabel(options, option)}>
            OP.{option}
          </span>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            onClick={() => {
              onDownload(item);
            }}
          >
            ⬇ PDF
          </button>
          <button
            type="button"
            onClick={() => {
              onLoad(item);
            }}
          >
            ✎ Editar
          </button>
        </div>
      </div>
      <button
        type="button"
        className={styles.remove}
        aria-label={`Quitar ${item.v.empresa || item.fn} del historial`}
        onClick={() => {
          history.remove(position);
        }}
      >
        ✕
      </button>
    </div>
  );
}

/** The flyers that came out, last one first. Each one comes back or comes down again as it was. */
export function HistoryPanel({ onLoad, onDownload, onBackToForm }: HistoryPanelProps) {
  const items = useHistoryItems();
  const workspace = useFlyerWorkspace();
  const [asking, setAsking] = useState<{
    readonly item: HistoryItem;
    readonly logos: readonly string[];
  } | null>(null);
  if (items.length === 0) return <NoFlyers onBackToForm={onBackToForm} />;
  const downloadAsking = (item: HistoryItem) => {
    const missing = workspace.logos.missingUploads(uploadedLogosIn(item.v.logos ?? []));
    if (missing.length > 0) setAsking({ item, logos: missing });
    else onDownload(item);
  };
  return (
    <div data-testid="history-list">
      {items.map((item, position) => (
        <HistoryRow
          key={`${String(item.ts)}-${item.fn}-${String(position)}`}
          item={item}
          position={position}
          onLoad={onLoad}
          onDownload={downloadAsking}
        />
      ))}
      {asking && (
        <MissingLogosQuestion
          logos={asking.logos}
          onCancel={() => {
            setAsking(null);
          }}
          onGoAhead={() => {
            setAsking(null);
            onDownload(asking.item);
          }}
        />
      )}
    </div>
  );
}
