// A flyer as the history and the session draft keep it. The keys are those of the browser of each
// person: they do not change. Nothing here knows about React or about a store.
import { formatAmount } from "@/shared/flyer-engine/amounts.ts";
import {
  type FlyerValues,
  OFFICER_SLOTS,
  type OfficerNumber,
  type OfficerSlot,
} from "@/shared/flyer-engine/types.ts";
import { BRANCH_PIN, capInField, type FlyerFormState, type OfficerDraft } from "./form-state.ts";

const USUAL_OFFICERS = 4;

export interface StoredFlyer {
  readonly v: FlyerValues;
  /** The cashback chosen. */
  readonly ac: number;
  readonly opt: number;
}

export interface HistoryItem extends StoredFlyer {
  /** The name of the file, without its extension. */
  readonly fn: string;
  readonly thumb: string;
  readonly hora: string;
  readonly ts: number;
}

function hasOfficer(values: FlyerValues, number: OfficerNumber, nombre: string): boolean {
  // Stored with the officers off, the switches say false and the names are there: they come back.
  if (values.sinOficiales) return Boolean(nombre.trim());
  // What was stored before the switches of each officer existed.
  if (number === 1 && values.has1 === undefined) return Boolean(nombre.trim());
  return Boolean(values[`has${number}`]);
}

function officerOfStored(
  officer: OfficerDraft,
  values: FlyerValues,
  [number, suffix]: OfficerSlot,
): OfficerDraft {
  const nombre = values[`nombre${suffix}`] ?? "";
  const limit = values.sedes ? OFFICER_SLOTS.length : USUAL_OFFICERS;
  const isThere = number <= limit && hasOfficer(values, number, nombre);
  const place = values[`ubic${number}`];
  return {
    ...officer,
    nombre: isThere ? nombre : "",
    celular: isThere ? (values[`celular${suffix}`] ?? "").replace("Cel: ", "") : "",
    email: isThere ? (values[`email${suffix}`] ?? "") : "",
    ubic: isThere && place ? place : values.sedes ? `${BRANCH_PIN} ` : "",
    // The first block stays open, always.
    on: number === 1 || isThere,
    shown: number === 1 || isThere,
  };
}

function benefitOfStored(values: FlyerValues) {
  if (!values.benef) return {};
  const name = values.benefNombre ?? "";
  const first = formatAmount(values.importe ?? "");
  const second = formatAmount(values.importe2 ?? "");
  return {
    // Empty also counts as written by hand.
    benefitName: name,
    benefitNameByHand: name !== (values.empresa ?? ""),
    cap: first ? capInField(first) : "",
    secondCap: second && second !== first ? capInField(second) : "",
  };
}

/**
 * A stored flyer back in the form. The officers are always written, whether it had them or not: the
 * ones of the flyer before do not stay stuck. It is no row of the list of companies.
 */
export function formOfStored(
  form: FlyerFormState,
  { v: values, ac }: Pick<StoredFlyer, "v" | "ac">,
): FlyerFormState {
  return {
    ...form,
    empresa: values.empresa ?? "",
    ...benefitOfStored(values),
    branches: Boolean(values.sedes),
    branchesTitle: values.sedes ? (values.sedesTit ?? "") : "",
    officers: form.officers.map((officer, position) => {
      const slot = OFFICER_SLOTS[position];
      return slot ? officerOfStored(officer, values, slot) : officer;
    }),
    officersOn: !values.sinOficiales,
    noCashback: Boolean(values.nocb),
    cashback: values.nocb ? form.cashback : ac || 0,
    chosen: null,
    note: "",
  };
}
