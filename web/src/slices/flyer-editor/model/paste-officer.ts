// "⚡ Pegar": what a pasted text does to an officer, and how it tells. A person (a name or a mail)
// completes what it finds and empties the rest, not to mix the phone of one with the name of another.
// A lone phone touches only the phone.
import {
  digitsOf,
  type PastedContact,
  parseContact,
} from "@/shared/domain/company-registry/index.ts";
import type { OfficerDraft } from "./form-state.ts";

export type PastedChange =
  | { readonly kind: "nothing" }
  | {
      readonly kind: "person";
      readonly nombre: string;
      readonly celular: string;
      readonly email: string;
    }
  | { readonly kind: "phone"; readonly celular: string };

export interface PasteOutcome {
  readonly change: PastedChange;
  readonly recognized: {
    readonly nombre: boolean;
    readonly celular: boolean;
    readonly email: boolean;
  };
  readonly lines: readonly string[];
  readonly ignored: readonly string[];
}

const NOTHING = "No reconocí ningún dato. Revisá el texto pegado.";
export const NOTHING_RECOGNIZED = NOTHING;

function emptiedNotices(contact: PastedContact, before: OfficerDraft): string[] {
  const notices: string[] = [];
  if (!contact.nombre && before.nombre) notices.push("Nombre: no encontré — lo dejé vacío");
  if (!contact.celular && before.celular) notices.push("Celular: no encontré — lo dejé vacío");
  if (!contact.email) {
    notices.push(
      before.email
        ? "Mail: no venía en el texto — lo dejé vacío"
        : "Mail: no venía en el texto — cargalo a mano",
    );
  }
  return notices;
}

function phoneLine({ celular, pastedPhone, phonePrefixes = [] }: PastedContact): string[] {
  if (!celular || !pastedPhone || digitsOf(pastedPhone) === digitsOf(celular)) return [];
  const removed = phonePrefixes.length > 0 ? ` (saqué: ${phonePrefixes.join(" ")})` : "";
  return [`Celular: pegaste "${pastedPhone}" → quedó "${celular}"${removed}`];
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function pasteOutcome(text: string, before: OfficerDraft): PasteOutcome {
  const contact = parseContact(text);
  const { nombre, celular, email, avisos, ignorado } = contact;
  const isPerson = Boolean(nombre || email);
  let change: PastedChange = { kind: "nothing" };
  if (isPerson) change = { kind: "person", nombre, celular, email };
  else if (celular) change = { kind: "phone", celular };
  const notices = isPerson ? [...avisos, ...emptiedNotices(contact, before)] : avisos;
  return {
    change,
    recognized: { nombre: Boolean(nombre), celular: Boolean(celular), email: Boolean(email) },
    lines: [...phoneLine(contact), ...notices.map(capitalized)],
    ignored: ignorado,
  };
}
