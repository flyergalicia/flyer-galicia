import {
  useFlyerWorkspace,
  useWorkspaceValue,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
} from "@/shared/lib/flyer-workspace/index.ts";
import { ZoomControls } from "@/shared/ui/index.ts";
import styles from "./FlyerEditorView.module.css";

/** The zoom of the preview with buttons. */
export function ZoomBar() {
  const workspace = useFlyerWorkspace();
  const zoom = useWorkspaceValue((state) => state.zoom);
  const zoomTo = (next: number) => {
    workspace.setZoom(next);
    workspace.requestDraw();
  };
  return (
    <ZoomControls
      className={styles.zoomBar}
      percent={Math.round(zoom * 100)}
      onOut={() => {
        zoomTo(Math.max(zoom / ZOOM_STEP, ZOOM_MIN));
      }}
      onIn={() => {
        zoomTo(Math.min(zoom * ZOOM_STEP, ZOOM_MAX));
      }}
      onReset={() => {
        zoomTo(1);
      }}
    />
  );
}
