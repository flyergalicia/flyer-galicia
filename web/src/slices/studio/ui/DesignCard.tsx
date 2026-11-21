import { optionLabel } from "@/shared/domain/flyer-options.ts";
import { useFlyerOptions } from "@/shared/lib/app-config/flyer-options-query.ts";
import { type DesignRow, isOpenRequest } from "@/shared/lib/studio/design-row.ts";
import { Button } from "@/shared/ui/index.ts";
import type { DesignMessage } from "../api/designs.ts";
import { type CardAction, cardButtons, shortDate, statusText } from "../model/design-card.ts";
import styles from "./StudioView.module.css";

interface DesignCardProps {
  readonly design: DesignRow;
  readonly isMine: boolean;
  readonly isAdmin: boolean;
  readonly canRequest: boolean;
  readonly messages: readonly DesignMessage[];
  readonly onAction: (action: CardAction, design: DesignRow) => void;
}

function Thread({ messages }: { readonly messages: readonly DesignMessage[] }) {
  return (
    <div className={styles.thread} data-part="conversation">
      {messages.map((message, position) => {
        const fromAdmin = message.rol === "admin";
        return (
          <div
            key={`${String(message.created_at)}-${String(position)}`}
            className={styles.message}
            data-from-admin={fromAdmin}
            data-part="message"
          >
            <div className={styles.messageHead}>
              {fromAdmin
                ? "Pregunta del administrador"
                : `Respuesta de ${message.autor_nombre || "el autor"}`}{" "}
              · {shortDate(message.created_at)}
            </div>
            <div className={styles.messageText}>{message.texto}</div>
          </div>
        );
      })}
    </div>
  );
}

function SharedNote({ design, isMine }: Pick<DesignCardProps, "design" | "isMine">) {
  const { compartido_por: by, compartido_at: when } = design;
  if (!by) return null;
  return (
    <div className={`${styles.meta} ${styles.sharedNote}`} data-part="shared-note">
      {isMine ? (
        <>
          Te lo compartió <b>{by}</b>
        </>
      ) : (
        `Copia compartida por ${by}`
      )}
      {when ? ` el ${shortDate(when)}` : ""}
    </div>
  );
}

function hasThumbnail(picture: string | null): picture is string {
  return Boolean(picture?.startsWith("data:image/jpeg;base64,"));
}

export function DesignCard({
  design,
  isMine,
  isAdmin,
  canRequest,
  messages,
  onAction,
}: DesignCardProps) {
  const { options } = useFlyerOptions();
  const labelOf = (option: number) => optionLabel(options, option);
  const { id, nombre, empresa, opcion, estado, miniatura, nota_admin: note, autor } = design;
  const flyerExists = options.some(({ n }) => n === opcion);
  const buttons = cardButtons(design, {
    isMine,
    isAdmin,
    canRequest,
    publishedExists: options.some(({ n }) => n === design.opcion_publicada),
  });
  return (
    <article className={styles.card} aria-label={nombre} data-testid="design-card" data-design={id}>
      <div className={styles.thumbnail}>
        {hasThumbnail(miniatura) && <img alt="" src={miniatura} />}
      </div>
      <div className={styles.info}>
        <div className={styles.firstLine}>
          <span className={styles.name} data-part="name">
            {nombre}
          </span>
          <span className={styles.status} data-status={estado} data-part="status">
            {statusText(design, isMine, labelOf)}
          </span>
        </div>
        {empresa && <div className={styles.company}>{empresa}</div>}
        <div className={styles.meta}>
          Sobre «{flyerExists ? labelOf(opcion) : `opción ${String(opcion)}`}» ·{" "}
          {shortDate(design.updated_at)}
          {isAdmin && !isMine && (
            <>
              {" · de "}
              <b>{autor || "¿?"}</b>
            </>
          )}
        </div>
        <SharedNote design={design} isMine={isMine} />
        {estado === "rechazado" && note && <div className={styles.note}>{note}</div>}
        {isOpenRequest(design) && messages.length > 0 && <Thread messages={messages} />}
        <div className={styles.actions}>
          {buttons.map(({ action, label, variant }) => (
            <Button
              key={action}
              variant={variant}
              size="sm"
              className={action === "delete" ? `${styles.action} ${styles.delete}` : styles.action}
              onClick={() => {
                onAction(action, design);
              }}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
    </article>
  );
}
