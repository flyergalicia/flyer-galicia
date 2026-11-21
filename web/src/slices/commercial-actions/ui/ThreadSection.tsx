// The conversation of an action (the hunter, the officer and the leader write there) and its history
// (written by the database). If they cannot be read it says so: it is not an empty conversation.
import { useEffect, useRef, useState } from "react";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { Button } from "@/shared/ui/index.ts";
import { sendMessage } from "../api/actions.ts";
import type { EventRow, MessageRow } from "../api/rows.ts";
import { failureText } from "../model/failure-text.ts";
import { dateTimeLabel } from "../model/formatting.ts";
import { historyText } from "../model/history-text.ts";
import { nameOf, type Who } from "../model/who.ts";
import styles from "./CommercialActions.module.css";

function Message({ who, message }: { readonly who: Who; readonly message: MessageRow }) {
  const isMine = message.autor === who.me;
  const cannot = message.tipo === "no_puedo";
  const classes = [styles.message, isMine && styles.messageMine, cannot && styles.messageCannot];
  return (
    <div className={classes.filter(Boolean).join(" ")}>
      <span className={styles.messageWho}>
        {isMine ? "Vos" : nameOf(who, message.autor)} · {dateTimeLabel(message.created_at)}
        {cannot ? " · avisó que no puede ir" : ""}
      </span>
      {message.texto}
    </div>
  );
}

function Writing({
  actionId,
  onSent,
}: {
  readonly actionId: string;
  readonly onSent: () => Promise<void>;
}) {
  const backend = useBackend();
  const { show } = useToast();
  const [text, setText] = useState("");
  const [isSending, setSending] = useState(false);
  const send = async () => {
    const message = text.trim();
    if (!message) {
      show("Escribí el mensaje.");
      return;
    }
    setSending(true);
    try {
      await sendMessage(backend, actionId, message);
      setText("");
      await onSent();
    } catch (cause) {
      show(`No se pudo enviar: ${failureText(cause)}`);
    } finally {
      setSending(false);
    }
  };
  return (
    <div className={styles.messageNew}>
      <textarea
        className={styles.input}
        rows={2}
        maxLength={1000}
        data-testid="message-text"
        placeholder="Escribí una pregunta o un aviso"
        value={text}
        onChange={({ target }) => {
          setText(target.value);
        }}
      />
      <Button
        className={styles.small}
        data-testid="message-send"
        disabled={isSending}
        onClick={() => void send()}
      >
        {isSending ? "Enviando…" : "Enviar"}
      </Button>
    </div>
  );
}

interface ThreadSectionProps {
  readonly who: Who;
  readonly actionId: string;
  readonly messages: readonly MessageRow[];
  readonly events: readonly EventRow[];
  readonly failed: boolean;
  readonly onRetry: () => void;
  readonly onSent: () => Promise<void>;
}

export function ThreadSection({
  who,
  actionId,
  messages,
  events,
  failed,
  onRetry,
  onSent,
}: ThreadSectionProps) {
  const box = useRef<HTMLDivElement>(null);
  // After sending, the view goes to the last one: when it arrives, on whichever painting that is.
  const wantsEnd = useRef(false);
  const shownCount = useRef(messages.length);
  useEffect(() => {
    if (wantsEnd.current && box.current && messages.length !== shownCount.current) {
      box.current.scrollTop = box.current.scrollHeight;
      wantsEnd.current = false;
    }
    shownCount.current = messages.length;
  });
  return (
    <>
      <section className={`${styles.card} ${styles.padded} ${styles.chat}`}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionTitle}>Conversación</span>
          <span className={styles.mini}>
            La ven el hunter, el oficial y el líder. Para preguntar qué hay que hacer o avisar algo.
          </span>
        </div>
        {failed && (
          <p className={styles.mini} data-testid="thread-problem">
            No se pudo cargar la conversación.{" "}
            <button type="button" className={styles.link} onClick={onRetry}>
              Reintentar
            </button>
          </p>
        )}
        {!failed && messages.length === 0 && (
          <p className={styles.mini}>Todavía no hay mensajes.</p>
        )}
        {messages.length > 0 && (
          <div ref={box} className={styles.messages}>
            {messages.map((message) => (
              <Message key={message.id} who={who} message={message} />
            ))}
          </div>
        )}
        <Writing
          actionId={actionId}
          onSent={async () => {
            wantsEnd.current = true;
            await onSent();
          }}
        />
      </section>
      {events.length > 0 && (
        <details className={styles.history} data-testid="action-history">
          <summary>Historial ({events.length})</summary>
          <ol>
            {events.map((event) => (
              <li key={event.id}>
                <span className={styles.mini}>{dateTimeLabel(event.at)}</span> ·{" "}
                {historyText(who, event)}
              </li>
            ))}
          </ol>
        </details>
      )}
    </>
  );
}
