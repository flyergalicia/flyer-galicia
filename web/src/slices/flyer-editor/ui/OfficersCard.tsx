import { useRef, useState } from "react";
import { OFFICER_SLOTS } from "@/shared/flyer-engine/types.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { usePermissions } from "@/shared/session/index.ts";
import { Card, Field, Input, Switch } from "@/shared/ui/index.ts";
import { useSavedAdvisors } from "@/slices/company-registry/index.ts";
import { useFlyerForm, useFormValue } from "../model/form-context.ts";
import {
  BRANCH_PIN,
  nextFreeOfficer,
  type OfficerField,
  officerHasData,
  withFieldChecked,
  withOfficerAdded,
  withOfficerEmptied,
  withOfficerField,
  withOfficerPlace,
  withOfficerRemoved,
} from "../model/form-state.ts";
import { PasteBox } from "./PasteBox.tsx";
import { type PopupPlace, SavedAdvisorsPopup } from "./SavedAdvisorsPopup.tsx";
import styles from "./FlyerForm.module.css";

const POPUP_GAP = 4;
const PASTE_HINT = "Pegar los datos del oficial (nombre, celular, mail) y completarlos solo";

function statusOf(problem: { readonly kind: string } | null) {
  if (!problem) return "valid";
  return problem.kind === "invalid" ? "invalid" : "warning";
}

interface PersonFieldProps {
  readonly position: number;
  readonly field: OfficerField;
  readonly label: string;
  readonly placeholder: string;
  readonly inputRef?: (input: HTMLInputElement | null) => void;
}

function PersonField({ position, field, label, placeholder, inputRef }: PersonFieldProps) {
  const form = useFlyerForm();
  const value = useFormValue((state) => state.officers[position]?.[field] ?? "");
  const problem = useFormValue((state) => {
    const officer = state.officers[position];
    if (field === "celular") return officer?.phoneProblem ?? null;
    return field === "email" ? (officer?.mailProblem ?? null) : null;
  });
  return (
    <Field className={styles.field} status={statusOf(problem)}>
      <Field.Label>{label}</Field.Label>
      <Input
        {...(inputRef ? { ref: inputRef } : {})}
        value={value}
        placeholder={placeholder}
        data-officer-field={`${field}${String(position + 1)}`}
        onChange={({ target }) => {
          form.update((state) => withOfficerField(state, position, field, target.value));
        }}
        onBlur={() => {
          if (field !== "nombre") form.update((state) => withFieldChecked(state, position, field));
        }}
      />
      <Field.Message>{problem?.message ?? ""}</Field.Message>
    </Field>
  );
}

/** Only with "Oficiales por sede". With no capitals on purpose: the flyer draws it as it is written. */
function PlaceField({ position }: { readonly position: number }) {
  const form = useFlyerForm();
  const value = useFormValue((state) => state.officers[position]?.ubic ?? "");
  const isOn = useFormValue((state) => state.branches);
  if (!isOn) return null;
  return (
    <Field className={styles.field}>
      <Field.Label>Ubicación</Field.Label>
      <Input
        value={value}
        placeholder={`${BRANCH_PIN} BUENOS AIRES`}
        autoComplete="off"
        data-testid={`officer-place-${String(position + 1)}`}
        onChange={({ target }) => {
          form.update((state) => withOfficerPlace(state, position, target.value));
        }}
      />
    </Field>
  );
}

function BranchesTitle() {
  const form = useFlyerForm();
  const value = useFormValue((state) => state.branchesTitle);
  const isOn = useFormValue((state) => state.branches);
  if (!isOn) return null;
  return (
    <Field className={`${styles.field} ${styles.branchesTitle}`}>
      <Field.Label>Título arriba de los oficiales</Field.Label>
      <Input
        value={value}
        placeholder="Ahora tenés un referente por sede según tu zona"
        autoComplete="off"
        data-branches-title=""
        data-testid="branches-title"
        onChange={({ target }) => {
          form.update((state) => ({ ...state, branchesTitle: target.value }));
        }}
      />
    </Field>
  );
}

function OfficerActions({ position }: { readonly position: number }) {
  const form = useFlyerForm();
  const { show } = useToast();
  const { can } = usePermissions();
  const isPasting = useFormValue((state) => state.pasting.includes(position));
  const number = position + 1;
  const togglePaste = () => {
    form.update((state) => ({
      ...state,
      pasting: isPasting
        ? state.pasting.filter((open) => open !== position)
        : [...state.pasting, position],
    }));
  };
  const removeOrEmpty = () => {
    const officer = form.getState().officers[position];
    const hadData = officer ? officerHasData(officer) : false;
    if (position === 0) {
      form.update((state) => withOfficerEmptied(state, 0));
      if (hadData) show(`Datos del asesor ${String(number)} borrados`);
      return;
    }
    form.update((state) => withOfficerRemoved(state, position));
    if (hadData) show(`Asesor ${String(number)} quitado`);
  };
  return (
    <span className={styles.officerActions} data-testid={`officer-actions-${String(number)}`}>
      {can("pegar_oficial") && (
        <button
          type="button"
          className={isPasting ? `${styles.pasteButton} ${styles.pasteOn}` : styles.pasteButton}
          title={PASTE_HINT}
          data-testid={`paste-button-${String(number)}`}
          onClick={togglePaste}
        >
          ⚡ Pegar
        </button>
      )}
      <button
        type="button"
        className={styles.removeButton}
        title={
          position === 0
            ? `Borrar los datos del asesor ${String(number)}`
            : `Quitar asesor ${String(number)}`
        }
        data-testid={`remove-officer-${String(number)}`}
        onClick={removeOrEmpty}
      >
        ✕ {position === 0 ? "Borrar" : "Quitar"}
      </button>
    </span>
  );
}

function OfficerTitle({ position }: { readonly position: number }) {
  const { can } = usePermissions();
  const canUseSaved = can("asesores_guardados");
  const [picking, setPicking] = useState<PopupPlace | null>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const label = position === 0 ? "Asesor 1" : `Asesor ${String(position + 1)} (opcional)`;
  const open = () => {
    const box = title.current?.getBoundingClientRect();
    if (!box) return;
    setPicking((current) =>
      current ? null : { top: box.bottom + POPUP_GAP, left: Math.round(box.left) },
    );
  };
  const caret = canUseSaved && (
    <button
      type="button"
      className={styles.officerCaret}
      tabIndex={-1}
      aria-hidden="true"
      onClick={open}
    >
      ▾
    </button>
  );
  return (
    <h4
      ref={title}
      className={canUseSaved ? `${styles.officerTitle} ${styles.officerPick}` : styles.officerTitle}
    >
      {canUseSaved ? (
        <button
          type="button"
          className={styles.officerLabel}
          data-testid={`saved-advisors-${String(position + 1)}`}
          onClick={open}
        >
          {label}
        </button>
      ) : (
        label
      )}
      {position > 0 && caret}
      <OfficerActions position={position} />
      {position === 0 && caret}
      {picking && (
        <SavedAdvisorsPopup
          position={position}
          place={picking}
          onClose={() => {
            setPicking(null);
          }}
        />
      )}
    </h4>
  );
}

function OfficerBlock({
  position,
  focusName,
}: {
  readonly position: number;
  readonly focusName: boolean;
}) {
  const isShown = useFormValue((state) => state.officers[position]?.shown ?? false);
  const isPasting = useFormValue((state) => state.pasting.includes(position));
  const number = String(position + 1);
  if (!isShown) return null;
  return (
    <div data-testid={`officer-block-${number}`}>
      <OfficerTitle position={position} />
      <div className={styles.officerFields}>
        {isPasting && <PasteBox position={position} />}
        <PersonField
          position={position}
          field="nombre"
          label="Nombre"
          placeholder={`Nombre Asesor ${number}`}
          {...(focusName
            ? {
                inputRef: (input) => {
                  input?.focus();
                },
              }
            : {})}
        />
        <PersonField
          position={position}
          field="celular"
          label="Celular"
          placeholder="11 XXXX XXXX"
        />
        <PersonField
          position={position}
          field="email"
          label="Email"
          placeholder="mail@bancogalicia.com.ar"
        />
        <PlaceField position={position} />
      </div>
    </div>
  );
}

function OfficerBlocks() {
  const form = useFlyerForm();
  const canAdd = useFormValue((state) => nextFreeOfficer(state) >= 0);
  const [justAdded, setJustAdded] = useState(-1);
  return (
    <>
      <BranchesTitle />
      {OFFICER_SLOTS.map(([number]) => (
        <OfficerBlock key={number} position={number - 1} focusName={number - 1 === justAdded} />
      ))}
      {canAdd && (
        <button
          type="button"
          className={styles.addOfficer}
          data-testid="add-officer"
          onClick={() => {
            const free = nextFreeOfficer(form.getState());
            setJustAdded(free);
            form.update((state) => withOfficerAdded(state, free));
          }}
        >
          + Agregar asesor
        </button>
      )}
    </>
  );
}

/** The list comes from the cloud once, on entering: its window opens with it already there. */
function BringSavedAdvisors() {
  useSavedAdvisors();
  return null;
}

export function OfficersCard() {
  const form = useFlyerForm();
  const { can } = usePermissions();
  const isOn = useFormValue((state) => state.officersOn);
  return (
    <Card>
      {can("asesores_guardados") && <BringSavedAdvisors />}
      <Card.Title className={isOn ? "" : (styles.officersOffTitle ?? "")}>
        Oficiales
        <Switch
          checked={isOn}
          inline
          title="Mostrar u ocultar los oficiales en el flyer"
          onChange={(checked) => {
            form.update((state) => ({ ...state, officersOn: checked }));
          }}
        >
          Mostrar en el flyer
        </Switch>
      </Card.Title>
      {isOn ? (
        <OfficerBlocks />
      ) : (
        <p className={styles.officersOff} data-testid="officers-off">
          El flyer sale sin oficiales. Tus datos quedan guardados: prendelo y vuelven.
        </p>
      )}
    </Card>
  );
}
