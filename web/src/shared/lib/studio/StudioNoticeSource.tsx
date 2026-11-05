// What the shell shows about Estudio: the number and, once, a notice on entering.
import { useEffect, useRef } from "react";
import { registerProbe } from "../test-probe.ts";
import { useToast } from "../toast/toast-context.ts";
import type { NoticeSourceProps } from "../view-props.ts";
import {
  type MyDesignNotice,
  questionsOf,
  sharedCount,
  useIsAdministrator,
  usePersonId,
  useStudioNotices,
} from "./studio-notices-query.ts";

const LONG_NOTICE_MS = 6000;
const ROWS_REMEMBERED = 200;

function questionsHint(count: number): string {
  return count === 1
    ? "1 pregunta sobre un diseño de Estudio"
    : `${String(count)} preguntas sobre diseños de Estudio`;
}

function questionsText(questions: readonly MyDesignNotice[]): string {
  const [first] = questions;
  if (!first) return "";
  return questions.length === 1
    ? `El administrador te hizo una pregunta sobre «${first.nombre}». Respondela en Estudio.`
    : `El administrador te hizo preguntas sobre ${String(questions.length)} diseños. Respondelas en Estudio.`;
}

function readSeen(key: string): readonly string[] {
  try {
    const seen: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(seen) ? seen.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function sharedMark({ id, compartido_at: when }: MyDesignNotice): string {
  return `${id}@${when ?? ""}`;
}

/** The copies not told yet on this computer. Each one, once. */
function newSharedText(mine: readonly MyDesignNotice[], personId: string): string {
  const key = `fg_est_avisados_${personId}`;
  const seen = readSeen(key);
  const fresh = mine.filter(
    (design) => design.compartido_por && !seen.includes(sharedMark(design)),
  );
  const [first] = fresh;
  if (!first) return "";
  try {
    localStorage.setItem(
      key,
      JSON.stringify([...seen, ...fresh.map(sharedMark)].slice(-ROWS_REMEMBERED)),
    );
  } catch {
    // Without a place to remember, it is told again next time.
  }
  return fresh.length === 1
    ? `${String(first.compartido_por)} te compartió «${first.nombre}». Lo tenés en la solapa Estudio.`
    : `Te compartieron ${String(fresh.length)} diseños. Los tenés en la solapa Estudio.`;
}

/**
 * The number on the tab of Estudio and on the envelope; the requests of an administrator are only on
 * the tab, because they are not waiting for them only as a person.
 */
export function StudioNoticeSource({ report }: NoticeSourceProps) {
  const notices = useStudioNotices();
  const isAdmin = useIsAdministrator();
  const personId = usePersonId();
  const { show } = useToast();
  const told = useRef(false);
  const { settled, mine, requests } = notices;
  const questions = questionsOf(notices).length;
  useEffect(() => {
    report(
      isAdmin
        ? { count: requests, hint: "", tabId: "estudio", onlyOnTab: true }
        : { count: questions, hint: questionsHint(questions), tabId: "estudio" },
    );
  }, [isAdmin, questions, report, requests]);
  useEffect(
    () =>
      registerProbe("studioNotices", () => ({
        questions: questionsOf({ requests, mine }).length,
        shared: sharedCount({ requests, mine }),
      })),
    [mine, requests],
  );
  useEffect(() => {
    if (!settled || told.current) return;
    told.current = true;
    if (isAdmin) return;
    const parts = [
      questionsText(questionsOf({ requests, mine })),
      newSharedText(mine, personId),
    ].filter(Boolean);
    if (parts.length > 0) show(parts.join(" "), LONG_NOTICE_MS);
  }, [isAdmin, mine, personId, requests, settled, show]);
  return null;
}
