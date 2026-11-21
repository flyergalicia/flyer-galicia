import { useEffect, useRef, useState } from "react";
import { Button, Modal } from "@/shared/ui/index.ts";
import { attachPreviewWindowZoom, type PreviewWindowZoom } from "../model/preview-window-zoom.ts";
import styles from "./PreviewWindow.module.css";

interface PreviewWindowProps {
  /** Exactly what comes out (invariant 16). */
  readonly picture: string;
  readonly canShare: boolean;
  readonly onClose: () => void;
  readonly onPdf: () => void;
  readonly onPng: () => void;
  readonly onShare: () => void;
}

export function PreviewWindow({
  picture,
  canShare,
  onClose,
  onPdf,
  onPng,
  onShare,
}: PreviewWindowProps) {
  const body = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const zoom = useRef<PreviewWindowZoom | null>(null);
  const [percent, setPercent] = useState(100);
  const [isZoomed, setIsZoomed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);

  useEffect(() => {
    if (!body.current || !image.current) return undefined;
    const attached = attachPreviewWindowZoom({
      body: body.current,
      image: image.current,
      onPercent: setPercent,
      onZoomed: setIsZoomed,
      onPanning: setIsPanning,
    });
    zoom.current = attached;
    return attached.stop;
  }, []);

  return (
    <Modal look="viewer" onClose={onClose} className={styles.window}>
      <div className={styles.header}>
        <Modal.Title className={styles.title}>Vista previa</Modal.Title>
        <fieldset className={styles.zoom} aria-label="Zoom de la vista previa">
          <button
            type="button"
            aria-label="Alejar"
            title="Alejar (−)"
            onClick={() => zoom.current?.zoomOut()}
          >
            −
          </button>
          <span className={styles.percent} data-testid="preview-window-percent">
            {percent}%
          </span>
          <button
            type="button"
            aria-label="Acercar"
            title="Acercar (+, Ctrl + ruedita o doble clic)"
            onClick={() => zoom.current?.zoomIn()}
          >
            +
          </button>
          <button
            type="button"
            aria-label="Ver entero"
            title="Ver entero (0)"
            onClick={() => zoom.current?.seeWhole()}
          >
            ⟲
          </button>
        </fieldset>
        <button type="button" className={styles.close} aria-label="Cerrar" onClick={onClose}>
          ✕
        </button>
      </div>
      <div
        ref={body}
        className={styles.body}
        data-testid="preview-window-body"
        data-zoomed={isZoomed}
        data-panning={isPanning}
      >
        <img
          ref={image}
          src={picture}
          alt="El flyer como va a salir"
          className={styles.picture}
          draggable={false}
          data-testid="preview-window-picture"
        />
      </div>
      <div className={styles.footer}>
        <Button icon="download" className={styles.pdf} onClick={onPdf}>
          PDF
        </Button>
        {canShare && (
          <Button variant="ghost" icon="share" title="Compartir el PDF" onClick={onShare}>
            Compartir
          </Button>
        )}
        <Button variant="ghost" title="Descargar como imagen (PNG)" onClick={onPng}>
          PNG
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </Modal>
  );
}
