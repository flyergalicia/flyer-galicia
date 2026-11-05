// The form common to registering, forwarding and editing.
import { useRef } from "react";
import { type ActionFormState, type FormMode, TO_LEADER, typesFor } from "../model/action-form.ts";
import { ACTION_STATES, DATA_LIST_STATES, FREQUENCIES, MODALITIES } from "../model/labels.ts";
import { canSendToLeader, huntersOf, leaderChoices, type Who } from "../model/who.ts";
import { Availability } from "./Availability.tsx";
import { HunterOptions, Optional, Pills, TimesField } from "./form-parts.tsx";
import { PeopleOfList } from "./PeopleOfList.tsx";
import styles from "./CommercialActions.module.css";

type Change = (changes: Partial<ActionFormState>) => void;

interface FormPartProps {
  readonly form: ActionFormState;
  readonly mode: FormMode;
  readonly onChange: Change;
}

const EVERY_DAYS_SHORTCUTS = [7, 15, 30];

function RepeatField({
  form,
  mode,
  onChange,
  times,
}: FormPartProps & {
  /** In a series already built the number of times does not change. */
  readonly times: { readonly time: number; readonly of: number } | null;
}) {
  const isOn = form.frecuencia === "repite";
  const everyField = useRef<HTMLInputElement>(null);
  return (
    <div className={`${styles.full} ${styles.formField}`} data-section="rep">
      <span>¿Se repite?</span>
      <Pills
        name="frecuencia"
        options={FREQUENCIES}
        value={form.frecuencia}
        onChoose={(frecuencia) => {
          onChange({ frecuencia });
          if (frecuencia === "repite" && !form.cadaDias) {
            // It is what is missing, and it appears with this same touch.
            requestAnimationFrame(() => {
              everyField.current?.focus();
            });
          }
        }}
      />
      {isOn && (
        <div className={styles.repeat}>
          <span>Cada</span>
          <input
            ref={everyField}
            type="text"
            inputMode="numeric"
            className={`${styles.input} ${styles.inputNumber}`}
            maxLength={3}
            placeholder="15"
            aria-label="Cada cuántos días"
            value={form.cadaDias}
            onChange={({ target }) => {
              onChange({ cadaDias: target.value });
            }}
          />
          <span>días</span>
          <span className={styles.shortcuts}>
            {EVERY_DAYS_SHORTCUTS.map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => {
                  onChange({ cadaDias: String(days) });
                  everyField.current?.focus();
                }}
              >
                {days}
              </button>
            ))}
          </span>
          {times ? (
            <span className={styles.mini}>
              Vez {times.time} de {times.of}
            </span>
          ) : (
            <>
              <span>·</span>
              <input
                type="text"
                inputMode="numeric"
                className={`${styles.input} ${styles.inputNumber}`}
                maxLength={2}
                placeholder="sin fin"
                aria-label="Cantidad de veces"
                value={form.veces}
                onChange={({ target }) => {
                  onChange({ veces: target.value });
                }}
              />
              <span>veces</span>
            </>
          )}
        </div>
      )}
      {isOn && mode !== "editar" && (
        <div className={`${styles.mini} ${styles.repeatHelp}`}>
          Si ponés la cantidad de veces se crean todas las fechas ya planificadas. Si la dejás
          vacía, cuando completes una te ofrece crear la siguiente.
        </div>
      )}
    </div>
  );
}

function HunterFields({
  form,
  onChange,
  who,
  myLeader,
}: FormPartProps & {
  readonly who: Who;
  readonly myLeader: string | null;
}) {
  const leaders = leaderChoices(who, myLeader);
  return (
    <>
      <label className={styles.formField}>
        <span>Hunter</span>
        <select
          className={styles.input}
          data-testid="form-hunter"
          value={form.hunter}
          onChange={({ target }) => {
            onChange({ hunter: target.value });
          }}
        >
          <HunterOptions
            hunters={huntersOf(who, false)}
            withPrompt
            toLeader={canSendToLeader(who)}
            failed={who.peopleFailed}
          />
        </select>
      </label>
      {form.hunter === TO_LEADER && (
        <label className={styles.formField} data-section="lider">
          <span>Líder que la asigna</span>
          <select
            className={styles.input}
            data-testid="form-leader"
            value={form.lider || leaders[0]?.id || ""}
            onChange={({ target }) => {
              onChange({ lider: target.value });
            }}
          >
            {leaders.map(({ id, label }) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
      )}
    </>
  );
}

function ResultFields({
  form,
  onChange,
  isDataList,
}: FormPartProps & {
  readonly isDataList: boolean;
}) {
  const states = isDataList ? DATA_LIST_STATES : ACTION_STATES;
  return (
    <>
      <label className={styles.formField}>
        <span>Estado</span>
        <select
          className={styles.input}
          data-testid="form-state"
          value={form.estado}
          onChange={({ target }) => {
            onChange({ estado: target.value });
          }}
        >
          {Object.entries(states).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {!isDataList && (
        <>
          <label className={styles.formField} data-section="hor">
            <span>Dotación de la empresa</span>
            <input
              type="text"
              inputMode="numeric"
              className={styles.input}
              placeholder="Empleados"
              value={form.dotacion}
              onChange={({ target }) => {
                onChange({ dotacion: target.value });
              }}
            />
          </label>
          <label className={styles.formField} data-section="hor">
            <span>Asistentes o contactados</span>
            <input
              type="text"
              inputMode="numeric"
              className={styles.input}
              placeholder="Personas que hablaron con vos"
              value={form.asistentes}
              onChange={({ target }) => {
                onChange({ asistentes: target.value });
              }}
            />
          </label>
        </>
      )}
    </>
  );
}

function notePlaceholder(isDataList: boolean, mode: FormMode): string {
  if (isDataList) return "Qué ofrecerles, con quién hablar en la empresa";
  return mode === "derivar" ? "Con quién hablar, qué flyer llevar" : "Cómo fue, próximos pasos";
}

interface ActionFormProps extends FormPartProps {
  readonly who: Who;
  readonly myLeader: string | null;
  readonly times?: { readonly time: number; readonly of: number } | null;
  /** Whose day it shows when the window has no field of hunters. */
  readonly hunterOfDay?: string | null;
  /** The action being edited. */
  readonly exclude?: string | null;
}

function ScheduleFields({ form, onChange }: Omit<FormPartProps, "mode">) {
  return (
    <>
      <div className={styles.formField} data-section="hor">
        <span>
          Horario <Optional />
        </span>
        <TimesField
          from={form.desde}
          to={form.hasta}
          onChange={(desde, hasta) => {
            onChange({ desde, hasta });
          }}
        />
      </div>
      <label className={`${styles.full} ${styles.formField}`} data-section="hor">
        <span>
          Lugar <Optional />
        </span>
        <input
          type="text"
          className={styles.input}
          maxLength={200}
          placeholder="Sede, dirección, piso"
          value={form.lugar}
          onChange={({ target }) => {
            onChange({ lugar: target.value });
          }}
        />
      </label>
    </>
  );
}

export function ActionForm({
  form,
  mode,
  onChange,
  who,
  myLeader,
  times = null,
  hunterOfDay = null,
  exclude = null,
}: ActionFormProps) {
  const isDataList = form.tipo === "datos";
  const assigns = mode === "derivar";
  return (
    <div className={styles.form}>
      <div className={`${styles.formField}${assigns ? ` ${styles.full}` : ""}`}>
        <span>Tipo</span>
        <Pills
          name="tipo"
          options={typesFor(mode, form.tipo)}
          value={form.tipo}
          onChoose={(tipo) => {
            onChange({ tipo });
          }}
        />
      </div>
      {!isDataList && (
        <>
          <div className={styles.formField} data-section="mod">
            <span>Modalidad</span>
            <Pills
              name="modalidad"
              options={MODALITIES}
              value={form.modalidad}
              onChoose={(modalidad) => {
                onChange({ modalidad });
              }}
            />
          </div>
          <RepeatField form={form} mode={mode} onChange={onChange} times={times} />
        </>
      )}
      <label className={styles.formField}>
        <span>{isDataList ? "Desde" : "Fecha"}</span>
        <input
          type="date"
          className={styles.input}
          data-testid="form-date"
          value={form.fecha}
          onChange={({ target }) => {
            onChange({ fecha: target.value });
          }}
        />
      </label>
      {isDataList ? (
        <label className={styles.formField} data-section="datos">
          <span>
            Trabajarla hasta <Optional />
          </span>
          <input
            type="date"
            className={styles.input}
            value={form.vence}
            onChange={({ target }) => {
              onChange({ vence: target.value });
            }}
          />
        </label>
      ) : (
        <ScheduleFields form={form} onChange={onChange} />
      )}
      {assigns ? (
        <>
          <HunterFields form={form} mode={mode} onChange={onChange} who={who} myLeader={myLeader} />
          {isDataList && (
            <PeopleOfList
              text={form.personas}
              onChange={(personas) => {
                onChange({ personas });
              }}
            />
          )}
        </>
      ) : (
        <ResultFields form={form} mode={mode} onChange={onChange} isDataList={isDataList} />
      )}
      <Availability
        who={who}
        hunterField={assigns ? form.hunter : null}
        hunter={hunterOfDay}
        date={form.fecha}
        from={form.desde}
        to={form.hasta}
        isDataList={isDataList}
        exclude={exclude}
        onChooseHunter={(hunter) => {
          onChange({ hunter });
        }}
      />
      {/* The week of the hunter goes here: gesAgPanel, with the agenda. */}
      <label className={`${styles.full} ${styles.formField}`}>
        <span>Nota</span>
        <textarea
          className={styles.input}
          rows={2}
          maxLength={2000}
          placeholder={notePlaceholder(isDataList, mode)}
          value={form.nota}
          onChange={({ target }) => {
            onChange({ nota: target.value });
          }}
        />
      </label>
    </div>
  );
}
