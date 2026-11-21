import type { OfficerChange } from "@/shared/domain/company-registry/index.ts";
import { relativeDate } from "@/shared/domain/relative-date.ts";
import type { ProposalMessage } from "../api/proposals.ts";
import styles from "./Proposals.module.css";

const STATUS_TEXT: Readonly<Record<string, string>> = {
  pendiente: "Pendiente de aprobación",
  consulta: "El oficial te hizo una consulta",
  aprobada: "Aprobado",
  rechazada: "Rechazado",
};

const MESSAGE_KIND: Readonly<Record<string, string>> = {
  nota: "Nota",
  consulta: "Consulta",
  respuesta: "Respuesta",
  aprobacion: "Aprobó",
  rechazo: "Rechazó",
};

const CHIP_CLASS: Readonly<Record<string, string | undefined>> = {
  consulta: styles.chipQuestion,
  aprobada: styles.chipApproved,
  rechazada: styles.chipRejected,
};

export function StatusChip({ status, text }: { readonly status: string; readonly text?: string }) {
  const tone = CHIP_CLASS[status];
  return (
    <span className={tone ? `${styles.chip} ${tone}` : styles.chip}>
      {text ?? STATUS_TEXT[status] ?? status}
    </span>
  );
}

/** What another person wrote, always as text. */
export function ProposalThread({ messages }: { readonly messages: readonly ProposalMessage[] }) {
  const written = messages.filter(({ texto }) => texto.trim());
  if (written.length === 0) return null;
  return (
    <div className={styles.thread}>
      {written.map(({ id, rol, autor_nombre: author, tipo, created_at: created, texto }) => {
        const fromHunter = rol === "hunter";
        return (
          <div key={id} className={fromHunter ? styles.fromHunter : styles.fromOfficer}>
            <div className={styles.messageHead}>
              <strong>{author || (fromHunter ? "Hunter" : "Oficial")}</strong>
              {` · ${MESSAGE_KIND[tipo] ?? ""} · ${relativeDate(created)}`}
            </div>
            <div className={styles.messageText}>{texto}</div>
          </div>
        );
      })}
    </div>
  );
}

export function ChangeList({
  changes,
  empty = "Sin cambios en los oficiales.",
}: {
  readonly changes: readonly OfficerChange[];
  readonly empty?: string;
}) {
  if (changes.length === 0) return <div className={styles.hint}>{empty}</div>;
  return (
    <ul className={styles.changes}>
      {changes.map(([label, detail]) => (
        <li key={`${label}${detail}`}>
          <b>{label}:</b> {detail}
        </li>
      ))}
    </ul>
  );
}
