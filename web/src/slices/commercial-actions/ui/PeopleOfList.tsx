// The list of a data list, pasted from a spreadsheet, with its preview.
import { cuilOrReferenceText } from "../model/tax-ids.ts";
import { MAX_PEOPLE_ON_LIST } from "../model/labels.ts";
import { parsePeople } from "../model/people-paste.ts";
import { Chip } from "./parts.tsx";
import styles from "./CommercialActions.module.css";

const ROWS_SHOWN = 6;
const PROBLEMS_SHOWN = 3;
const PLACEHOLDER = "Ana Pérez\t11 5555-1234\tLegajo 302";

function Preview({ text }: { readonly text: string }) {
  const people = parsePeople(text, false, []);
  if (people.length === 0) return null;
  const ready = people.filter(({ ok }) => ok);
  const problems = people.filter(({ ok }) => !ok);
  const problemNames = problems
    .slice(0, PROBLEMS_SHOWN)
    .map(({ nombre, motivo }) => `${nombre ?? "?"} (${motivo})`)
    .join(", ");
  return (
    <>
      <div className={styles.pasteResult}>
        <Chip tone="ok">
          {ready.length}
          {ready.length === 1 ? " persona lista" : " personas listas"}
        </Chip>
        {problems.length > 0 && (
          <Chip tone="bad">
            {problems.length} con problemas (no se agregan): {problemNames}
            {problems.length > PROBLEMS_SHOWN ? "…" : ""}
          </Chip>
        )}
        {ready.length > MAX_PEOPLE_ON_LIST && (
          <Chip tone="warn">Se cargan las primeras {MAX_PEOPLE_ON_LIST}</Chip>
        )}
      </div>
      <div className={styles.tableBox}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Contacto</th>
              <th>CUIL / Ref.</th>
            </tr>
          </thead>
          <tbody>
            {ready.slice(0, ROWS_SHOWN).map((person, index) => (
              // The same text can come twice: the position is what tells them apart.
              <tr key={`${String(index)}${person.nombre ?? ""}`}>
                <td>{person.nombre}</td>
                <td>{person.contacto ?? "—"}</td>
                <td className={styles.digits}>{cuilOrReferenceText(person) || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ready.length > ROWS_SHOWN && (
        <p className={styles.note}>Y {ready.length - ROWS_SHOWN} más.</p>
      )}
    </>
  );
}

export function PeopleOfList({
  text,
  onChange,
}: {
  readonly text: string;
  readonly onChange: (text: string) => void;
}) {
  return (
    <div className={`${styles.full} ${styles.formField}`} data-section="datos">
      <span>Personas para contactar</span>
      <span className={`${styles.mini} ${styles.pasteHelp}`}>
        Pegá desde Excel una fila por persona: <b>nombre</b>, <b>teléfono o mail</b> y{" "}
        <b>CUIL o referencia</b> (legajo, sector, DNI…), en cualquier orden. Sólo el nombre es
        obligatorio.
      </span>
      <textarea
        className={`${styles.input} ${styles.peopleText}`}
        rows={5}
        data-testid="form-people"
        placeholder={PLACEHOLDER}
        value={text}
        onChange={({ target }) => {
          onChange(target.value);
        }}
      />
      <div data-testid="form-people-preview">
        <Preview text={text} />
      </div>
    </div>
  );
}
