import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { relativeDate } from "@/shared/domain/relative-date.ts";
import {
  type Proposal,
  usePendingProposals,
} from "@/shared/lib/company-registry/proposals-query.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import {
  answerProposal,
  COLLEAGUES_QUERY_KEY,
  MY_SUBSTITUTE_QUERY_KEY,
  type ProposalAction,
  type ProposalMessage,
  readColleagues,
  readMySubstitute,
  saveMySubstitute,
} from "../api/proposals.ts";
import { proposalChanges } from "../model/proposal-changes.ts";
import { useRegistryContext } from "../model/registry-rules.ts";
import { useUserId } from "../model/use-companies.ts";
import { useProposalMessages } from "../model/use-proposal-messages.ts";
import { ChangeList, ProposalThread, StatusChip } from "./ProposalParts.tsx";
import styles from "./Proposals.module.css";

interface ActionText {
  readonly label: string;
  readonly placeholder: string;
  readonly confirm: string;
  readonly tone: string | undefined;
  readonly done: string;
}

const ACTIONS: Readonly<Record<ProposalAction, ActionText>> = {
  aprobar: {
    label: "Comentario para quien lo pidió (opcional)",
    placeholder: "Ej: gracias, ya quedó actualizado",
    confirm: "Confirmar aprobación",
    tone: styles.ok,
    done: "Cambio aplicado",
  },
  consultar: {
    label: "Tu consulta",
    placeholder: "Ej: ¿confirmaste el celular con el cliente?",
    confirm: "Enviar consulta",
    tone: styles.primary,
    done: "Consulta enviada al hunter",
  },
  rechazar: {
    label: "Motivo (opcional)",
    placeholder: "Ej: ese oficial ya no atiende la empresa",
    confirm: "Confirmar rechazo",
    tone: styles.no,
    done: "Propuesta rechazada",
  },
};

function ActionBox({
  action,
  onConfirm,
  onCancel,
}: {
  readonly action: ProposalAction;
  readonly onConfirm: (text: string) => void;
  readonly onCancel: () => void;
}) {
  const { label, placeholder, confirm, tone } = ACTIONS[action];
  const [text, setText] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    field.current?.focus();
  }, []);
  return (
    <div className={styles.actionBox}>
      <label className={styles.label}>
        {label}
        <textarea
          ref={field}
          className={styles.actionText}
          rows={2}
          placeholder={placeholder}
          value={text}
          onChange={({ target }) => {
            setText(target.value);
          }}
        />
      </label>
      <div className={styles.actions}>
        <button
          type="button"
          className={`${styles.button} ${tone ?? ""}`}
          data-testid="proposal-confirm"
          onClick={() => {
            onConfirm(text.trim());
          }}
        >
          {confirm}
        </button>
        <button type="button" className={`${styles.button} ${styles.link}`} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

function ProposalCard({
  proposal,
  messages,
  onAnswer,
}: {
  readonly proposal: Proposal;
  readonly messages: readonly ProposalMessage[];
  readonly onAnswer: (action: ProposalAction, text: string) => void;
}) {
  const context = useRegistryContext();
  const [open, setOpen] = useState<ProposalAction | null>(null);
  const { estado, origen, empresa, created_at: created, creada_por_nombre: author } = proposal;
  const waiting = estado === "consulta";
  const bySubstitute = origen === "suplente";
  const toggle = (action: ProposalAction) => {
    setOpen((current) => (current === action ? null : action));
  };
  return (
    <div
      className={
        waiting ? `${styles.card} ${styles.cardQuestion}` : `${styles.card} ${styles.cardPending}`
      }
      data-testid="proposal-card"
    >
      <div className={styles.cardHead}>
        <div>
          <div className={styles.company}>{empresa}</div>
          <div className={styles.meta}>
            {bySubstitute ? "Pedido por " : "Propuesto por "}
            {author || "alguien"}
            {bySubstitute ? ", como suplente" : ""} · {relativeDate(created)}
          </div>
        </div>
        {waiting ? (
          <StatusChip status="consulta" text="Esperando respuesta del hunter" />
        ) : (
          <StatusChip status="pendiente" />
        )}
      </div>
      <ChangeList changes={proposalChanges(proposal, context)} />
      <ProposalThread messages={messages} />
      <div className={styles.actions}>
        <button
          type="button"
          className={`${styles.button} ${styles.ok}`}
          onClick={() => {
            toggle("aprobar");
          }}
        >
          Aprobar
        </button>
        {/* A substitute has no screen to answer on. */}
        {!waiting && !bySubstitute && (
          <button
            type="button"
            className={styles.button}
            onClick={() => {
              toggle("consultar");
            }}
          >
            Repreguntar
          </button>
        )}
        <button
          type="button"
          className={`${styles.button} ${styles.no}`}
          onClick={() => {
            toggle("rechazar");
          }}
        >
          Rechazar
        </button>
      </div>
      {open && (
        <ActionBox
          key={open}
          action={open}
          onCancel={() => {
            setOpen(null);
          }}
          onConfirm={(text) => {
            onAnswer(open, text);
          }}
        />
      )}
    </div>
  );
}

function SubstitutePicker() {
  const backend = useBackend();
  const queryClient = useQueryClient();
  const userId = useUserId();
  const { show } = useToast();
  const { data: colleagues = [] } = useQuery({
    queryKey: COLLEAGUES_QUERY_KEY,
    queryFn: () => readColleagues(backend),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const key = useMemo(() => [...MY_SUBSTITUTE_QUERY_KEY, userId], [userId]);
  const { data: chosen = null } = useQuery({
    queryKey: key,
    enabled: userId !== null,
    queryFn: () => readMySubstitute(backend.db, userId ?? ""),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const { mutate } = useMutation({
    mutationFn: async (substitute: string | null) => {
      const failed = await saveMySubstitute(backend.db, userId ?? "", substitute);
      if (failed) throw new Error(failed);
      return substitute;
    },
    onSuccess: (substitute) => {
      queryClient.setQueryData(key, substitute);
      show(substitute ? "Suplente guardado" : "Suplente quitado");
    },
    onError: (cause) => {
      show(`No se pudo guardar: ${cause.message}`);
    },
  });
  return (
    <div className={styles.substitute}>
      <div>
        <div className={styles.substituteTitle}>Mi suplente</div>
        <div className={styles.hint}>
          Mientras esté elegido, esa persona también puede revisar y aprobar los cambios de tus
          empresas (por ejemplo, durante tus vacaciones). Lo sacás vos cuando vuelvas.
        </div>
      </div>
      <select
        className={styles.substituteSelect}
        aria-label="Mi suplente"
        data-testid="substitute-select"
        value={chosen ?? ""}
        onChange={({ target }) => {
          mutate(target.value || null);
        }}
      >
        <option value="">Ninguno</option>
        {colleagues.map(({ id, nombre }) => (
          <option key={id} value={id}>
            {nombre}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Cambios pendientes: what a Hunter proposed or a substitute asked for, to approve or not. */
export function ProposalsPane({ isActive }: { readonly isActive: boolean }) {
  const backend = useBackend();
  const { show } = useToast();
  const { list, settled, reload } = usePendingProposals();
  const ids = useMemo(() => list.map(({ id }) => id), [list]);
  const { byProposal, reload: reloadMessages } = useProposalMessages(ids);

  useEffect(() => {
    if (isActive) void reload();
  }, [isActive, reload]);

  const answer = async (id: string, action: ProposalAction, text: string) => {
    if (action === "consultar" && !text) {
      show("Escribí la consulta.");
      return;
    }
    const failed = await answerProposal(backend, id, action, text);
    if (failed) {
      show(`No se pudo: ${failed.message}`);
      return;
    }
    show(ACTIONS[action].done);
    await reload();
    await reloadMessages();
  };

  return (
    <>
      <SubstitutePicker />
      <div className={styles.list} data-testid="proposal-list">
        {!settled && "Cargando…"}
        {settled && list.length === 0 && (
          <div className={styles.empty}>No tenés cambios para revisar.</div>
        )}
        {list.map((proposal) => (
          <ProposalCard
            key={proposal.id}
            proposal={proposal}
            messages={byProposal.get(proposal.id) ?? []}
            onAnswer={(action, text) => void answer(proposal.id, action, text)}
          />
        ))}
      </div>
    </>
  );
}
