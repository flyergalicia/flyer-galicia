import { useCallback } from "react";
import type { SearchableCompany } from "@/shared/domain/company-registry/index.ts";
import { useWorkspaceValue } from "@/shared/lib/flyer-workspace/index.ts";
import { Card, Field, Input } from "@/shared/ui/index.ts";
import { CompanyField } from "@/slices/company-registry/index.ts";
import { useFlyerForm, useFormValue } from "../model/form-context.ts";
import {
  capInField,
  withBenefitName,
  withBenefitNameFromCompany,
  withCompany,
} from "../model/form-state.ts";
import styles from "./FlyerForm.module.css";

const SECOND_CAP_MARKER = "{importe2}";

function CapFields() {
  const form = useFlyerForm();
  const cap = useFormValue((state) => state.cap);
  const secondCap = useFormValue((state) => state.secondCap);
  const benefit = useWorkspaceValue(({ slot: { scene } }) => scene?.calibration.benef);
  const showsSecond = benefit?.lineas.some(({ t }) => t.includes(SECOND_CAP_MARKER)) ?? false;
  return (
    <>
      <Field className={styles.field}>
        <Field.Label>{benefit?.campos.importe ?? "Tope de reintegro mensual"}</Field.Label>
        <Input
          value={cap}
          placeholder="24.000"
          inputMode="numeric"
          autoComplete="off"
          data-testid="benefit-cap"
          onChange={({ target }) => {
            form.update((state) => ({ ...state, cap: target.value }));
          }}
          onBlur={({ target }) => {
            form.update((state) => ({ ...state, cap: capInField(target.value) }));
          }}
        />
      </Field>
      {showsSecond && (
        <Field className={styles.field}>
          <Field.Label>{benefit?.campos.importe2 ?? "Segundo tope (si es distinto)"}</Field.Label>
          <Input
            value={secondCap}
            placeholder="Igual al otro"
            inputMode="numeric"
            autoComplete="off"
            data-testid="benefit-second-cap"
            onChange={({ target }) => {
              form.update((state) => ({ ...state, secondCap: target.value }));
            }}
            onBlur={({ target }) => {
              form.update((state) => ({ ...state, secondCap: capInField(target.value) }));
            }}
          />
        </Field>
      )}
    </>
  );
}

/** The sign of Flyer Rubros: what is written on it. */
function BenefitFields() {
  const form = useFlyerForm();
  const benefitName = useFormValue((state) => state.benefitName);
  return (
    <div data-testid="benefit-fields">
      <div className={styles.benefitTitle}>Beneficio exclusivo</div>
      <Field className={styles.field}>
        <Field.Label>Nombre en el beneficio</Field.Label>
        <div className={styles.benefitName}>
          <Input
            value={benefitName}
            placeholder="Se copia de la empresa"
            autoComplete="off"
            data-testid="benefit-name"
            onChange={({ target }) => {
              form.update((state) => withBenefitName(state, target.value));
            }}
          />
          <button
            type="button"
            className={styles.benefitAgain}
            title="Volver a copiar el nombre de la empresa"
            aria-label="Volver a copiar el nombre de la empresa"
            onClick={() => {
              form.update(withBenefitNameFromCompany);
            }}
          >
            ↻
          </button>
        </div>
      </Field>
      <div className={styles.benefitHint}>
        Sale como «¡Beneficio exclusivo <b>NOMBRE</b>!». Se completa solo con la empresa; si lo
        cambiás queda lo tuyo. Borralo para que diga sólo «¡Beneficio exclusivo!»; ↻ vuelve a copiar
        la empresa. En el legal, <code>{"{importe}"}</code>, <code>{"{importe2}"}</code>,{" "}
        <code>{"{total}"}</code> (la suma) y <code>{"{empresa}"}</code> se reemplazan solos por lo
        cargado acá.
      </div>
      <CapFields />
    </div>
  );
}

interface CompanyCardProps {
  readonly isCategoryTab: boolean;
  readonly onChoose: (company: SearchableCompany) => void;
  readonly onOpenDatabase: () => void;
}

export function CompanyCard({ isCategoryTab, onChoose, onOpenDatabase }: CompanyCardProps) {
  const form = useFlyerForm();
  const empresa = useFormValue((state) => state.empresa);
  const chosen = useFormValue((state) => state.chosen);
  const note = useFormValue((state) => state.note);
  const typed = useCallback(
    (text: string) => {
      form.update((state) => withCompany(state, text));
    },
    [form],
  );
  return (
    <Card>
      <Card.Title>Empresa</Card.Title>
      <Field className={styles.field}>
        <Field.Label>Nombre de la empresa</Field.Label>
        <CompanyField
          value={empresa}
          placeholder="Nombre de la empresa"
          chosen={chosen}
          note={note}
          onChange={typed}
          onChoose={onChoose}
          onOpenDatabase={onOpenDatabase}
        />
      </Field>
      {isCategoryTab && <BenefitFields />}
    </Card>
  );
}
