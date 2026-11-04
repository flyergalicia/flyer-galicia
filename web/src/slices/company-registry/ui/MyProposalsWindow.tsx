import { useEffect, useMemo, useRef, useState } from "react";
import { relativeDate } from "@/shared/domain/relative-date.ts";
import { type MyProposal, useMyProposals } from "@/shared/lib/company-registry/proposals-query.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import type { MenuWindowProps } from "@/shared/lib/view-props.ts";
import { officerChanges } from "@/shared/domain/company-registry/index.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { DecisionDialog } from "@/shared/ui/decision-dialog/DecisionDialog.ts";
import { answerQuestion, type ProposalMessage } from "../api/proposals.ts";
import { useProposalMessages } from "../model/use-proposal-messages.ts";
import { OfficerProposalDialog } from "./OfficerProposalDialog.tsx";
import { ChangeList, ProposalThread, StatusChip } from "./ProposalParts.tsx";
import styles from "./Proposals.module.css";

const SHOW_ORDER: Readonly<Record<string, number>> = {
  consulta: 0,
  pendiente: 1,
  aprobada: 2,
  rechazada: 2,
};

function inOrder(list: readonly MyProposal[]): readonly MyProposal[] {
  return list.toSorted(
    (one, other) =>
      (SHOW_ORDER[one.estado] ?? 0) - (SHOW_ORDER[other.estado] ?? 0) ||
      (one.created_at < other.created_at ? 1 : -1),
  );
}

const CARD_TONE: Readonly<Record<string, string | undefined>> = {
  pendiente: styles.cardPending,
  consulta: styles.cardQuestion,
  aprobada: styles.cardApproved,
};

function MyProposalCard({
  proposal,
  messages,
  onAnswer,
}: {
  readonly proposal: MyProposal;
  readonly messages: readonly ProposalMessage[];
  readonly onAnswer: () => void;
}) {
  const {
    empresa,
    estado,
    created_at: created,
    asesores_antes: before,
    asesores: after,
  } = proposal;
  const tone = CARD_TONE[estado];
  return (
    <div className={tone ? `${styles.card} ${tone}` : styles.card} data-testid="my-proposal-card">
      <div className={styles.cardHead}>
        <div>
          <div className={styles.company} data-part="company">
            {empresa}
          </div>
          <div className={styles.meta}>Propuesto {relativeDate(created)}</div>
        </div>
        <StatusChip status={estado} />
      </div>
      <ChangeList changes={officerChanges(before, after)} />
      <ProposalThread messages={messages} />
      {estado === "consulta" && (
        <div className={styles.actions}>
          <button type="button" className={`${styles.button} ${styles.primary}`} onClick={onAnswer}>
            Responder
          </button>
        </div>
      )}
    </div>
  );
}

/** What a Hunter proposed and how it ended: a question from the officer is answered from here. */
export function MyProposalsWindow({ onClose }: MenuWindowProps) {
  const backend = useBackend();
  const { show } = useToast();
  const { list, settled, reload, markSeen } = useMyProposals();
  const ids = useMemo(() => list.map(({ id }) => id), [list]);
  const { byProposal, reload: reloadMessages } = useProposalMessages(ids);
  const [answering, setAnswering] = useState<MyProposal | null>(null);
  const seen = useRef(false);

  useEffect(() => {
    void reload();
  }, [reload]);
  // What is seen now stops counting as news.
  useEffect(() => {
    if (!settled || seen.current) return;
    seen.current = true;
    markSeen();
  }, [markSeen, settled]);

  if (answering) {
    return (
      <OfficerProposalDialog
        title="💬 Responder la consulta"
        lead={
          <>
            <strong>{answering.empresa}</strong> · Contestá y, si hace falta, corregí los oficiales.
            Vuelve a quedar pendiente de aprobación.
          </>
        }
        thread={<ProposalThread messages={byProposal.get(answering.id) ?? []} />}
        officers={answering.asesores}
        base={answering.asesores_antes}
        noteLabel="Tu respuesta"
        notePlaceholder="Ej: confirmado con el cliente, el celular nuevo es ese"
        sendLabel="Responder y reenviar"
        textIsEnough
        onClose={onClose}
        onSend={async (officers, note) => {
          const failed = await answerQuestion(backend, answering.id, note, officers);
          if (failed) {
            show(`No se pudo enviar: ${failed.message}`);
            return false;
          }
          show("Respuesta enviada: vuelve a quedar pendiente de aprobación.");
          await reload();
          await reloadMessages();
          return true;
        }}
      />
    );
  }

  return (
    <DecisionDialog title="📋 Mis propuestas" wide>
      <DecisionDialog.Text>
        Lo que propusiste y en qué quedó. Si el oficial te hizo una consulta, respondela desde acá.
      </DecisionDialog.Text>
      <div className={`${styles.list} ${styles.inWindow}`} data-testid="my-proposal-list">
        {!settled && "Cargando…"}
        {settled && list.length === 0 && (
          <div className={styles.empty}>Todavía no propusiste ningún cambio.</div>
        )}
        {inOrder(list).map((proposal) => (
          <MyProposalCard
            key={proposal.id}
            proposal={proposal}
            messages={byProposal.get(proposal.id) ?? []}
            onAnswer={() => {
              setAnswering(proposal);
            }}
          />
        ))}
      </div>
      <DecisionDialog.Foot>
        <DecisionDialog.No onClick={onClose}>Cerrar</DecisionDialog.No>
      </DecisionDialog.Foot>
    </DecisionDialog>
  );
}
