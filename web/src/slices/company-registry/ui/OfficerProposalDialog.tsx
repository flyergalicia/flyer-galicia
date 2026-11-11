import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  type CompanyOfficer,
  emptyOfficer,
  mailFromName,
  normalizeName,
  officerChanges,
  OFFICERS_PER_COMPANY,
  parseContact,
} from "@/shared/domain/company-registry/index.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { DecisionDialog } from "@/shared/ui/decision-dialog/DecisionDialog.ts";
import { newAdvisorId, type SavedAdvisor } from "../api/saved-advisors.ts";
import { useSavedAdvisors } from "../model/use-saved-advisors.ts";
import { ChangeList } from "./ProposalParts.tsx";
import proposals from "./Proposals.module.css";
import styles from "./OfficerProposalDialog.module.css";

const PASTE_WAIT_MS = 180;
const POP_WIDTH = 260;
const POP_MARGIN = 268;
const POP_LEFT = 8;
const SLOT_PLACES = [0, 1, 2, 3];

interface SlotState extends CompanyOfficer {
  /** Whoever wrote the mail decides it: it is not deduced from the name anymore. */
  readonly mailWritten: boolean;
}

const emptySlot: SlotState = { ...emptyOfficer(), mailWritten: false };

function SavedAdvisorsPopup({
  anchor,
  onChoose,
  onClose,
}: {
  readonly anchor: DOMRect;
  readonly onChoose: (advisor: SavedAdvisor) => void;
  readonly onClose: () => void;
}) {
  const { rows, loading } = useSavedAdvisors();
  const popup = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const outside = ({ target }: MouseEvent) => {
      if (target instanceof Node && !popup.current?.contains(target)) onClose();
    };
    const listening = setTimeout(() => {
      document.addEventListener("click", outside);
    }, 0);
    return () => {
      clearTimeout(listening);
      document.removeEventListener("click", outside);
    };
  }, [onClose]);
  return createPortal(
    <div
      ref={popup}
      className={styles.popup}
      data-testid="saved-officers"
      style={{
        top: Math.round(anchor.bottom + 4),
        left: Math.round(
          Math.max(POP_LEFT, Math.min(anchor.right - POP_WIDTH, window.innerWidth - POP_MARGIN)),
        ),
      }}
    >
      <div className={styles.popupHead}>Mis oficiales guardados</div>
      <div className={styles.popupList}>
        {loading && "Cargando…"}
        {!loading && rows.length === 0 && (
          <div className={styles.popupEmpty}>
            Todavía no guardaste ningún oficial. Usá <b>+ Guardar este</b> en un oficial cargado.
          </div>
        )}
        {!loading &&
          rows.map((advisor) => (
            <button
              key={advisor.id}
              type="button"
              className={styles.popupItem}
              onClick={() => {
                onChoose(advisor);
              }}
            >
              <span className={styles.popupName}>
                {advisor.name || advisor.nombre || "(sin nombre)"}
              </span>
              <span className={styles.popupDetail}>
                {[advisor.celular, advisor.email].filter(Boolean).join(" · ")}
              </span>
            </button>
          ))}
      </div>
    </div>,
    document.body,
  );
}

function OfficerSlot({
  number,
  slot,
  onChange,
}: {
  readonly number: number;
  readonly slot: SlotState;
  readonly onChange: (update: (before: SlotState) => SlotState) => void;
}) {
  const { show } = useToast();
  const { latest, save } = useSavedAdvisors();
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");
  const [pasteResult, setPasteResult] = useState("");
  const [savedFrom, setSavedFrom] = useState<DOMRect | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pasteBox = useRef<HTMLTextAreaElement>(null);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    if (pasting) pasteBox.current?.focus();
  }, [pasting]);

  const writeName = (nombre: string) => {
    onChange((before) => ({
      ...before,
      nombre,
      email:
        !before.email && !before.mailWritten && nombre.trim() ? mailFromName(nombre) : before.email,
    }));
  };
  const paste = (text: string) => {
    setPasted(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const contact = parseContact(text);
      const found = [
        ...(contact.nombre ? ["nombre"] : []),
        ...(contact.celular ? ["celular"] : []),
        ...(contact.email ? ["mail"] : []),
      ];
      const warnings = contact.avisos.length > 0 ? ` — ${contact.avisos.join("; ")}` : "";
      setPasteResult(
        found.length > 0
          ? `Completé: ${found.join(", ")}${warnings}`
          : "No encontré nada reconocible.",
      );
      onChange((before) => {
        const nombre = contact.nombre || before.nombre;
        const email = contact.email || before.email;
        return {
          ...before,
          nombre,
          celular: contact.celular || before.celular,
          email: email || (before.mailWritten || !nombre.trim() ? email : mailFromName(nombre)),
          mailWritten: before.mailWritten || Boolean(contact.email),
        };
      });
    }, PASTE_WAIT_MS);
  };
  const saveThis = async () => {
    const nombre = slot.nombre.trim();
    if (!nombre) {
      show("Completá al menos el nombre para guardarlo.");
      return;
    }
    const list = await latest();
    const email = slot.email.trim();
    const known = list.some(
      (advisor) =>
        normalizeName(advisor.nombre) === normalizeName(nombre) &&
        normalizeName(advisor.email) === normalizeName(email),
    );
    if (known) {
      show(`${nombre} ya está en tus guardados.`);
      return;
    }
    // Its label is the name: it can be corrected later in Mis asesores.
    const saved = await save([
      { id: newAdvisorId(), name: nombre, nombre, celular: slot.celular.trim(), email },
      ...list,
    ]);
    if (saved) show(`${nombre} guardado en tus oficiales.`);
  };

  return (
    <div className={styles.slot} data-testid="proposal-slot">
      <div className={styles.slotHead}>
        <b>Oficial {number}</b>
        <span className={styles.slotActions}>
          <button
            type="button"
            className={styles.slotAction}
            onClick={() => {
              setPasting((open) => !open);
              setPasted("");
            }}
          >
            ⚡ Pegar
          </button>
          <button
            type="button"
            className={styles.slotAction}
            onClick={({ currentTarget }) => {
              setSavedFrom(currentTarget.getBoundingClientRect());
            }}
          >
            ☆ Guardados
          </button>
          <button type="button" className={styles.slotAction} onClick={() => void saveThis()}>
            + Guardar este
          </button>
        </span>
      </div>
      {pasting && (
        <div>
          <textarea
            ref={pasteBox}
            className={styles.pasteBox}
            rows={2}
            placeholder="Pegá el nombre, celular y/o mail"
            aria-label={`Pegar los datos del oficial ${String(number)}`}
            value={pasted}
            onChange={({ target }) => {
              paste(target.value);
            }}
          />
          <div className={styles.pasteResult}>{pasteResult}</div>
        </div>
      )}
      <div className={styles.slotFields}>
        <input
          type="text"
          className={styles.field}
          placeholder="Nombre"
          aria-label={`Nombre del oficial ${String(number)}`}
          value={slot.nombre}
          onChange={({ target }) => {
            writeName(target.value);
          }}
        />
        <input
          type="text"
          className={styles.field}
          placeholder="Celular"
          aria-label={`Celular del oficial ${String(number)}`}
          value={slot.celular}
          onChange={({ target }) => {
            onChange((before) => ({ ...before, celular: target.value }));
          }}
        />
        <input
          type="text"
          className={styles.field}
          placeholder="Mail"
          aria-label={`Mail del oficial ${String(number)}`}
          value={slot.email}
          onChange={({ target }) => {
            onChange((before) => ({ ...before, email: target.value, mailWritten: true }));
          }}
        />
      </div>
      {savedFrom && (
        <SavedAdvisorsPopup
          anchor={savedFrom}
          onClose={() => {
            setSavedFrom(null);
          }}
          onChoose={(advisor) => {
            setSavedFrom(null);
            onChange(() => ({
              nombre: advisor.nombre || advisor.name,
              celular: advisor.celular,
              email: advisor.email,
              mailWritten: true,
            }));
          }}
        />
      )}
    </div>
  );
}

export interface OfficerProposalDialogProps {
  readonly title: string;
  readonly lead: ReactNode;
  /** The conversation so far, when answering a question. */
  readonly thread?: ReactNode;
  /** What the places start with. */
  readonly officers: unknown;
  /** What the summary compares against: the officers of today. */
  readonly base: unknown;
  readonly noteLabel: string;
  readonly notePlaceholder: string;
  readonly sendLabel: string;
  /** Proposing asks for a change; answering a question can be a text alone. */
  readonly textIsEnough: boolean;
  /** True closes the window. If it could not be sent, it stays and can be sent again. */
  readonly onSend: (officers: readonly CompanyOfficer[], note: string) => Promise<boolean>;
  readonly onClose: () => void;
}

function startingSlots(officers: unknown): SlotState[] {
  const list: readonly Partial<CompanyOfficer>[] = Array.isArray(officers) ? officers : [];
  return Array.from({ length: OFFICERS_PER_COMPANY }, (_, position) => {
    const { nombre = "", celular = "", email = "" } = list[position] ?? emptyOfficer();
    return { nombre, celular, email, mailWritten: false };
  });
}

function asOfficers(slots: readonly SlotState[]): CompanyOfficer[] {
  return slots.map(({ nombre, celular, email }) => ({
    nombre: nombre.trim(),
    celular: celular.trim(),
    email: email.trim(),
  }));
}

/** Only officers, never cashback, category, tax id or razón social: for proposing and for answering. */
export function OfficerProposalDialog({
  title,
  lead,
  thread,
  officers,
  base,
  noteLabel,
  notePlaceholder,
  sendLabel,
  textIsEnough,
  onSend,
  onClose,
}: OfficerProposalDialogProps) {
  const [slots, setSlots] = useState(() => startingSlots(officers));
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const clean = useMemo(() => asOfficers(slots), [slots]);
  const changes = useMemo(() => officerChanges(base, clean), [base, clean]);
  const canSend = changes.length > 0 || (textIsEnough && note.trim().length > 0);
  const change = useCallback((position: number, update: (before: SlotState) => SlotState) => {
    setSlots((current) => {
      const slot = current[position];
      return slot ? current.with(position, update(slot)) : current;
    });
  }, []);
  return (
    <DecisionDialog title={title} wide>
      <DecisionDialog.Text>{lead}</DecisionDialog.Text>
      {thread}
      <div className={styles.slots}>
        {SLOT_PLACES.map((position) => (
          <OfficerSlot
            key={position}
            number={position + 1}
            slot={slots[position] ?? emptySlot}
            onChange={(next) => {
              change(position, next);
            }}
          />
        ))}
      </div>
      <DecisionDialog.Field label={noteLabel} id="proposal-note">
        <textarea
          id="proposal-note"
          className={styles.note}
          data-testid="proposal-note"
          rows={2}
          placeholder={notePlaceholder}
          value={note}
          onChange={({ target }) => {
            setNote(target.value);
          }}
        />
      </DecisionDialog.Field>
      <div className={`${styles.summary} ${proposals.inWindow}`}>
        {changes.length > 0 ? (
          <>
            <div className={styles.summaryTitle}>Vas a proponer</div>
            <ChangeList changes={changes} />
          </>
        ) : (
          <div className={proposals.hint}>Todavía no cambiaste ningún oficial.</div>
        )}
      </div>
      <DecisionDialog.Foot>
        <DecisionDialog.No onClick={onClose}>Cancelar</DecisionDialog.No>
        <DecisionDialog.Yes
          disabled={!canSend || sending}
          onClick={() => {
            setSending(true);
            void onSend(clean, note.trim()).then((sent) => {
              if (sent) onClose();
              else setSending(false);
            });
          }}
        >
          {sending ? "Enviando..." : sendLabel}
        </DecisionDialog.Yes>
      </DecisionDialog.Foot>
    </DecisionDialog>
  );
}
