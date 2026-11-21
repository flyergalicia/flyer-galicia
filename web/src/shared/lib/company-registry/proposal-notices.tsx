// What the shell shows about the proposals: the number and, once, a notice on entering.
import { useEffect, useRef } from "react";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import type { NoticeSourceProps } from "@/shared/lib/view-props.ts";
import { usePendingProposals, useMyProposals } from "./proposals-query.ts";

const LONG_NOTICE_MS = 6000;

function pendingHint(count: number): string {
  return count === 1
    ? "1 cambio de oficiales para revisar"
    : `${String(count)} cambios de oficiales para revisar`;
}

function newsHint(count: number): string {
  return count === 1
    ? "1 novedad en tus modificaciones"
    : `${String(count)} novedades en tus modificaciones`;
}

/** Changes of officers waiting for this person, the owner or their substitute. */
export function PendingProposalsSource({ report }: NoticeSourceProps) {
  const { count, settled } = usePendingProposals();
  const { show } = useToast();
  const told = useRef(false);
  useEffect(() => {
    report({ count, hint: pendingHint(count) });
  }, [count, report]);
  useEffect(() => {
    if (!settled || told.current) return;
    told.current = true;
    if (count === 0) return;
    show(
      `Tenés ${String(count)}${count === 1 ? " cambio pendiente" : " cambios pendientes"} para revisar. Tu nombre → Base de datos → Cambios pendientes.`,
      LONG_NOTICE_MS,
    );
  }, [count, settled, show]);
  return null;
}

function newsNotice(questions: number, resolved: number): string {
  const parts: string[] = [];
  if (questions > 0) {
    parts.push(
      questions === 1
        ? "1 consulta sobre un cambio que propusiste"
        : `${String(questions)} consultas sobre cambios que propusiste`,
    );
  }
  if (resolved > 0) {
    parts.push(resolved === 1 ? "1 cambio resuelto" : `${String(resolved)} cambios resueltos`);
  }
  return `Tenés ${parts.join(" y ")}. Tu nombre → Mis propuestas.`;
}

/** Questions and answers about what a Hunter proposed. */
export function MyProposalsSource({ report }: NoticeSourceProps) {
  const { news, questions, settled } = useMyProposals();
  const { show } = useToast();
  const told = useRef(false);
  useEffect(() => {
    report({ count: news, hint: newsHint(news) });
  }, [news, report]);
  useEffect(() => {
    if (!settled || told.current) return;
    told.current = true;
    if (news > 0) show(newsNotice(questions, news - questions), LONG_NOTICE_MS);
  }, [news, questions, settled, show]);
  return null;
}
