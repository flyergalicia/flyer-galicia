// The pieces of the windows that ask for an action.
import type { ReactNode } from "react";
import type { CommercialPerson } from "@/shared/lib/commercial-actions/people-query.ts";
import { TO_LEADER } from "../model/action-form.ts";
import styles from "./CommercialActions.module.css";

export function Pills({
  name,
  options,
  value,
  onChoose,
}: {
  readonly name: string;
  readonly options: Readonly<Record<string, string>>;
  readonly value: string;
  readonly onChoose: (value: string) => void;
}) {
  return (
    <div className={styles.pills} data-name={name}>
      {Object.entries(options).map(([key, label]) => (
        <button
          key={key}
          type="button"
          data-value={key}
          aria-pressed={value === key}
          onClick={() => {
            onChoose(key);
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function Optional() {
  return <i className={styles.optional}>(opcional)</i>;
}

export function TimesField({
  from,
  to,
  onChange,
  children,
}: {
  readonly from: string;
  readonly to: string;
  readonly onChange: (from: string, to: string) => void;
  readonly children?: ReactNode;
}) {
  return (
    <div className={styles.times}>
      <input
        type="time"
        className={styles.input}
        aria-label="Desde"
        value={from}
        onChange={({ target }) => {
          onChange(target.value, to);
        }}
      />
      <span>a</span>
      <input
        type="time"
        className={styles.input}
        aria-label="Hasta"
        value={to}
        onChange={({ target }) => {
          onChange(from, target.value);
        }}
      />
      <span className={styles.shortcuts}>
        <button
          type="button"
          onClick={() => {
            onChange("09:00", "13:00");
          }}
        >
          Mañana
        </button>
        <button
          type="button"
          onClick={() => {
            onChange("14:00", "18:00");
          }}
        >
          Tarde
        </button>
      </span>
      {children}
    </div>
  );
}

function hunterLabel({ nombre, es_prueba: isTrial }: CommercialPerson): string {
  return `${nombre}${isTrial ? " (prueba)" : ""}`;
}

/**
 * Hunters to choose from. `withPrompt`: nobody is chosen when it opens. `toLeader`: the officer can
 * leave it for the leader to assign.
 */
export function HunterOptions({
  hunters,
  withPrompt,
  toLeader = false,
  failed = false,
}: {
  readonly hunters: readonly CommercialPerson[];
  readonly withPrompt: boolean;
  readonly toLeader?: boolean;
  /** They could not be read: it is not that there are none. */
  readonly failed?: boolean | undefined;
}) {
  const leader = toLeader ? <option value={TO_LEADER}>Que la asigne el líder</option> : null;
  if (hunters.length === 0) {
    return (
      <>
        <option value="">
          {failed ? "No se pudieron traer los hunters" : "No hay hunters activos"}
        </option>
        {leader}
      </>
    );
  }
  const options = hunters.map((hunter) => (
    <option key={hunter.id} value={hunter.id}>
      {hunterLabel(hunter)}
    </option>
  ));
  return withPrompt ? (
    <>
      <option value="">Elegí un hunter</option>
      {leader}
      {options}
    </>
  ) : (
    <>
      {options}
      {leader}
    </>
  );
}
