// A whole flyer in a window: "Ver completo" of a design, or "Ver" of a flyer to copy.
import { type ReactNode, useEffect, useRef } from "react";
import { Button, Modal } from "@/shared/ui/index.ts";
import styles from "./StudioView.module.css";

interface ViewerWindowProps {
  readonly title: string;
  readonly text?: string;
  readonly canvas?: HTMLCanvasElement;
  readonly picture?: string;
  readonly extra?: ReactNode;
  readonly onClose: () => void;
}

export function ViewerWindow({ title, text, canvas, picture, extra, onClose }: ViewerWindowProps) {
  const place = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (canvas) place.current?.replaceChildren(canvas);
  }, [canvas]);
  return (
    <Modal look="dialog" closeOnBackdrop={false} className={styles.viewer} onClose={onClose}>
      <div className={styles.viewerHead}>
        <div className={styles.viewerHeadText}>
          <Modal.Title className={styles.windowTitle}>{title}</Modal.Title>
          {text && <div className={styles.windowText}>{text}</div>}
        </div>
        <button type="button" className={styles.viewerClose} aria-label="Cerrar" onClick={onClose}>
          ×
        </button>
      </div>
      <div ref={place} className={styles.viewerPicture} data-testid="flyer-viewer">
        {picture && <img alt="" src={picture} />}
      </div>
      <div className={styles.windowActions}>
        {extra}
        <Button size="dialog" data-testid="viewer-close" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </Modal>
  );
}
