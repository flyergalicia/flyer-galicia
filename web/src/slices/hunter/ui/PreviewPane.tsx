import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { Button, useShortcutTip, ZoomControls } from "@/shared/ui/index.ts";
import { attachPictureZoom, type PictureZoom } from "../model/picture-zoom.ts";
import type { PreviewMessage, PreviewState } from "../model/use-company-preview.ts";
import { OtherMenu } from "./OtherMenu.tsx";
import styles from "./HunterView.module.css";

function Message({ message: { title, detail } }: { readonly message: PreviewMessage }) {
  return (
    <div className={styles.message} data-testid="hunter-preview-message">
      {title !== undefined && (
        <>
          <strong>{title}</strong>
          <br />
        </>
      )}
      {detail}
    </div>
  );
}

interface PreviewPaneProps {
  readonly state: PreviewState;
  /** It gives the place of the zoom, which a new company takes back to 100%. */
  readonly zoomRef: RefObject<PictureZoom | null>;
  readonly onDownload: () => void;
  readonly onMultiple: () => void;
  /** What Gestiones adds to the head: "Registrar gestión". */
  readonly action?: ReactNode;
}

export function PreviewPane({ state, zoomRef, onDownload, onMultiple, action }: PreviewPaneProps) {
  const { show } = useToast();
  const pane = useRef<HTMLDivElement>(null);
  const picture = useRef<HTMLImageElement>(null);
  const [percent, setPercent] = useState(100);
  const tip = useShortcutTip("Enter");
  useEffect(() => {
    if (!pane.current || !picture.current) return undefined;
    const zoom = attachPictureZoom({
      pane: pane.current,
      picture: picture.current,
      onPercent: setPercent,
      onTip: (text) => {
        show(text);
      },
    });
    zoomRef.current = zoom;
    return () => {
      zoomRef.current = null;
      zoom.detach();
    };
  }, [show, zoomRef]);
  const shown = state.kind === "shown" ? state.flyer : null;
  return (
    <div ref={pane} className={styles.preview} data-testid="hunter-preview">
      <div className={styles.head} data-preview-head="">
        <div className={styles.label}>Vista previa</div>
        <ZoomControls
          className={styles.zoom}
          percent={percent}
          onOut={() => zoomRef.current?.zoomOut()}
          onIn={() => zoomRef.current?.zoomIn()}
          onReset={() => zoomRef.current?.reset()}
        />
        <Button
          {...tip.target}
          icon="download"
          className={styles.downloadButton}
          data-testid="hunter-download"
          disabled={!shown}
          onClick={onDownload}
        >
          Descargar PDF
        </Button>
        {tip.element}
        {action}
        <OtherMenu onMultiple={onMultiple} />
      </div>
      {state.kind === "message" && <Message message={state.message} />}
      <img
        ref={picture}
        className={styles.picture}
        alt="Flyer de la empresa elegida"
        hidden={!shown}
        src={shown?.picture}
        onLoad={() => zoomRef.current?.apply()}
      />
    </div>
  );
}
