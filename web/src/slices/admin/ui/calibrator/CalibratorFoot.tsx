import { type CalibratorStore, zoomLabel } from "../../model/calibrator/calibrator-store.ts";
import type { CalibratorCanvas } from "./calibrator-canvas.ts";
import { useCalibratorVersion } from "./use-calibrator-version.ts";
import styles from "./Calibrator.module.css";

const ZOOM_STEP = 1.25;

interface CalibratorFootProps {
  readonly store: CalibratorStore;
  readonly zoom: CalibratorCanvas["zoom"];
  readonly enlarge: () => void;
}

/** How it is used, the zoom of the picture and «Ampliar». */
export function CalibratorFoot({ store, zoom, enlarge }: CalibratorFootProps) {
  useCalibratorVersion(store);
  return (
    <div className={styles.foot}>
      <span>
        Elegí una zona arriba (se ve sólo esa; tocala de nuevo para ver todas) y arrastrala en la
        imagen: ahí mismo te aparecen su <b>tamaño, peso y color</b>. Los cuatro montos se mueven
        juntos con «Montos (todo)» o de a uno eligiendo cada importe. Flechas del teclado = ajuste
        fino (Shift = 10px). <b>Ctrl + rueda</b> = zoom.
      </span>
      <span className={styles.space} />
      <span className={styles.zoom}>
        <button
          type="button"
          className={styles.zoomButton}
          title="Alejar"
          aria-label="Alejar"
          onClick={() => {
            zoom(1 / ZOOM_STEP);
          }}
        >
          −
        </button>
        <button
          type="button"
          className={styles.zoomButton}
          title="Volver al tamaño inicial"
          data-testid="calibrator-zoom"
          onClick={() => {
            zoom(0);
          }}
        >
          {zoomLabel(store.scale(), store.startScale())}
        </button>
        <button
          type="button"
          className={styles.zoomButton}
          title="Acercar"
          aria-label="Acercar"
          onClick={() => {
            zoom(ZOOM_STEP);
          }}
        >
          +
        </button>
      </span>
      <span className={styles.zoom}>
        <button
          type="button"
          className={`${styles.zoomButton} ${styles.enlarge}`}
          title="Agrandar el editor a casi toda la pantalla (o volver al tamaño normal)"
          onClick={enlarge}
        >
          ⤢ Ampliar
        </button>
      </span>
    </div>
  );
}
