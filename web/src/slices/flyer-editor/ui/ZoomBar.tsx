import {
  useFlyerWorkspace,
  useWorkspaceValue,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
} from "@/shared/lib/flyer-workspace/index.ts";
import styles from "./FlyerEditorView.module.css";

/** The zoom of the preview with buttons: at the middle of the flyer, not where the mouse is. */
export function ZoomBar() {
  const workspace = useFlyerWorkspace();
  const zoom = useWorkspaceValue((state) => state.zoom);
  const zoomTo = (next: number) => {
    workspace.setZoom(next);
    workspace.requestDraw();
  };
  return (
    <div className={styles.zoomBar}>
      <button
        type="button"
        title="Alejar"
        aria-label="Alejar"
        onClick={() => {
          zoomTo(Math.max(zoom / ZOOM_STEP, ZOOM_MIN));
        }}
      >
        −
      </button>
      <span className={styles.zoomPercent} data-testid="zoom-percent">
        {Math.round(zoom * 100)}%
      </span>
      <button
        type="button"
        title="Acercar"
        aria-label="Acercar"
        onClick={() => {
          zoomTo(Math.min(zoom * ZOOM_STEP, ZOOM_MAX));
        }}
      >
        +
      </button>
      <button
        type="button"
        className={styles.zoomReset}
        title="Restablecer zoom"
        aria-label="Restablecer zoom"
        onClick={() => {
          zoomTo(1);
        }}
      >
        ⟲
      </button>
    </div>
  );
}
