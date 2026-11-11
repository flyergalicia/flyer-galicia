import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import {
  Button,
  ConfirmDialog,
  Field,
  Input,
  Modal,
  useCloseWithFloating,
} from "@/shared/ui/index.ts";
import {
  newAdvisorId,
  type SavedAdvisor,
  useSavedAdvisors,
} from "@/slices/company-registry/index.ts";
import { useFlyerForm } from "../model/form-context.ts";
import { withSavedAdvisor } from "../model/form-state.ts";
import styles from "./FlyerForm.module.css";

export interface PopupPlace {
  readonly top: number;
  readonly left: number;
}

interface SavedAdvisorsPopupProps {
  readonly position: number;
  readonly place: PopupPlace;
  readonly onClose: () => void;
}

/** The advisors of the account, for any of the slots: what is chosen fills that one and no other. */
export function SavedAdvisorsPopup({ position, place, onClose }: SavedAdvisorsPopupProps) {
  const form = useFlyerForm();
  const { show } = useToast();
  const { rows, loading, save, latest } = useSavedAdvisors();
  const [naming, setNaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<SavedAdvisor | null>(null);
  const popup = useRef<HTMLDivElement>(null);
  const isAsking = naming !== null || deleting !== null;
  // The search of screens closes it on opening (`closeAsPop`).
  useCloseWithFloating(onClose);

  useEffect(() => {
    if (isAsking) return undefined;
    const outside = ({ target }: MouseEvent) => {
      if (target instanceof Node && !popup.current?.contains(target)) onClose();
    };
    // The click that opened it is still going up.
    const wait = setTimeout(() => {
      document.addEventListener("click", outside);
    }, 0);
    return () => {
      clearTimeout(wait);
      document.removeEventListener("click", outside);
    };
  }, [isAsking, onClose]);

  const choose = (advisor: SavedAdvisor) => {
    form.update((state) => withSavedAdvisor(state, position, advisor));
    onClose();
    show(`Asesor "${advisor.name || advisor.nombre}" cargado`);
  };

  const askToSave = () => {
    const officer = form.getState().officers[position];
    if (!officer?.nombre && !officer?.celular && !officer?.email) {
      show("Completá el asesor antes de guardar");
      return;
    }
    setNaming(officer.nombre);
  };

  const saveAs = async (typed: string) => {
    const officer = form.getState().officers[position];
    const name = (typed || officer?.nombre || "").trim();
    if (!name) {
      show("Poné un nombre");
      return;
    }
    // With the list of the cloud in hand: an answer that came later would step on the new one.
    const current = await latest();
    await save([
      {
        id: newAdvisorId(),
        name,
        nombre: officer?.nombre ?? "",
        celular: officer?.celular ?? "",
        email: officer?.email ?? "",
      },
      ...current,
    ]);
    onClose();
    show(`Asesor "${name}" guardado`);
  };

  const remove = async (advisor: SavedAdvisor) => {
    setDeleting(null);
    const current = await latest();
    await save(current.filter(({ id }) => id !== advisor.id));
    show("Asesor eliminado");
  };

  return (
    <>
      {createPortal(
        <div ref={popup} className={styles.advisors} data-testid="saved-advisors" style={place}>
          <div className={styles.advisorsHead}>Asesor {position + 1} · guardados</div>
          <div className={styles.advisorsList}>
            {rows.length === 0 && (
              <div className={styles.advisorsEmpty}>
                {loading ? "Cargando tus asesores…" : "No tenés asesores guardados todavía."}
              </div>
            )}
            {rows.map((advisor) => (
              <div key={advisor.id} className={styles.advisorRow} data-testid="saved-advisor">
                <button
                  type="button"
                  className={styles.advisorName}
                  onClick={() => {
                    choose(advisor);
                  }}
                >
                  {advisor.name || advisor.nombre || "Sin nombre"}
                </button>
                <button
                  type="button"
                  className={styles.advisorDelete}
                  title="Eliminar"
                  aria-label={`Eliminar ${advisor.name || advisor.nombre}`}
                  onClick={() => {
                    setDeleting(advisor);
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <div className={styles.advisorsFoot}>
            <button type="button" className={styles.advisorsAction} onClick={askToSave}>
              + Guardar el actual
            </button>
          </div>
        </div>,
        document.body,
      )}
      {naming !== null && (
        <NameWindow
          initial={naming}
          onCancel={() => {
            setNaming(null);
          }}
          onSave={(name) => {
            setNaming(null);
            void saveAs(name);
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`¿Eliminar el asesor guardado "${deleting.name || deleting.nombre}"?`}
          confirmLabel="Eliminar"
          danger
          onCancel={() => {
            setDeleting(null);
          }}
          onConfirm={() => {
            void remove(deleting);
          }}
        >
          {""}
        </ConfirmDialog>
      )}
    </>
  );
}

/** It takes the place of the question of the browser. */
function NameWindow({
  initial,
  onCancel,
  onSave,
}: {
  readonly initial: string;
  readonly onCancel: () => void;
  readonly onSave: (name: string) => void;
}) {
  const [name, setName] = useState(initial);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);
  return (
    <Modal onClose={onCancel} size="narrow">
      <Modal.Body>
        <Field>
          <Field.Label>Nombre para guardar este asesor:</Field.Label>
          <Input
            ref={field}
            value={name}
            autoComplete="off"
            onChange={({ target }) => {
              setName(target.value);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              // The window closes and the focus goes back to the button: the same key would press it.
              event.preventDefault();
              onSave(name);
            }}
          />
        </Field>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="ghost" size="dialog" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          size="dialog"
          onClick={() => {
            onSave(name);
          }}
        >
          Guardar
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
