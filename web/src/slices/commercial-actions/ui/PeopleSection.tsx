// The people of an action: the prospects of a visit, or those to contact on a data list.
import { useEffect, useRef, useState } from "react";
import { Button } from "@/shared/ui/index.ts";
import type { PersonRow } from "../api/rows.ts";
import { dateLabel, today } from "../model/formatting.ts";
import {
  DISCARD_REASONS,
  OPEN_PERSON_STATES,
  PACKAGES,
  PACKAGES_SHORT,
  PERSON_STATES,
} from "../model/labels.ts";
import { parsePeople } from "../model/people-paste.ts";
import { contactLink, cuilOrReferenceText, readCuilOrReference } from "../model/tax-ids.ts";
import type { PeopleEditing } from "../model/use-people-editing.ts";
import { Chip } from "./parts.tsx";
import styles from "./CommercialActions.module.css";

const PROBLEMS_SHOWN = 4;
const PASTE_PLACEHOLDER = "Ana Pérez\t11 5555-1234\t27-12345678-3\tPlus Gold";

function stateClass(state: string): string | undefined {
  if (state === "alta") return styles.stateSignup;
  if (state === "descartado") return styles.stateDiscarded;
  return state === "en_gestion" ? styles.stateWorking : undefined;
}

function PackageOptions() {
  return (
    <>
      {Object.entries(PACKAGES).map(([key, label]) => (
        <option key={key} value={key}>
          {label}
        </option>
      ))}
    </>
  );
}

function Contact({ value }: { readonly value: string | null }) {
  const contact = value?.trim() ?? "";
  if (!contact) return <span className={styles.mini}>—</span>;
  const link = contactLink(contact);
  return link ? (
    <a className={styles.contact} href={link}>
      {contact}
    </a>
  ) : (
    <>{contact}</>
  );
}

function NextContact({
  person,
  canEdit,
  editing,
}: {
  readonly person: PersonRow;
  readonly canEdit: boolean;
  readonly editing: PeopleEditing;
}) {
  const { estado, proximo: next, nombre } = person;
  if (!OPEN_PERSON_STATES.has(estado)) return null;
  if (!canEdit) {
    return next ? (
      <div className={styles.reason}>Volver a contactar el {dateLabel(next)}</div>
    ) : null;
  }
  const isLate = Boolean(next) && (next ?? "") <= today();
  return (
    <div>
      <input
        type="date"
        className={`${styles.state} ${styles.next}${isLate ? ` ${styles.nextLate}` : ""}`}
        title="Próximo contacto"
        aria-label={`Próximo contacto con ${nombre}`}
        value={next ?? ""}
        onChange={({ target }) => {
          void editing.change(person, "proximo", target.value);
        }}
      />
    </div>
  );
}

function PersonState({
  person,
  canEdit,
  isDataList,
  editing,
}: {
  readonly person: PersonRow;
  readonly canEdit: boolean;
  readonly isDataList: boolean;
  readonly editing: PeopleEditing;
}) {
  const { estado, nombre, fecha_alta: since, motivo } = person;
  const look = stateClass(estado);
  const states = Object.entries(PERSON_STATES).filter(
    ([key]) => key !== "a_contactar" || isDataList || estado === "a_contactar",
  );
  return (
    <>
      {canEdit ? (
        <select
          className={`${styles.state}${look ? ` ${look}` : ""}`}
          aria-label={`Estado de ${nombre}`}
          value={estado}
          onChange={({ target }) => {
            void editing.change(person, "estado", target.value);
          }}
        >
          {states.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      ) : (
        <span className={`${styles.state}${look ? ` ${look}` : ""}`}>{PERSON_STATES[estado]}</span>
      )}
      {estado === "alta" && since && <div className={styles.mini}>desde el {dateLabel(since)}</div>}
      {estado === "descartado" && motivo && (
        <div className={styles.reason}>{DISCARD_REASONS[motivo] ?? motivo}</div>
      )}
      <NextContact person={person} canEdit={canEdit} editing={editing} />
    </>
  );
}

function PersonLine({
  person,
  canEdit,
  isDataList,
  isHighlighted,
  editing,
}: {
  readonly person: PersonRow;
  readonly canEdit: boolean;
  readonly isDataList: boolean;
  readonly isHighlighted: boolean;
  readonly editing: PeopleEditing;
}) {
  const { nombre, contacto, paquete, estado } = person;
  const cuil = cuilOrReferenceText(person);
  return (
    <tr
      className={isHighlighted ? styles.highlighted : undefined}
      data-testid="person-row"
      data-person-id={person.id}
      data-person-name={nombre}
      data-status={estado}
      data-package={paquete ?? ""}
      data-reason={person.motivo ?? ""}
      data-highlighted={isHighlighted}
    >
      <td>{nombre}</td>
      <td>
        <Contact value={contacto} />
      </td>
      <td className={styles.digits}>{cuil || <span className={styles.mini}>—</span>}</td>
      <td>
        {canEdit ? (
          <select
            className={styles.state}
            aria-label={`Paquete de ${nombre}`}
            value={paquete ?? ""}
            onChange={({ target }) => {
              void editing.change(person, "paquete", target.value);
            }}
          >
            {estado === "alta" && paquete ? null : <option value="">—</option>}
            <PackageOptions />
          </select>
        ) : (
          (PACKAGES_SHORT[paquete ?? ""] ?? "—")
        )}
      </td>
      <td>
        <PersonState person={person} canEdit={canEdit} isDataList={isDataList} editing={editing} />
      </td>
      {canEdit && (
        <td className={styles.right}>
          <button
            type="button"
            className={styles.remove}
            title="Quitar"
            aria-label={`Quitar a ${nombre}`}
            onClick={() => void editing.remove(person)}
          >
            ×
          </button>
        </td>
      )}
    </tr>
  );
}

function AddOne({ editing }: { readonly editing: PeopleEditing }) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [cuil, setCuil] = useState("");
  const [pack, setPack] = useState("");
  const nameField = useRef<HTMLInputElement>(null);
  const add = async () => {
    const isAdded = await editing.add({
      name: name.trim(),
      contact: contact.trim(),
      cuilOrReference: readCuilOrReference(cuil),
      pack,
    });
    if (!isAdded) return;
    setName("");
    setContact("");
    setCuil("");
    setPack("");
    nameField.current?.focus();
  };
  return (
    <div className={styles.add}>
      <input
        ref={nameField}
        type="text"
        className={styles.input}
        placeholder="Nombre y apellido"
        maxLength={120}
        value={name}
        onChange={({ target }) => {
          setName(target.value);
        }}
      />
      <input
        type="text"
        className={styles.input}
        placeholder="Teléfono o mail (opcional)"
        maxLength={120}
        value={contact}
        onChange={({ target }) => {
          setContact(target.value);
        }}
      />
      <input
        type="text"
        className={styles.input}
        placeholder="CUIL o referencia (opcional)"
        maxLength={120}
        value={cuil}
        onChange={({ target }) => {
          setCuil(target.value);
        }}
      />
      <select
        className={styles.input}
        aria-label="Paquete"
        value={pack}
        onChange={({ target }) => {
          setPack(target.value);
        }}
      >
        <option value="">Paquete</option>
        <PackageOptions />
      </select>
      <Button className={styles.small} onClick={() => void add()}>
        Agregar
      </Button>
    </div>
  );
}

function PasteResult({ people }: { readonly people: ReturnType<typeof parsePeople> }) {
  const ready = people.filter(({ ok }) => ok);
  const problems = people.filter(({ ok }) => !ok);
  const withNoId = ready.filter(({ cuil, referencia }) => !cuil && !referencia).length;
  const names = problems
    .slice(0, PROBLEMS_SHOWN)
    .map(({ nombre, motivo }) => `${nombre ?? "?"} (${motivo})`)
    .join(", ");
  return (
    <div className={styles.pasteResult} data-testid="paste-result">
      {people.length > 0 && (
        <>
          <Chip tone="ok">{ready.length} listos</Chip>
          {withNoId > 0 && <Chip tone="warn">{withNoId} sin CUIL ni referencia</Chip>}
          {problems.length > 0 && (
            <Chip tone="bad">
              {problems.length} con problemas: {names}
              {problems.length > PROBLEMS_SHOWN ? "…" : ""}
            </Chip>
          )}
        </>
      )}
    </div>
  );
}

function PasteMany({
  people,
  editing,
  pending,
}: {
  readonly people: readonly PersonRow[];
  readonly editing: PeopleEditing;
  /** The list that could not be loaded when the data list was created. */
  readonly pending: string | null;
}) {
  const [text, setText] = useState(pending ?? "");
  const [isOpen, setOpen] = useState(pending !== null);
  const [isAdding, setAdding] = useState(false);
  const parsed = parsePeople(text, true, people);
  const ready = parsed.filter(({ ok }) => ok).length;
  const add = async () => {
    setAdding(true);
    const rest = await editing.addPasted(parsed);
    setAdding(false);
    if (rest === null) return;
    setText(rest);
    setOpen(rest !== "");
  };
  return (
    <details
      className={styles.paste}
      data-testid="paste-people"
      open={isOpen}
      onToggle={({ currentTarget }) => {
        setOpen(currentTarget.open);
      }}
    >
      <summary>Pegar varios desde Excel</summary>
      <p className={styles.mini}>
        Copiá las filas del Excel (nombre, teléfono o mail, CUIL o referencia y paquete, en
        cualquier orden) y pegalas acá. El paquete se reconoce escrito como en la lista (Sin
        paquete, Plus, Plus Gold, Eminent Black…).
      </p>
      <textarea
        className={styles.input}
        rows={4}
        data-testid="paste-people-text"
        placeholder={PASTE_PLACEHOLDER}
        value={text}
        onChange={({ target }) => {
          setText(target.value);
        }}
      />
      <PasteResult people={parsed} />
      <Button
        className={styles.small}
        data-testid="paste-people-add"
        disabled={ready === 0 || isAdding}
        onClick={() => void add()}
      >
        {isAdding && "Agregando…"}
        {!isAdding && (ready > 0 ? `Agregar ${String(ready)} a la lista` : "Agregar a la lista")}
      </Button>
    </details>
  );
}

function sectionHelp(isDataList: boolean) {
  return isDataList ? (
    <>
      Pasá cada persona a <b>Prospecto</b> o <b>En gestión</b> cuando la contactes, y a <b>Alta</b>{" "}
      cuando el sueldo cae en Galicia.
    </>
  ) : (
    <>
      Cuando el sueldo cae en Galicia, pasá el estado a <b>Alta</b> (te pregunta si fue con paquete
      o sin paquete).
    </>
  );
}

interface PeopleSectionProps {
  readonly people: readonly PersonRow[];
  readonly canEdit: boolean;
  readonly isDataList: boolean;
  readonly highlighted: string | null;
  readonly pendingList: string | null;
  readonly editing: PeopleEditing;
}

export function PeopleSection({
  people,
  canEdit,
  isDataList,
  highlighted,
  pendingList,
  editing,
}: PeopleSectionProps) {
  // Arriving from "Para contactar": the view goes to that person, only the first time.
  const row = useRef<HTMLTableSectionElement>(null);
  const didGo = useRef(false);
  useEffect(() => {
    if (!highlighted || didGo.current) return;
    const found = row.current?.querySelector('[data-highlighted="true"]');
    if (found) {
      didGo.current = true;
      found.scrollIntoView({ block: "center" });
    }
  });
  return (
    <section className={`${styles.card} ${styles.padded}`}>
      <div className={styles.sectionHead}>
        <span className={styles.sectionTitle}>
          {isDataList ? "Personas para contactar" : "Prospectos"}
        </span>
        {canEdit && <span className={styles.mini}>{sectionHelp(isDataList)}</span>}
      </div>
      <div className={styles.tableBox}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Contacto</th>
              <th>CUIL / Ref.</th>
              <th>Paquete</th>
              <th>Estado</th>
              {canEdit && <th aria-label="Quitar" />}
            </tr>
          </thead>
          <tbody ref={row} data-testid="people-table">
            {people.length > 0 ? (
              people.map((person) => (
                <PersonLine
                  key={person.id}
                  person={person}
                  canEdit={canEdit}
                  isDataList={isDataList}
                  isHighlighted={person.id === highlighted}
                  editing={editing}
                />
              ))
            ) : (
              <tr>
                <td colSpan={6} className={`${styles.mini} ${styles.tablePeopleEmpty}`}>
                  {isDataList
                    ? "La base no tiene personas cargadas."
                    : "Todavía no hay prospectos."}
                  {canEdit ? " Agregalos de a uno o pegá un bloque desde Excel." : ""}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {canEdit && (
        <>
          <AddOne editing={editing} />
          <PasteMany people={people} editing={editing} pending={pendingList} />
        </>
      )}
    </section>
  );
}
