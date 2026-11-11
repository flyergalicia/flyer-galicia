import { useEffect, useMemo, useRef, useState } from "react";
import {
  cashbackCell,
  cashbackName,
  categoryLabel,
  type Company,
  formatTaxId,
  officerCount,
  parseTaxIds,
  sanitizeCategory,
} from "@/shared/domain/company-registry/index.ts";
import { richTextOf } from "@/shared/domain/rich-text.ts";
import { DecisionDialog } from "@/shared/ui/decision-dialog/DecisionDialog.ts";
import type {
  ChangeContext,
  ChangeLine,
  CompanyChange,
  FlyerForm,
} from "../model/company-changes.ts";
import { RichLine } from "./RichLine.tsx";

const TAX_ID_LENGTH = 11;
const TAX_ID_FIELD = "company-tax-ids";
const SHOWN_NAMES = 3;

function ChangeLines({ lines }: { readonly lines: readonly ChangeLine[] }) {
  return (
    <DecisionDialog.List>
      {lines.map(({ text, removal = false }) => (
        <DecisionDialog.Item key={richTextOf(text)} danger={removal}>
          <RichLine text={text} />
        </DecisionDialog.Item>
      ))}
    </DecisionDialog.List>
  );
}

/** Two different groups can share a tax id: it is said, without stopping anybody. */
function othersWithTaxIds(
  cuits: readonly string[],
  rows: readonly Company[],
  except: Company | null,
): string[] {
  return rows
    .filter((row) => row !== except && row.cuits.some((cuit) => cuits.includes(cuit)))
    .map(({ empresa }) => empresa || "(sin razón social)");
}

function TaxIdNote({
  text,
  rows,
  except,
}: {
  readonly text: string;
  readonly rows: readonly Company[];
  readonly except: Company | null;
}) {
  const cuits = useMemo(() => parseTaxIds(text), [text]);
  if (cuits.length === 0) {
    return (
      <DecisionDialog.Hint>
        Opcional. Si la empresa es un grupo, poné los CUIT separados por coma — con o sin guiones,
        da igual.
      </DecisionDialog.Hint>
    );
  }
  const wrong = cuits.filter((cuit) => cuit.length !== TAX_ID_LENGTH).length;
  const others = othersWithTaxIds(cuits, rows, except);
  const more = others.length - SHOWN_NAMES;
  return (
    <DecisionDialog.Hint warn={wrong > 0 || others.length > 0}>
      Se guardan {cuits.length}: <strong>{cuits.map(formatTaxId).join("  ·  ")}</strong>
      {wrong > 0 && (
        <>
          <br />⚠ {wrong}
          {wrong > 1 ? " no tienen" : " no tiene"} 11 dígitos. Revisá que estén completos.
        </>
      )}
      {others.length > 0 && (
        <>
          <br />⚠ Ese CUIT ya figura en <strong>{others.slice(0, SHOWN_NAMES).join(", ")}</strong>
          {more > 0 ? ` y ${String(more)} más` : ""}. Se guarda igual: al buscar ese CUIT van a
          aparecer las dos.
        </>
      )}
    </DecisionDialog.Hint>
  );
}

function TaxIdField({
  value,
  onChange,
  rows,
  except,
  takesFocus = false,
}: {
  readonly value: string;
  readonly onChange: (text: string) => void;
  readonly rows: readonly Company[];
  readonly except: Company | null;
  readonly takesFocus?: boolean;
}) {
  const field = useRef<HTMLInputElement>(null);
  // It asks for this on purpose: it is what is left to complete. After the window takes the focus.
  useEffect(() => {
    if (!takesFocus) return undefined;
    const later = setTimeout(() => {
      field.current?.focus();
    }, 0);
    return () => {
      clearTimeout(later);
    };
  }, [takesFocus]);
  return (
    <DecisionDialog.Field label="CUIT / CUITs del grupo" id={TAX_ID_FIELD}>
      <input
        ref={field}
        id={TAX_ID_FIELD}
        type="text"
        autoComplete="off"
        placeholder="30-71234567-8, 30709876543"
        value={value}
        onChange={({ target }) => {
          onChange(target.value);
        }}
      />
      <TaxIdNote text={value} rows={rows} except={except} />
    </DecisionDialog.Field>
  );
}

interface UpdateCompanyDialogProps {
  readonly change: CompanyChange;
  readonly form: FlyerForm;
  readonly rows: readonly Company[];
  readonly initialTaxIds: string;
  readonly onNo: () => void;
  readonly onUpdate: (change: CompanyChange, taxIds: string) => Promise<void>;
}

/** The company is on the list and the flyer came out with other data. */
export function UpdateCompanyDialog({
  change,
  form,
  rows,
  initialTaxIds,
  onNo,
  onUpdate,
}: UpdateCompanyDialogProps) {
  const [taxIds, setTaxIds] = useState(initialTaxIds);
  const [saving, setSaving] = useState(false);
  const { company, lines } = change;
  return (
    <DecisionDialog title="🔄 Actualizar mis empresas">
      <DecisionDialog.Text>
        Generaste el flyer de <strong>{company.empresa}</strong> con datos distintos a los que tenés
        guardados:
      </DecisionDialog.Text>
      {!form.officersShown && officerCount(company) > 0 && (
        <DecisionDialog.Alert>
          Ocultaste los oficiales: si actualizás,{" "}
          <strong>esta empresa queda guardada sin sus oficiales</strong>. Si sólo querías este flyer
          sin ellos, elegí «No, dejarlo como está».
        </DecisionDialog.Alert>
      )}
      <ChangeLines lines={lines} />
      <TaxIdField value={taxIds} onChange={setTaxIds} rows={rows} except={company} />
      <DecisionDialog.Text separated>
        Si lo actualizás, queda guardado para todos y la próxima vez que busques esta empresa ya
        sale con estos datos. Acordáte de <strong>bajarte el Excel</strong> si querés tener el Excel
        de tu computadora al día.
      </DecisionDialog.Text>
      <DecisionDialog.Foot>
        <DecisionDialog.No onClick={onNo}>No, dejarlo como está</DecisionDialog.No>
        <DecisionDialog.Yes
          disabled={saving}
          onClick={() => {
            setSaving(true);
            void onUpdate(change, taxIds);
          }}
        >
          {saving ? "Guardando..." : "Actualizar empresa"}
        </DecisionDialog.Yes>
      </DecisionDialog.Foot>
    </DecisionDialog>
  );
}

function NewCompanySummary({
  form,
  context,
}: {
  readonly form: FlyerForm;
  readonly context: ChangeContext;
}) {
  const { options, cashbackNames } = context;
  const named = form.officers.flatMap((officer, position) =>
    officer.nombre ? [{ officer, number: position + 1 }] : [],
  );
  const category = form.category?.opcion ? categoryLabel(form.category, options) : "";
  return (
    <DecisionDialog.List>
      <DecisionDialog.Item>
        Cashback: <strong>{cashbackName(form.cashback, cashbackNames)}</strong>
      </DecisionDialog.Item>
      {named.map(({ officer, number }) => (
        <DecisionDialog.Item key={number}>
          Oficial {number}: <strong>{officer.nombre}</strong>
          {officer.celular ? ` · ${officer.celular}` : ""}
        </DecisionDialog.Item>
      ))}
      {named.length === 0 && <DecisionDialog.Item>Sin oficiales asignados</DecisionDialog.Item>}
      {category && (
        <DecisionDialog.Item>
          Rubro: <strong>{category}</strong>
        </DecisionDialog.Item>
      )}
    </DecisionDialog.List>
  );
}

interface AddCompanyDialogProps {
  readonly form: FlyerForm;
  readonly rows: readonly Company[];
  readonly context: ChangeContext;
  readonly onNo: () => void;
  readonly onSave: (row: Company) => Promise<void>;
}

/** The name is not on the list: another name is another company, and it steps on nothing. */
export function AddCompanyDialog({ form, rows, context, onNo, onSave }: AddCompanyDialogProps) {
  const [taxIds, setTaxIds] = useState("");
  const [saving, setSaving] = useState(false);
  const name = form.empresa.trim();
  return (
    <DecisionDialog title="➕ Agregar a mis empresas">
      <DecisionDialog.Text>
        <strong>{name}</strong> no está en tus empresas. ¿La guardo con esta configuración para
        tenerla lista la próxima vez? Se agrega como empresa aparte: no pisa ninguna de las que ya
        tenés.
      </DecisionDialog.Text>
      <NewCompanySummary form={form} context={context} />
      <TaxIdField value={taxIds} onChange={setTaxIds} rows={rows} except={null} takesFocus />
      <DecisionDialog.Foot>
        <DecisionDialog.No onClick={onNo}>Ahora no</DecisionDialog.No>
        <DecisionDialog.Yes
          disabled={saving}
          onClick={() => {
            setSaving(true);
            void onSave({
              empresa: name,
              cuits: parseTaxIds(taxIds),
              config: cashbackCell(form.cashback, context.cashbackNames),
              asesores: form.officers,
              rubro: form.category ?? sanitizeCategory(null),
            });
          }}
        >
          {saving ? "Guardando..." : "Guardar empresa"}
        </DecisionDialog.Yes>
      </DecisionDialog.Foot>
    </DecisionDialog>
  );
}

interface SubstituteChangeDialogProps {
  readonly change: CompanyChange;
  readonly owner: { readonly id: string; readonly nombre: string };
  readonly onNo: () => void;
  readonly onAsk: (
    change: CompanyChange,
    owner: SubstituteChangeDialogProps["owner"],
  ) => Promise<boolean>;
}

/** A substitute can download with other data, but the list of the owner is not touched. */
export function SubstituteChangeDialog({
  change,
  owner,
  onNo,
  onAsk,
}: SubstituteChangeDialogProps) {
  const [sending, setSending] = useState(false);
  return (
    <DecisionDialog title={`📤 Cambios en una empresa de ${owner.nombre}`}>
      <DecisionDialog.Text>
        Generaste el flyer de <strong>{change.company.empresa}</strong> con datos distintos a los
        que tiene guardados {owner.nombre}:
      </DecisionDialog.Text>
      <ChangeLines lines={change.lines} />
      <DecisionDialog.Text separated>
        ¿Le pedimos que guarde estos cambios? Su base no cambia hasta que lo apruebe: le llega el
        pedido a <strong>Cambios pendientes</strong> y lo decide cuando vuelva.
      </DecisionDialog.Text>
      <DecisionDialog.Foot>
        <DecisionDialog.No onClick={onNo}>No, dejarlo como está</DecisionDialog.No>
        <DecisionDialog.Yes
          disabled={sending}
          onClick={() => {
            setSending(true);
            void onAsk(change, owner).then((sent) => {
              if (!sent) setSending(false);
            });
          }}
        >
          {sending ? "Enviando..." : `Pedírselo a ${owner.nombre}`}
        </DecisionDialog.Yes>
      </DecisionDialog.Foot>
    </DecisionDialog>
  );
}

/** A company brought from the search that is marked without cashback: it should not go unnoticed. */
export function NoCashbackDialog({
  company,
  onClose,
}: {
  readonly company: string;
  readonly onClose: () => void;
}) {
  return (
    <DecisionDialog title="⚠ Sin cashback">
      <DecisionDialog.Text>
        <strong>{company || "Esta empresa"}</strong> está marcada como <strong>sin cashback</strong>
        : el flyer se genera con los cuatro importes <strong>en blanco</strong>.
      </DecisionDialog.Text>
      <DecisionDialog.Text>
        Si en realidad le corresponde uno, elegílo en <strong>Configuración de Montos</strong> y
        listo (no hace falta tocar nada más).
      </DecisionDialog.Text>
      <DecisionDialog.Foot>
        <DecisionDialog.Yes onClick={onClose}>Entendido</DecisionDialog.Yes>
      </DecisionDialog.Foot>
    </DecisionDialog>
  );
}
