import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import {
  COMMERCIAL_FLAG_QUERY_KEY,
  useCommercialFlagSetting,
  usePermissions,
} from "@/shared/session/index.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { saveCommercialSwitch } from "../api/faculties.ts";
import styles from "./Faculties.module.css";

const CHOICES = [
  ["off", "Apagado", "Nadie lo ve."],
  ["prueba", "En prueba", "Sólo vos y la cuenta de prueba (Prospect)."],
  [
    "on",
    "Activo",
    "Lo ve cada perfil según la fila «Gestiones comerciales» de abajo. El Líder siempre.",
  ],
] as const;

type SwitchValue = (typeof CHOICES)[number][0];

const SAVED: Readonly<Record<SwitchValue, string>> = {
  off: "Gestiones comerciales: apagado.",
  prueba: "Gestiones comerciales: en prueba (sólo vos y Prospect).",
  on: "Gestiones comerciales: activo según Facultades.",
};

/** The switch of Gestiones (`app_flags`): off, on trial, or on as the permissions say. */
export function CommercialSwitch() {
  const { db } = useBackend();
  const queryClient = useQueryClient();
  const { show } = useToast();
  const { isAdminNow } = usePermissions();
  const value = useCommercialFlagSetting();

  const choose = async (next: SwitchValue) => {
    if (!isAdminNow || next === value) return;
    queryClient.setQueryData(COMMERCIAL_FLAG_QUERY_KEY, next);
    const refused = await saveCommercialSwitch(db, next, new Date());
    if (refused) {
      queryClient.setQueryData(COMMERCIAL_FLAG_QUERY_KEY, value);
      show(`No se pudo guardar: ${refused}`);
      return;
    }
    show(SAVED[next]);
  };

  return (
    <div className={styles.switch} data-testid="commercial-switch">
      <div className={styles.switchTitle}>
        Gestiones comerciales <span className={styles.new}>Nuevo</span>
      </div>
      <div className={styles.switchText}>
        Visitas, ferias, prospectos, altas y el tablero del Líder. Prendelo para probarlo sin que lo
        vea nadie más.
      </div>
      <fieldset className={styles.choices} aria-label="Estado de Gestiones comerciales">
        {CHOICES.map(([id, name, text]) => (
          <label key={id} className={styles.choice}>
            <input
              type="radio"
              name="gestiones-switch"
              className={styles.radio}
              checked={value === id}
              onChange={() => void choose(id)}
            />
            <b>{name}</b>
            <span>{text}</span>
          </label>
        ))}
      </fieldset>
    </div>
  );
}
