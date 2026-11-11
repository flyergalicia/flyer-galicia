import { type ReactNode, type RefObject, useEffect } from "react";
import { useFlyerWorkspace, useWorkspaceValue } from "@/shared/lib/flyer-workspace/index.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { attachPreviewDrawing } from "../model/preview-drawing.ts";
import { ZoomBar } from "./ZoomBar.tsx";
import styles from "./FlyerEditorView.module.css";

interface FlyerPreviewPaneProps {
  /** Over the flyer, and what floats at its foot: Cambiar logos. */
  readonly bar: ReactNode;
  readonly problem: ReactNode;
  readonly layer: ReactNode;
  readonly foot: ReactNode;
  readonly canvasRef: RefObject<HTMLCanvasElement | null>;
  readonly paneRef: RefObject<HTMLDivElement | null>;
}

export function FlyerPreviewPane({
  bar,
  problem,
  layer,
  foot,
  canvasRef,
  paneRef,
}: FlyerPreviewPaneProps) {
  const workspace = useFlyerWorkspace();
  const toast = useToast();
  useEffect(() => {
    const canvas = canvasRef.current;
    const pane = paneRef.current;
    if (!canvas || !pane) return undefined;
    return attachPreviewDrawing({
      canvas,
      pane,
      workspace,
      onTip: (text) => {
        toast.show(text);
      },
    });
  }, [canvasRef, paneRef, toast, workspace]);
  const failed = useWorkspaceValue((state) => state.slot.failure !== null);
  return (
    <div ref={paneRef} className={styles.preview} data-testid="flyer-preview">
      <div className={styles.label}>Vista previa en tiempo real</div>
      <ZoomBar />
      {bar}
      {problem}
      <div
        className={failed ? `${styles.canvasBox} ${styles.canvasFailed}` : styles.canvasBox}
        data-testid="flyer-canvas-box"
        data-flyer-box=""
        data-off={failed}
      >
        <canvas ref={canvasRef} className={styles.canvas} data-testid="flyer-canvas" />
        {layer}
      </div>
      {foot}
    </div>
  );
}
