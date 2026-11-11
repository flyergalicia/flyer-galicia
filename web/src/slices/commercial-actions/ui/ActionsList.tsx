// The solapa of the actions: what the person has, with its filters. What asks for attention goes
// first. Choosing a filter only paints the rows: the bar stays, so the cursor does not go away.
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { Button } from "@/shared/ui/index.ts";
import { markAllRead } from "../api/actions.ts";
import type { ListedAction } from "../api/rows.ts";
import {
  asksForAttention,
  type Choice,
  filterActions,
  hasFilters,
  hunterFilterIds,
  isNew,
  isNewForHunter,
  type ListFilters,
  MAX_ROWS,
  NO_FILTERS,
  NO_HUNTER,
  stateChoices,
  TYPE_CHOICES,
  type UnreadByAction,
  whenText,
} from "../model/action-list.ts";
import { failureText } from "../model/failure-text.ts";
import { number, percent } from "../model/formatting.ts";
import { ACTION_TYPES, labelOf } from "../model/labels.ts";
import {
  noteAllRead,
  refreshNotices,
  useActionList,
  useUnreadMessages,
} from "../model/use-actions-data.ts";
import { nameOf, ownerText, type Who } from "../model/who.ts";
import { Chip, ConnectionProblem, Loading, TaxId } from "./parts.tsx";
import { StateChip } from "./StateChip.tsx";
import styles from "./CommercialActions.module.css";

const SEEN_AGAIN_HINT = "Se va al abrirla. Adentro podés dejarla sin leer otra vez.";

export function HunterOfAction({
  who,
  action,
}: {
  readonly who: Who;
  readonly action: ListedAction | Pick<ListedAction, "hunter_id" | "lider_id">;
}) {
  const { hunter_id: hunter, lider_id: leader } = action;
  if (hunter) return <>{nameOf(who, hunter)}</>;
  return (
    <>
      <b>por asignar</b>
      {leader ? ` (${nameOf(who, leader)})` : ""}
    </>
  );
}

function WhoseLine({ who, action }: { readonly who: Who; readonly action: ListedAction }) {
  if (who.role === "hunter") {
    return (
      <>
        {action.origen === "derivada"
          ? `Te la derivó ${nameOf(who, action.creada_por)}`
          : ownerText(who, action.dueno_id)}
      </>
    );
  }
  return (
    <>
      Hunter: <HunterOfAction who={who} action={action} /> · Oficial: {nameOf(who, action.dueno_id)}
    </>
  );
}

function RowNumbers({ action }: { readonly action: ListedAction }) {
  const { tipo, estado, n_pros: people, n_altas: signups, n_datos: total } = action;
  const word = signups === 1 ? "alta" : "altas";
  if (tipo === "datos") {
    return (
      <span className={styles.rowNumbers}>
        <b>{number(people)}</b> de {number(total)} contactados ·{" "}
        <b className={styles.ok}>{number(signups)}</b> {word}
      </span>
    );
  }
  if (estado !== "realizada") return null;
  return (
    <span className={styles.rowNumbers}>
      <b>{number(people)}</b> prospectos · <b className={styles.ok}>{number(signups)}</b> {word} ·{" "}
      {percent(signups, people)}
    </span>
  );
}

function ExtraChips({
  who,
  action,
  messages,
}: {
  readonly who: Who;
  readonly action: ListedAction;
  readonly messages: number;
}) {
  const cannot = Boolean(action.no_puede_at) && action.estado === "planificada";
  if (!cannot && !messages) return null;
  return (
    <span className={styles.chips}>
      {cannot && (
        <Chip tone="warn" title={action.no_puede_motivo ?? ""}>
          {action.hunter_id === who.me ? "Avisaste que no podés" : "Pidió que se la pasen a otro"}
        </Chip>
      )}
      {messages > 0 && (
        <Chip tone="info" title={SEEN_AGAIN_HINT}>
          {messages === 1 ? "1 mensaje nuevo" : `${String(messages)} mensajes nuevos`}
        </Chip>
      )}
    </span>
  );
}

function newText(who: Who, action: ListedAction): string {
  if (isNewForHunter(who, action)) return `Nueva${action.nota ? `: ${action.nota}` : ""}`;
  const what = action.origen === "derivada" ? " la completó" : " registró esta acción";
  return `Novedad: ${nameOf(who, action.hunter_id)}${what}`;
}

function ActionLine({
  who,
  action,
  unread,
  onOpen,
}: {
  readonly who: Who;
  readonly action: ListedAction;
  readonly unread: UnreadByAction;
  readonly onOpen: (id: string) => void;
}) {
  const isFlagged = asksForAttention(who, action, unread);
  return (
    <button
      type="button"
      className={`${styles.row}${isFlagged ? ` ${styles.rowFlagged}` : ""}`}
      data-testid="action-row"
      data-action-id={action.id}
      data-flagged={isFlagged}
      onClick={() => {
        onOpen(action.id);
      }}
    >
      <span className={styles.rowTop}>
        <span className={styles.rowCompany}>
          {action.empresa} <TaxId value={action.cuit} />
        </span>
        <span className={styles.chips}>
          <Chip tone="type">
            <span data-part="type">{labelOf(ACTION_TYPES, action.tipo)}</span>
          </Chip>
          <StateChip action={action} />
        </span>
      </span>
      <span className={styles.rowDetail}>
        {whenText(action)} · <WhoseLine who={who} action={action} />
        {action.prueba && (
          <>
            {" · "}
            <span className={styles.trial}>prueba</span>
          </>
        )}
      </span>
      <RowNumbers action={action} />
      <ExtraChips who={who} action={action} messages={unread.get(action.id)?.n ?? 0} />
      {isNew(who, action) && (
        <span className={styles.rowNew} title={SEEN_AGAIN_HINT}>
          {newText(who, action)}
        </span>
      )}
    </button>
  );
}

function FilterSelect({
  label,
  value,
  choices,
  onChoose,
}: {
  readonly label?: string;
  readonly value: string;
  readonly choices: readonly Choice[];
  readonly onChoose: (value: string) => void;
}) {
  return (
    <select
      className={`${styles.input} ${styles.select}`}
      aria-label={label ?? "Filtrar por estado"}
      value={value}
      onChange={({ target }) => {
        onChoose(target.value);
      }}
    >
      {choices.map((choice) => (
        <option key={choice.value} value={choice.value}>
          {choice.label}
        </option>
      ))}
    </select>
  );
}

function hunterChoices(who: Who, actions: readonly ListedAction[]): readonly Choice[] {
  const ids = hunterFilterIds(who, actions);
  if (ids.length === 0) return [];
  return [
    { value: "", label: "Todos los hunters" },
    { value: NO_HUNTER, label: "Sin asignar" },
    ...ids.map((id) => ({ value: id, label: nameOf(who, id) })),
  ];
}

interface ListToolsProps {
  readonly who: Who;
  readonly actions: readonly ListedAction[];
  readonly filters: ListFilters;
  readonly marked: number;
  readonly onFilters: (filters: ListFilters) => void;
  readonly onRegister: () => void;
  readonly onMarkAllRead: () => void;
}

function ListTools({
  who,
  actions,
  filters,
  marked,
  onFilters,
  onRegister,
  onMarkAllRead,
}: ListToolsProps) {
  const isHunter = who.role === "hunter";
  const set = (changes: Partial<ListFilters>) => {
    onFilters({ ...filters, ...changes });
  };
  const hunters = isHunter ? [] : hunterChoices(who, actions);
  return (
    <div className={styles.tool}>
      <input
        type="search"
        className={styles.input}
        placeholder="Buscar empresa, CUIT o persona"
        autoComplete="off"
        value={filters.search}
        onChange={({ target }) => {
          set({ search: target.value });
        }}
      />
      <FilterSelect
        value={filters.state}
        choices={stateChoices(who.role)}
        onChoose={(state) => {
          set({ state });
        }}
      />
      <FilterSelect
        label="Filtrar por tipo de acción"
        value={filters.type}
        choices={TYPE_CHOICES}
        onChoose={(type) => {
          set({ type });
        }}
      />
      {hunters.length > 0 && (
        <FilterSelect
          label="Filtrar por hunter"
          value={filters.hunter}
          choices={hunters}
          onChoose={(hunter) => {
            set({ hunter });
          }}
        />
      )}
      <span className={styles.dates}>
        Del{" "}
        <input
          type="date"
          className={styles.input}
          aria-label="Desde"
          value={filters.from}
          onChange={({ target }) => {
            set({ from: target.value });
          }}
        />{" "}
        al{" "}
        <input
          type="date"
          className={styles.input}
          aria-label="Hasta"
          value={filters.until}
          onChange={({ target }) => {
            set({ until: target.value });
          }}
        />
      </span>
      {hasFilters(filters) && (
        <button
          type="button"
          className={styles.link}
          onClick={() => {
            onFilters(NO_FILTERS);
          }}
        >
          Limpiar filtros
        </button>
      )}
      {isHunter && (
        <Button variant="ghost" onClick={onRegister}>
          + Registrar desde Buscar flyer
        </Button>
      )}
      {marked > 0 && (
        <Button
          variant="ghost"
          className={`${styles.small} ${styles.markRead}`}
          title={`Saca el cartel de las ${String(marked)} marcadas`}
          onClick={onMarkAllRead}
        >
          Marcar todas como leídas ({marked})
        </Button>
      )}
    </div>
  );
}

function NothingYet({
  isHunter,
  hasActions,
}: {
  readonly isHunter: boolean;
  readonly hasActions: boolean;
}) {
  if (hasActions) return <div className={styles.empty}>Nada coincide con el filtro.</div>;
  return (
    <div className={styles.empty}>
      {isHunter ? (
        <>
          Todavía no hay gestiones. Buscá una empresa en <b>Buscar flyer</b> y tocá{" "}
          <b>Registrar gestión</b>.
        </>
      ) : (
        <>
          Todavía no hay gestiones. Derivá una acción desde <b>Mis empresas</b>.
        </>
      )}
    </div>
  );
}

function useMarkAllRead(me: string) {
  const backend = useBackend();
  const queryClient = useQueryClient();
  const { show } = useToast();
  return async () => {
    try {
      await markAllRead(backend);
      noteAllRead(queryClient, me);
      refreshNotices(queryClient);
      show("Listo: no queda ninguna marcada.");
    } catch (cause) {
      show(`No se pudo: ${failureText(cause)}`);
    }
  };
}

interface ActionsListProps {
  readonly who: Who;
  readonly onlyMine: boolean;
  readonly filters: ListFilters;
  readonly onFilters: (filters: ListFilters) => void;
  readonly onOpen: (id: string) => void;
  readonly onRegister: () => void;
}

export function ActionsList({
  who,
  onlyMine,
  filters,
  onFilters,
  onOpen,
  onRegister,
}: ActionsListProps) {
  const { actions, loaded, error, retry } = useActionList(onlyMine);
  const unread = useUnreadMessages();
  const markAll = useMarkAllRead(who.me);
  if (!loaded) {
    return error ? <ConnectionProblem cause={error} onRetry={retry} /> : <Loading />;
  }
  const shown = filterActions(who, actions, filters, unread);
  const marked = actions.filter((action) => asksForAttention(who, action, unread)).length;
  return (
    <>
      <ListTools
        who={who}
        actions={actions}
        filters={filters}
        marked={marked}
        onFilters={onFilters}
        onRegister={onRegister}
        onMarkAllRead={() => void markAll()}
      />
      <div className={styles.list} data-testid="actions-list">
        {shown.length > 0 ? (
          shown
            .slice(0, MAX_ROWS)
            .map((action) => (
              <ActionLine
                key={action.id}
                who={who}
                action={action}
                unread={unread}
                onOpen={onOpen}
              />
            ))
        ) : (
          <NothingYet isHunter={who.role === "hunter"} hasActions={actions.length > 0} />
        )}
      </div>
      {shown.length > MAX_ROWS && (
        <p className={styles.note}>
          Se muestran las 300 más recientes. Usá el buscador para encontrar otras.
        </p>
      )}
    </>
  );
}
