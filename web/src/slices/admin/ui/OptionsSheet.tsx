import { useEffect, useRef, useState } from "react";
import { FLYER_TABS, type FlyerOption } from "@/shared/domain/flyer-options.ts";
import { titleOf } from "@/shared/domain/screen-titles.ts";
import { useScreenTitles } from "@/shared/lib/app-config/screen-titles-query.ts";
import { Button, ConfirmDialog, SectionLabel } from "@/shared/ui/index.ts";
import {
  type ActiveNames,
  activeText,
  CATEGORY_CHOICES,
  categoryByNameLabel,
  type DraftField,
  FIRST_OPTION,
  isCurrentOfCategory,
  OPTION_NAME_LENGTH,
  type OptionDraft,
  removeOptionQuestion,
  replaceableBy,
} from "../model/options-sheet.ts";
import { useOptionsSheet } from "../model/use-options-sheet.ts";
import { ReadProblem } from "./ReadProblem.tsx";
import styles from "./Config.module.css";
import panel from "./Panel.module.css";

interface RowProps {
  readonly draft: OptionDraft;
  readonly drafts: readonly OptionDraft[];
  readonly saved: readonly FlyerOption[];
  readonly active: ActiveNames | undefined;
  readonly takesFocus: boolean;
  readonly onSet: (field: DraftField, value: string) => void;
  readonly onRemove: () => void;
}

function TabChoice({ draft, onSet }: Pick<RowProps, "draft" | "onSet">) {
  const { titles } = useScreenTitles();
  return (
    <select
      className={styles.choice}
      title="En qué solapa del header aparece"
      aria-label="Solapa"
      value={draft.solapa}
      disabled={draft.n === FIRST_OPTION}
      onChange={(event) => {
        onSet("solapa", event.target.value);
      }}
    >
      {FLYER_TABS.map((tab) => (
        <option key={tab} value={tab}>
          {titleOf(titles, tab)}
        </option>
      ))}
    </select>
  );
}

function CategoryChoice({ draft, onSet }: Pick<RowProps, "draft" | "onSet">) {
  return (
    <select
      className={styles.choice}
      title="De qué rubro es este flyer. Las empresas de ese rubro van siempre al último flyer que tenga este valor."
      aria-label="Rubro"
      value={draft.rubro}
      onChange={(event) => {
        onSet("rubro", event.target.value);
      }}
    >
      <option value="">{categoryByNameLabel(draft.nombre)}</option>
      {CATEGORY_CHOICES.map(([category, name]) => (
        <option key={category} value={category}>
          Rubro: {name}
        </option>
      ))}
    </select>
  );
}

function ReplacesChoice({ draft, drafts, onSet }: Pick<RowProps, "draft" | "drafts" | "onSet">) {
  return (
    <select
      className={styles.choice}
      title="Si este flyer reemplaza a uno anterior, las empresas que tenían cargado el viejo pasan solas a éste"
      aria-label="Reemplaza a"
      value={String(draft.reemplaza)}
      onChange={(event) => {
        onSet("reemplaza", event.target.value);
      }}
    >
      <option value="0">No reemplaza a ninguno</option>
      {replaceableBy(drafts, draft).map((other) => (
        <option key={other.n} value={String(other.n)}>
          Reemplaza a: {other.nombre}
        </option>
      ))}
    </select>
  );
}

function OptionStatus({
  active,
  option,
}: {
  readonly active: ActiveNames | undefined;
  readonly option: number;
}) {
  const text = activeText(active, option);
  const name = text.startsWith("Flyer activo: ") ? text.slice("Flyer activo: ".length) : "";
  return (
    <div className={styles.status} data-testid="option-status">
      {name ? (
        <>
          Flyer activo: <b>{name}</b>
        </>
      ) : (
        text
      )}
    </div>
  );
}

function OptionRow({ draft, drafts, saved, active, takesFocus, onSet, onRemove }: RowProps) {
  const name = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!takesFocus) return;
    name.current?.focus();
    name.current?.select();
  }, [takesFocus]);
  const isFirst = draft.n === FIRST_OPTION;
  return (
    <div className={styles.option} data-testid="option-row" data-n={draft.n}>
      <div className={styles.number} style={{ background: draft.color }}>
        {draft.n}
      </div>
      <input
        ref={name}
        type="text"
        className={styles.optionName}
        maxLength={OPTION_NAME_LENGTH}
        placeholder="Nombre de la opción"
        aria-label="Nombre de la opción"
        value={draft.nombre}
        onChange={(event) => {
          onSet("nombre", event.target.value);
        }}
      />
      <input
        type="color"
        className={styles.color}
        title="Color"
        aria-label="Color"
        value={draft.color}
        onChange={(event) => {
          onSet("color", event.target.value);
        }}
      />
      <TabChoice draft={draft} onSet={onSet} />
      {draft.solapa === "rubros" && <CategoryChoice draft={draft} onSet={onSet} />}
      {!isFirst && <ReplacesChoice draft={draft} drafts={drafts} onSet={onSet} />}
      {isFirst ? (
        <span className={styles.hint}>La de todos los asesores</span>
      ) : (
        <Button variant="soft-danger" size="xs" onClick={onRemove}>
          Quitar
        </Button>
      )}
      {isCurrentOfCategory(draft, saved) && (
        <span
          className={styles.current}
          title="Las empresas de este rubro salen con este flyer"
          data-testid="option-current"
        >
          VIGENTE
        </span>
      )}
      <OptionStatus active={active} option={draft.n} />
    </div>
  );
}

function Intro() {
  return (
    <p className={styles.intro}>
      Cada opción es un <strong>armador completo</strong>: tiene su propio flyer activo, su propio
      legal y su calibración. Acá agregás opciones nuevas y les ponés nombre y color. Al agregar
      una, <strong>aparece sola en Facultades</strong> (para decidir qué perfil la ve), en Legales,
      en Subir flyer y en el selector del armador. La <strong>Opción 1</strong> es la de todos los
      asesores y no se puede quitar.
      <br />
      <br />
      El selector <strong>Solapa</strong> dice en qué solapa del header vive la opción:{" "}
      <strong>Flyer Galicia</strong> (el armador de siempre) o <strong>Flyer Rubros</strong> (el
      mismo armador, pero el flyer trae el cuadro «¡Beneficio exclusivo EMPRESA!» con un tope de
      reintegro editable: combustible, supermercado, etc.). Para sumar un rubro nuevo: agregás la
      opción, la ponés en Flyer Rubros, subís su PDF limpio (con el cuadro del beneficio vacío) y lo
      calibrás: el calibrador elige la plantilla por el nombre de la opción (Combustible,
      Supermercado o Ambos = las dos columnas con dos topes) y centra el cartel solo. La solapa
      Flyer Rubros aparece en el header de cada perfil que tenga habilitada al menos una de esas
      opciones.
      <br />
      <br />
      Cuando llega la campaña nueva, el flyer que la reemplaza va en una{" "}
      <strong>opción aparte</strong> (tiene su propia imagen, su legal y su calibración). Para que
      las empresas no se queden en el flyer viejo, en la opción nueva elegí{" "}
      <strong>«Reemplaza a»</strong> y marcá la anterior: las que tenían cargado ese rubro en{" "}
      <em>Mis empresas</em> pasan solas a la nueva, sin tocar un solo dato, y lo mismo vale para la
      campaña siguiente (se va encadenando). Un Excel viejo que nombre el flyer anterior también
      entra derecho al vigente.
    </p>
  );
}

function Foot() {
  return (
    <p className={styles.foot}>
      Quitar una opción la saca de la vista de todos, pero <strong>no borra</strong> su flyer ni su
      legal guardados: si la volvés a agregar con el mismo número, reaparecen.
      <br />
      <br />
      La <strong>solapa</strong> dice en qué armador del header vive cada opción.{" "}
      <strong>Flyer Sueldo</strong> imprime <strong>un solo importe de cashback</strong> (el más
      alto de la configuración que tenga elegida el asesor) en vez de los cuatro montos. Si cambiás
      de solapa una opción que ya tenía flyer, <strong>volvé a calibrarla</strong>: el importe único
      y las cuatro cajas se ubican por separado.
    </p>
  );
}

/** Config → Opciones: the flyers of each tab, their names, colors and what replaces what. */
export function OptionsSheet() {
  const sheet = useOptionsSheet();
  const [removing, setRemoving] = useState<OptionDraft | null>(null);
  const { drafts, saved } = sheet;
  const question = removing
    ? removeOptionQuestion(removing, sheet.active?.get(removing.n) ?? "")
    : null;

  return (
    <div data-testid="admin-options">
      <SectionLabel className={panel.label}>Opciones del armador</SectionLabel>
      <Intro />
      {sheet.failure && (
        <ReadProblem
          message="No se pudo leer la lista de opciones"
          detail={sheet.failure}
          onRetry={sheet.reload}
        />
      )}
      {!drafts && !sheet.failure && <p className={styles.loading}>Cargando...</p>}
      {drafts &&
        saved &&
        drafts.map((draft, index) => (
          <OptionRow
            key={draft.n}
            draft={draft}
            drafts={drafts}
            saved={saved}
            active={sheet.active}
            takesFocus={sheet.added === draft.n}
            onSet={(field, value) => {
              sheet.set(index, field, value);
            }}
            onRemove={() => {
              setRemoving(draft);
            }}
          />
        ))}
      <div className={`${styles.buttons} ${styles.close12}`}>
        <Button variant="soft-neutral" size="xs" disabled={!drafts} onClick={sheet.add}>
          + Agregar opción
        </Button>
        <Button size="sm" disabled={!drafts || sheet.saving} onClick={() => void sheet.save()}>
          {sheet.saving ? "Guardando..." : "Guardar cambios"}
        </Button>
        <Button variant="soft-neutral" size="xs" onClick={sheet.reload}>
          Recargar
        </Button>
      </div>
      <Foot />
      {removing && question && (
        <ConfirmDialog
          title={question.title}
          confirmLabel="Quitar"
          danger
          onCancel={() => {
            setRemoving(null);
          }}
          onConfirm={() => {
            setRemoving(null);
            // By its number: if the list changed meanwhile, the right one still goes.
            const index = drafts?.findIndex(({ n }) => n === removing.n) ?? -1;
            if (index >= 0) sheet.remove(index);
          }}
        >
          {question.body}
        </ConfirmDialog>
      )}
    </div>
  );
}
