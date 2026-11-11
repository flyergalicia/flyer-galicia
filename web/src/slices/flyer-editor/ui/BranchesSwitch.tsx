import { useEffect, useState } from "react";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { usePermissions } from "@/shared/session/index.ts";
import { ConfirmDialog, Icon, Switch } from "@/shared/ui/index.ts";
import { useFlyerForm, useFormValue } from "../model/form-context.ts";
import { branchesHaveData, withBranches } from "../model/form-state.ts";
import styles from "./FlyerForm.module.css";

const TURNED_ON = "Oficiales por sede: ya podés cargar hasta 8 con su ubicación";
const TURNED_OFF = "Oficiales por sede: apagado";

/** "Oficiales por sede", in the menu Otros: up to eight officers, each with the place it answers for. */
export function BranchesSwitch({ onTurnedOn }: { readonly onTurnedOn: () => void }) {
  const form = useFlyerForm();
  const { show } = useToast();
  const { can } = usePermissions();
  const isOn = useFormValue((state) => state.branches);
  const [isAsking, setIsAsking] = useState(false);
  const isAllowed = can("oficiales_sede");
  // The faculty went away with it on: it goes off, and so does what was loaded.
  useEffect(() => {
    if (!isAllowed && isOn) form.update((state) => withBranches(state, false));
  }, [form, isAllowed, isOn]);
  if (!isAllowed) return null;
  const turnOff = () => {
    form.update((state) => withBranches(state, false));
    show(TURNED_OFF);
  };
  const press = () => {
    if (!isOn) {
      form.update((state) => withBranches(state, true));
      show(TURNED_ON);
      // What follows happens in the form, and its field is there on the next turn.
      onTurnedOn();
      setTimeout(() => {
        document.querySelector<HTMLInputElement>("[data-branches-title]")?.focus();
      }, 0);
    } else if (branchesHaveData(form.getState())) setIsAsking(true);
    else turnOff();
  };
  return (
    <>
      <Switch
        checked={isOn}
        inline
        className={`${styles.othersItem} ${styles.othersSwitch}`}
        onChange={press}
      >
        <Icon name="pin" className={styles.othersIcon} />
        <span className={styles.othersSwitchLabel}>Oficiales por sede (hasta 8)</span>
      </Switch>
      {isAsking && (
        <ConfirmDialog
          title='¿Apagar "Oficiales por sede"?'
          confirmLabel="Apagar igual"
          danger
          onCancel={() => {
            setIsAsking(false);
          }}
          onConfirm={() => {
            setIsAsking(false);
            turnOff();
          }}
        >
          Se borran las ubicaciones, el título y los oficiales 5 al 8. El flyer vuelve a los 4 de
          siempre.
        </ConfirmDialog>
      )}
    </>
  );
}
