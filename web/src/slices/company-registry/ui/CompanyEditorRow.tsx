import { type Dispatch, memo, useState } from "react";
import {
  capsOf,
  capText,
  enabledCaps,
  type CompanyOfficer,
  kindOfCategory,
  officerCount,
  type Options,
  optionOfCategory,
  parseTaxIds,
  sanitizeCategory,
  storedCaps,
  taxIdsLine,
} from "@/shared/domain/company-registry/index.ts";
import { optionLabel } from "@/shared/domain/flyer-options.ts";
import { Button, Input, Select } from "@/shared/ui/index.ts";
import type { CompanyDraft, EditorAction } from "../model/company-editor.ts";
import styles from "./DatabaseWindow.module.css";

const OFFICER_FIELDS = [
  ["nombre", (position: number) => `Oficial ${String(position + 1)}: nombre`],
  ["celular", () => "Celular"],
  ["email", () => "Email"],
] as const;
const OFFICER_PLACES = [0, 1, 2, 3];
const CATEGORY_TEXT_LENGTH = 40;

export interface EditorChoices {
  readonly options: Options;
  /** Each configuration of cashback, by value and by what it reads. */
  readonly cashback: readonly (readonly [string, string])[];
  /** Only the flyers in force: choosing one that was replaced makes no sense. */
  readonly categories: readonly number[];
}

interface RowProps {
  readonly row: number;
  readonly company: CompanyDraft;
  readonly expanded: boolean;
  readonly choices: EditorChoices;
  readonly dispatch: Dispatch<EditorAction>;
  readonly onRemove: (row: number, name: string) => void;
}

function capsAsWritten(category: CompanyDraft["rubro"], options: Options) {
  const { fuel, grocery } = capsOf(category, options);
  return { fuel: capText(fuel), grocery: capText(grocery) };
}

function CategoryFields({
  row,
  company,
  choices,
  dispatch,
}: Omit<RowProps, "expanded" | "onRemove">) {
  const { options, categories } = choices;
  const category = sanitizeCategory(company.rubro);
  // What is being written is not rewritten under the finger: the caps come back formatted later.
  const [caps, setCaps] = useState(() => capsAsWritten(category, options));
  const allowed = enabledCaps(category, options);

  const chooseOption = (value: string) => {
    const before = capsOf(category, options);
    const opcion = Number.parseInt(value, 10) || 0;
    const chosen = {
      ...category,
      opcion,
      txt: opcion ? optionLabel(options, opcion).slice(0, CATEGORY_TEXT_LENGTH) : "",
    };
    // The cap that was there goes to the new category: from fuel to grocery it changes column.
    const moved = {
      ...chosen,
      ...storedCaps(kindOfCategory(chosen, options), before.fuel, before.grocery),
    };
    dispatch({ type: "category", row, category: moved });
    setCaps(capsAsWritten(moved, options));
  };
  const writeCap = (key: "fuel" | "grocery", value: string) => {
    const written = { ...caps, [key]: value };
    setCaps(written);
    dispatch({
      type: "category",
      row,
      category: {
        ...category,
        ...storedCaps(
          kindOfCategory(category, options),
          allowed.fuel ? written.fuel : "",
          allowed.grocery ? written.grocery : "",
        ),
      },
    });
  };
  return (
    <>
      <Select
        appearance="native"
        title="Rubro (Flyer Rubros)"
        aria-label="Rubro"
        value={optionOfCategory(category, options)}
        onChange={({ target }) => {
          chooseOption(target.value);
        }}
      >
        <option value="0">Sin rubro</option>
        {categories.map((option) => (
          <option key={option} value={option}>
            {optionLabel(options, option)}
          </option>
        ))}
      </Select>
      <Input
        data-testid="cap-field"
        placeholder="Tope combustible"
        title="Tope de reintegro de combustible"
        inputMode="numeric"
        value={caps.fuel}
        disabled={!allowed.fuel}
        onChange={({ target }) => {
          writeCap("fuel", target.value);
        }}
      />
      <Input
        data-testid="cap-field"
        placeholder="Tope súper"
        title="Tope de reintegro de supermercado"
        inputMode="numeric"
        value={caps.grocery}
        disabled={!allowed.grocery}
        onChange={({ target }) => {
          writeCap("grocery", target.value);
        }}
      />
    </>
  );
}

function OfficerFields({
  row,
  officers,
  dispatch,
}: {
  readonly row: number;
  readonly officers: readonly CompanyOfficer[];
  readonly dispatch: Dispatch<EditorAction>;
}) {
  return (
    <div className={styles.editorOfficers}>
      {OFFICER_PLACES.map((position) => (
        <div key={position} className={styles.editorOfficer} data-testid="officer-fields">
          {OFFICER_FIELDS.map(([key, placeholder]) => (
            <Input
              key={key}
              placeholder={placeholder(position)}
              value={officers[position]?.[key] ?? ""}
              onChange={({ target }) => {
                dispatch({
                  type: "officer",
                  row,
                  officer: position,
                  fields: { [key]: target.value },
                });
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function EditorRow({ row, company, expanded, choices, dispatch, onRemove }: RowProps) {
  // Written as it comes, and kept in digits: a tax id is not rewritten while it is typed.
  const [taxIds, setTaxIds] = useState(() => taxIdsLine(company, ", "));
  const hasCategories = choices.categories.length > 0;
  return (
    <div
      className={styles.editorRow}
      data-testid="company-editor-row"
      data-row={row}
      data-expanded={expanded}
    >
      <div
        className={
          hasCategories ? `${styles.editorMain} ${styles.withCategory}` : styles.editorMain
        }
      >
        <Input
          placeholder="Razón social"
          value={company.empresa}
          onChange={({ target }) => {
            dispatch({ type: "field", row, fields: { empresa: target.value } });
          }}
        />
        <Input
          placeholder="CUIT (separados por coma)"
          value={taxIds}
          onChange={({ target }) => {
            setTaxIds(target.value);
            dispatch({ type: "field", row, fields: { cuits: parseTaxIds(target.value) } });
          }}
        />
        <Select
          appearance="native"
          aria-label="Cashback"
          value={company.config}
          onChange={({ target }) => {
            dispatch({ type: "field", row, fields: { config: target.value } });
          }}
        >
          {choices.cashback.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        {hasCategories && (
          <CategoryFields row={row} company={company} choices={choices} dispatch={dispatch} />
        )}
        <Button
          variant="soft-neutral"
          size="xs"
          onClick={() => {
            dispatch({ type: "toggle-officers", row });
          }}
        >
          {expanded ? "▲" : "▼"} Oficiales ({officerCount(company)})
        </Button>
        <Button
          variant="soft-muted"
          size="xs"
          title="Eliminar empresa"
          aria-label="Eliminar empresa"
          onClick={() => {
            onRemove(row, company.empresa);
          }}
        >
          ✕
        </Button>
      </div>
      {/* They are built only when expanded: closed they were 36.000 fields with 3.000 companies. */}
      {expanded && <OfficerFields row={row} officers={company.asesores} dispatch={dispatch} />}
    </div>
  );
}

/** Only the row that changes draws again: there can be thousands. */
export const CompanyEditorRow = memo(EditorRow);
