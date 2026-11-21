// What the form of the flyer editor says, and how each thing a person does changes it. Nothing here
// knows about React: `flyer-form.ts` keeps it, and the canvas reads it without a render.
import {
  type CompanyCategory,
  type CompanyOfficer,
  digitsOf,
  type FieldProblem,
  mailFromName,
  mailProblem,
  NO_CASHBACK_INDEX,
  OFFICERS_PER_COMPANY,
  phoneProblem,
  sanitizeCategory,
  type SearchableCompany,
} from "@/shared/domain/company-registry/index.ts";
import type { CashbackConfig } from "@/shared/domain/company-registry/cashback.ts";
import type { FlyerTab } from "@/shared/domain/flyer-options.ts";
import { formatAmount } from "@/shared/flyer-engine/amounts.ts";
import { type FlyerValues, OFFICER_SLOTS, type OfficerSlot } from "@/shared/flyer-engine/types.ts";
import { drawsSingleCashback } from "@/shared/lib/flyer-workspace/flyer-tab.ts";

/** With "oficiales por sede" there are eight. */
const ALL_OFFICERS = 8;
/** By code point: the emoji does not travel well in the source. */
export const BRANCH_PIN = String.fromCodePoint(0x1f4cd);
/** The field of the place starts with the pin, ready to complete beside it. */
const EMPTY_PLACE = `${BRANCH_PIN} `;
const USUAL_OFFICERS = OFFICERS_PER_COMPANY;
const BRANCH_OFFICERS = ALL_OFFICERS;
export const DEFAULT_FILE_NAME = "Flyer {empresa}";
const FILE_NAME_PREFIX = "Flyer_";
const DEFAULT_CAP = "24.000";
const NO_CASHBACK_NAME = "Sin cashback";

export type OfficerField = "nombre" | "celular" | "email";

export interface OfficerDraft {
  readonly nombre: string;
  readonly celular: string;
  readonly email: string;
  readonly ubic: string;
  /** It goes on the flyer, if it has a name. */
  readonly on: boolean;
  /** Its block is in sight. */
  readonly shown: boolean;
  /** The mail was written by hand or came from the list: the name does not suggest another one. */
  readonly mailByHand: boolean;
  /** What the last check of each field said. It marks and it does not stop anyone. */
  readonly phoneProblem: FieldProblem | null;
  readonly mailProblem: FieldProblem | null;
}

export interface FlyerFormState {
  readonly empresa: string;
  readonly officers: readonly OfficerDraft[];
  /** The switch "Mostrar en el flyer": off, none goes on the flyer and nothing is erased. */
  readonly officersOn: boolean;
  /** The configuration of cashback chosen. */
  readonly cashback: number;
  readonly noCashback: boolean;
  readonly fileName: string;
  readonly fileNameByHand: boolean;
  readonly benefitName: string;
  /** Written by hand, even empty: it does not copy the company anymore. */
  readonly benefitNameByHand: boolean;
  readonly cap: string;
  readonly secondCap: string;
  /** "Oficiales por sede": up to eight officers, each with the place it answers for. */
  readonly branches: boolean;
  readonly branchesTitle: string;
  /** The company the form came from, what changes are compared against. */
  readonly chosen: SearchableCompany | null;
  /** The warning under the field of the company. */
  readonly note: string;
  /** Officers with their box for pasting open. */
  readonly pasting: readonly number[];
}

export interface FormContext {
  readonly configs: readonly CashbackConfig[];
  readonly names: readonly string[];
  readonly tab: FlyerTab;
}

function emptyOfficer(position: number): OfficerDraft {
  const isFirst = position === 0;
  return {
    nombre: "",
    celular: "",
    email: "",
    ubic: EMPTY_PLACE,
    on: isFirst,
    shown: isFirst,
    mailByHand: false,
    phoneProblem: null,
    mailProblem: null,
  };
}

export function initialFormState(): FlyerFormState {
  return {
    empresa: "",
    officers: Array.from({ length: ALL_OFFICERS }, (_, position) => emptyOfficer(position)),
    officersOn: true,
    cashback: 0,
    noCashback: false,
    fileName: DEFAULT_FILE_NAME,
    fileNameByHand: false,
    benefitName: "",
    benefitNameByHand: false,
    cap: DEFAULT_CAP,
    secondCap: "",
    branches: false,
    branchesTitle: "",
    chosen: null,
    note: "",
    pasting: [],
  };
}

export function officersLimit({ branches }: Pick<FlyerFormState, "branches">): number {
  return branches ? BRANCH_OFFICERS : USUAL_OFFICERS;
}

/** The pin alone is no place. What the person wrote goes on the flyer letter by letter. */
export function placeText(raw: string): string {
  const text = raw.trim();
  return text.split(BRANCH_PIN).join("").trim() ? text : "";
}

function writeOfficer(
  values: FlyerValues,
  form: FlyerFormState,
  [number, suffix]: OfficerSlot,
): void {
  const position = number - 1;
  const officer = form.officers[position] ?? emptyOfficer(position);
  const phone = officer.celular.trim();
  const fits = position < officersLimit(form);
  values[`has${number}` as const] =
    form.officersOn && fits && officer.on && officer.nombre.trim() !== "";
  values[`nombre${suffix}` as const] = officer.nombre;
  values[`celular${suffix}` as const] = phone ? `Cel: ${phone}` : "";
  values[`email${suffix}` as const] = officer.email;
  values[`ubic${number}` as const] = form.branches ? placeText(officer.ubic) : "";
}

function amountsOf(configs: FormContext["configs"], cashback: number) {
  const { m1, m2, m3, m4 } = configs[cashback] ?? configs[0] ?? {};
  return { m1: m1 ?? null, m2: m2 ?? null, m3: m3 ?? null, m4: m4 ?? null };
}

/** What the flyer draws with this form, without the legal text and the logos: they are of the option. */
export function valuesOfForm(
  form: FlyerFormState,
  { configs, names, tab }: FormContext,
): FlyerValues {
  const firstCap = formatAmount(form.cap);
  const values: FlyerValues = {
    empresa: form.empresa,
    nocb: form.noCashback,
    config: form.noCashback ? NO_CASHBACK_NAME : (names[form.cashback] ?? ""),
    ...amountsOf(configs, form.cashback),
    sedes: form.branches,
    sedesTit: form.branches ? form.branchesTitle.trim() : "",
    benef: tab === "rubros",
    cashUnico: drawsSingleCashback(tab),
    // Empty on purpose: "¡Beneficio exclusivo!" with no company.
    benefNombre: form.benefitName.trim(),
    importe: firstCap,
    importe2: formatAmount(form.secondCap) || firstCap,
    ...(form.officersOn ? {} : { sinOficiales: true }),
  };
  for (const slot of OFFICER_SLOTS) writeOfficer(values, form, slot);
  return values;
}

function changeOfficer(
  form: FlyerFormState,
  position: number,
  change: (officer: OfficerDraft) => OfficerDraft,
): FlyerFormState {
  const officer = form.officers[position];
  return officer ? { ...form, officers: form.officers.with(position, change(officer)) } : form;
}

function followingCompany(form: FlyerFormState, empresa: string): FlyerFormState {
  return {
    ...form,
    empresa,
    fileName: form.fileNameByHand ? form.fileName : `${FILE_NAME_PREFIX}${empresa}`,
    benefitName: form.benefitNameByHand ? form.benefitName : empresa,
  };
}

/** The file name follows the company, and so does the benefit, until they are written by hand. */
export function withCompany(form: FlyerFormState, empresa: string): FlyerFormState {
  return followingCompany(form, empresa);
}

/** Out of a person typing: the check goes with the writing, as a person sees it. */
export function withOfficerField(
  form: FlyerFormState,
  position: number,
  field: OfficerField,
  text: string,
): FlyerFormState {
  return changeOfficer(form, position, (officer) => {
    if (field === "nombre") {
      // Touched by hand it stops suggesting; emptied, it suggests again.
      const suggested = !officer.mailByHand || !officer.email.trim() ? mailFromName(text) : "";
      return { ...officer, nombre: text, email: suggested || officer.email };
    }
    if (field === "celular") {
      return { ...officer, celular: text, phoneProblem: phoneProblem(text) };
    }
    return {
      ...officer,
      email: text,
      mailByHand: Boolean(text.trim()),
      mailProblem: mailProblem(text),
    };
  });
}

/** On leaving a field. */
export function withFieldChecked(
  form: FlyerFormState,
  position: number,
  field: "celular" | "email",
): FlyerFormState {
  return changeOfficer(form, position, (officer) =>
    field === "celular"
      ? { ...officer, phoneProblem: phoneProblem(officer.celular) }
      : { ...officer, mailProblem: mailProblem(officer.email) },
  );
}

export function withAllFieldsChecked(form: FlyerFormState): FlyerFormState {
  return {
    ...form,
    officers: form.officers.map((officer) => ({
      ...officer,
      phoneProblem: phoneProblem(officer.celular),
      mailProblem: mailProblem(officer.email),
    })),
  };
}

/** The first block that can be opened; -1 when all of them are in sight. */
export function nextFreeOfficer(form: FlyerFormState): number {
  const limit = officersLimit(form);
  return form.officers.findIndex(
    ({ shown }, position) => position > 0 && position < limit && !shown,
  );
}

export function withOfficerAdded(form: FlyerFormState, position: number): FlyerFormState {
  return changeOfficer(form, position, (officer) => ({ ...officer, on: true, shown: true }));
}

/** The first one is emptied and stays. A person who leaves leaves nothing behind for the next one. */
export function withOfficerEmptied(form: FlyerFormState, position: number): FlyerFormState {
  return changeOfficer(form, position, (officer) => ({
    ...officer,
    nombre: "",
    celular: "",
    email: "",
    ubic: EMPTY_PLACE,
    mailByHand: false,
  }));
}

export function withOfficerRemoved(form: FlyerFormState, position: number): FlyerFormState {
  return changeOfficer(withOfficerEmptied(form, position), position, (officer) => ({
    ...officer,
    on: false,
    shown: false,
  }));
}

export function officerHasData({ nombre, celular, email, ubic }: OfficerDraft): boolean {
  return Boolean(nombre || celular || email || placeText(ubic));
}

export function withOfficerPlace(
  form: FlyerFormState,
  position: number,
  ubic: string,
): FlyerFormState {
  return changeOfficer(form, position, (officer) => ({ ...officer, ubic }));
}

/** Turning it off would lose something: the title, a place, or an officer past the fourth. */
export function branchesHaveData(form: FlyerFormState): boolean {
  if (form.branchesTitle.trim()) return true;
  return form.officers.some(
    ({ ubic, nombre }, position) =>
      Boolean(placeText(ubic)) || (position >= USUAL_OFFICERS && Boolean(nombre.trim())),
  );
}

/** Off: the places, the title and the officers past the fourth are gone. Back to the usual four. */
export function withBranches(form: FlyerFormState, on: boolean): FlyerFormState {
  if (on) return { ...form, branches: true };
  return {
    ...form,
    branches: false,
    branchesTitle: "",
    officers: form.officers.map((officer, position) =>
      position < USUAL_OFFICERS ? { ...officer, ubic: EMPTY_PLACE } : emptyOfficer(position),
    ),
  };
}

export function withPastedOfficer(
  form: FlyerFormState,
  position: number,
  { nombre, celular, email }: CompanyOfficer,
): FlyerFormState {
  return changeOfficer(form, position, (officer) => ({
    ...officer,
    nombre,
    celular,
    email,
    // The mail comes only if it came written with its at sign: nothing is deduced from the name.
    mailByHand: Boolean(email),
    on: true,
    shown: true,
  }));
}

/** A saved advisor fills its slot. What was said about the mail stays as it was. */
export function withSavedAdvisor(
  form: FlyerFormState,
  position: number,
  { nombre, celular, email }: CompanyOfficer,
): FlyerFormState {
  return changeOfficer(form, position, (officer) => ({
    ...officer,
    nombre,
    celular,
    email,
    on: true,
    shown: true,
  }));
}

export function withPastedPhone(
  form: FlyerFormState,
  position: number,
  celular: string,
): FlyerFormState {
  return changeOfficer(form, position, (officer) => ({ ...officer, celular }));
}

export function withOfficerRestored(
  form: FlyerFormState,
  position: number,
  before: Pick<OfficerDraft, OfficerField | "mailByHand">,
): FlyerFormState {
  return changeOfficer(form, position, (officer) => ({ ...officer, ...before }));
}

export function withCashback(form: FlyerFormState, cashback: number): FlyerFormState {
  return { ...form, cashback, noCashback: false };
}

/** The company has no valid cashback: the amounts go blank. What was chosen is not touched. */
export function withNoCashback(form: FlyerFormState): FlyerFormState {
  return { ...form, noCashback: true };
}

/** A pattern written by hand stays when the company changes. */
export function withFileName(form: FlyerFormState, fileName: string): FlyerFormState {
  return { ...form, fileName, fileNameByHand: true };
}

export function withBenefitName(form: FlyerFormState, benefitName: string): FlyerFormState {
  return { ...form, benefitName, benefitNameByHand: true };
}

export function withBenefitNameFromCompany(form: FlyerFormState): FlyerFormState {
  return { ...form, benefitName: form.empresa, benefitNameByHand: false };
}

/** In the field it goes without "$": it is added on drawing. */
export function capInField(raw: string): string {
  return formatAmount(raw).slice(1);
}

function officerOfCompany(
  officer: OfficerDraft,
  fromList: CompanyOfficer | undefined,
  position: number,
): OfficerDraft {
  const isFirst = position === 0;
  if (!fromList?.nombre.trim()) {
    return {
      ...officer,
      nombre: "",
      celular: "",
      email: "",
      mailByHand: false,
      on: isFirst,
      shown: isFirst,
    };
  }
  return {
    ...officer,
    nombre: fromList.nombre,
    celular: fromList.celular,
    // With a mail in the list, the list rules; without one, it is deduced.
    email: fromList.email || mailFromName(fromList.nombre),
    mailByHand: Boolean(fromList.email),
    on: true,
    shown: true,
  };
}

function capsOfCompany(form: FlyerFormState, company: SearchableCompany) {
  const { opcion, importe, importe2 } = sanitizeCategory(company.rubro);
  if (!opcion) return {};
  const first = formatAmount(importe);
  const second = formatAmount(importe2);
  return {
    cap: first ? capInField(first) : form.cap,
    secondCap: second && second !== first ? capInField(second) : "",
  };
}

/**
 * A company of the list fills the form whole: the list rules, so one with no officers empties the
 * fields instead of dragging those of the flyer before. It always comes with its officers on: the
 * switch is only for the flyer in progress (invariant 19). The paste boxes do not serve anymore.
 */
export function withCompanyBrought(
  form: FlyerFormState,
  company: SearchableCompany,
  cashback: number,
): FlyerFormState {
  const brought = followingCompany(form, company.empresa);
  const officers = brought.officers.map((officer, position) =>
    position < USUAL_OFFICERS
      ? officerOfCompany(officer, company.asesores[position], position)
      : officer,
  );
  return {
    ...brought,
    ...capsOfCompany(brought, company),
    ...(cashback === NO_CASHBACK_INDEX ? { noCashback: true } : { cashback, noCashback: false }),
    officers,
    officersOn: true,
    chosen: company,
    pasting: [],
  };
}

/** Restaurar: back to the start, and the bond with the list is cut. */
export function restoredForm(): FlyerFormState {
  return initialFormState();
}

/** What the changes of a company are compared against. An officer that is off counts as empty. */
export function officersForReview(form: FlyerFormState): readonly CompanyOfficer[] {
  return form.officers.slice(0, USUAL_OFFICERS).map((officer) => {
    const nombre = form.officersOn && officer.on ? officer.nombre.trim() : "";
    return {
      nombre,
      celular: nombre ? officer.celular.trim() : "",
      email: nombre ? officer.email.trim() : "",
    };
  });
}

/** What the caps of the form say. Only in Rubros: elsewhere the category is not touched. */
export function categoryForReview(
  form: FlyerFormState,
  tab: FlyerTab,
  option: number,
): CompanyCategory | null {
  if (tab !== "rubros") return null;
  const first = digitsOf(form.cap);
  const second = digitsOf(form.secondCap);
  return sanitizeCategory({
    opcion: option,
    importe: first,
    importe2: second && second !== first ? second : "",
  });
}

/** What is wrong and goes on the flyer: it never stops a download, and it is said after it. */
export function problemsOnFlyer(form: FlyerFormState): readonly string[] {
  if (!form.officersOn) return [];
  return form.officers.slice(0, officersLimit(form)).flatMap((officer) => {
    const name = officer.nombre.trim();
    if (!officer.on || !name) return [];
    const checked = [
      { problem: phoneProblem(officer.celular), text: `el celular de ${name}` },
      { problem: mailProblem(officer.email), text: `el mail de ${name}` },
    ];
    return checked.filter(({ problem }) => problem?.kind === "invalid").map(({ text }) => text);
  });
}

/** Which of the four amounts is the one printed: only where the flyer prints a single one. */
export function amountOnFlyer(
  amounts: readonly string[],
  { noCashback }: Pick<FlyerFormState, "noCashback">,
  tab: FlyerTab,
): number {
  if (!drawsSingleCashback(tab) || noCashback) return -1;
  let best = -1;
  let bestValue = 0;
  for (const [position, amount] of amounts.entries()) {
    const value = Number.parseInt(digitsOf(amount) || "0", 10);
    if (value > bestValue) {
      best = position;
      bestValue = value;
    }
  }
  return best;
}
