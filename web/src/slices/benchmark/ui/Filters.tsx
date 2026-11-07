// The filters: province (Shift adds another, as in Promociones), rubro, the card of the person, the
// type of card, the bank compared, the salary-only promotions and the reference purchases.
import { type ChangeEvent, useEffect, useState } from "react";
import { ProvinceSelect } from "@/shared/ui/province-select/ProvinceSelect.tsx";
import { useBenchmark, useBenchmarkActions } from "../model/benchmark-context.ts";
import type { Audience, CardType } from "../model/filters.ts";
import { audienceOf, cardTypeOf, provincesOf, rubrosOf } from "../model/filters.ts";
import { REFERENCE_FIELDS } from "../model/reference.ts";
import { COMPETITORS } from "../model/rows.ts";
import styles from "./BenchmarkView.module.css";

const AUDIENCES: readonly { readonly value: Audience; readonly label: string }[] = [
  { value: "todos", label: "Todas" },
  { value: "clasico", label: "Clásico / Gold" },
  { value: "premium", label: "Premium" },
];

const CARD_TYPES: readonly { readonly value: CardType; readonly label: string }[] = [
  { value: "todas", label: "Todas" },
  { value: "credito", label: "Crédito" },
  { value: "debito", label: "Débito" },
  { value: "visa", label: "Visa" },
  { value: "master", label: "Mastercard" },
  { value: "american_express", label: "Amex" },
];

/**
 * A purchase is written when the field changes, as the old app does: on leaving it, on Enter or
 * with its arrows, not on each key.
 */
function ReferenceField({ rubro, label }: { readonly rubro: string; readonly label: string }) {
  const { screen } = useBenchmark();
  const { setReference } = useBenchmarkActions();
  const [field, setField] = useState<HTMLInputElement | null>(null);
  const saved = String(screen.references[rubro] ?? 0);
  const [typed, setTyped] = useState<string | null>(null);
  useEffect(() => {
    if (!field) return undefined;
    const onChange = () => {
      setReference(rubro, field.value);
      setTyped(null);
    };
    field.addEventListener("change", onChange);
    return () => {
      field.removeEventListener("change", onChange);
    };
  }, [field, rubro, setReference]);
  return (
    <label className={`${styles.field} ${styles.light}`}>
      {label}
      <input
        ref={setField}
        type="number"
        min="0"
        step="1000"
        value={typed ?? saved}
        onChange={(event) => {
          setTyped(event.target.value);
        }}
      />
    </label>
  );
}

function SelectsOfPerson() {
  const { screen } = useBenchmark();
  const { dispatch } = useBenchmarkActions();
  const { filters } = screen;
  return (
    <>
      <label className={styles.field}>
        Tarjeta de la persona
        <select
          aria-label="Tarjeta de la persona"
          value={filters.seg}
          title="Premium: lo exclusivo de Black, Signature, Platinum, Selecta… y lo general. Clásico/Gold: lo clásico y lo general. Lo que el banco no aclara cuenta como general."
          onChange={({ target }) => {
            dispatch({ type: "filter", change: { seg: audienceOf(target.value) } });
          }}
        >
          {AUDIENCES.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.field}>
        Tipo de tarjeta
        <select
          aria-label="Tipo de tarjeta"
          value={filters.tarj}
          onChange={({ target }) => {
            dispatch({ type: "filter", change: { tarj: cardTypeOf(target.value) } });
          }}
        >
          {CARD_TYPES.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

function PlaceAndRubro() {
  const { screen, data, brands } = useBenchmark();
  const { dispatch } = useBenchmarkActions();
  const { filters } = screen;
  return (
    <>
      <div className={`${styles.field} ${styles.labelLike}`}>
        Provincia
        <ProvinceSelect
          aria-label="Provincia"
          appearance="native"
          provinces={provincesOf(brands)}
          value={filters.prov}
          allLabel="Todas las provincias"
          onChange={(prov) => {
            dispatch({ type: "filter", change: { prov } });
          }}
        />
      </div>
      <label className={styles.field}>
        Rubro
        <select
          aria-label="Rubro"
          value={filters.rubro}
          onChange={({ target }) => {
            dispatch({ type: "filter", change: { rubro: target.value } });
          }}
        >
          <option value="">Todos</option>
          {rubrosOf(data.rows).map((rubro) => (
            <option key={rubro} value={rubro}>
              {rubro}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

export function Filters() {
  const { screen } = useBenchmark();
  const { dispatch } = useBenchmarkActions();
  const { filters } = screen;
  const onSalary = (event: ChangeEvent<HTMLInputElement>) => {
    dispatch({ type: "filter", change: { haberes: event.target.checked } });
  };
  return (
    <div className={`${styles.card} ${styles.filters}`} data-testid="benchmark-filters">
      <PlaceAndRubro />
      <SelectsOfPerson />
      <label className={styles.field}>
        Comparar Galicia con
        <select
          aria-label="Comparar Galicia con"
          value={screen.versus}
          onChange={({ target }) => {
            dispatch({ type: "versus", bank: target.value });
          }}
        >
          {COMPETITORS.map(({ code, name }) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label
        className={`${styles.field} ${styles.light} ${styles.salary}`}
        title="Promos como «clientes Haberes Galicia» o «cobrando el sueldo en ICBC»: sólo valen si el sueldo se cobra en ese banco."
      >
        <span>
          <input
            type="checkbox"
            className={styles.check}
            checked={filters.haberes}
            onChange={onSalary}
          />{" "}
          Incluir promos para quien cobra el sueldo en el banco
        </span>
      </label>
      <div className={styles.field}>
        Compra de referencia ($)
        <div className={styles.references}>
          {REFERENCE_FIELDS.map(({ rubro, label }) => (
            <ReferenceField key={rubro} rubro={rubro} label={label} />
          ))}
        </div>
      </div>
    </div>
  );
}
