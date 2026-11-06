import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PENDING_ACCOUNTS_QUERY_KEY } from "@/shared/lib/app-config/pending-accounts-query.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useSession } from "@/shared/session/index.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { Button, ConfirmDialog, Input, Select, Skeleton } from "@/shared/ui/index.ts";
import { ACCOUNTS_QUERY_KEY, readAccounts, setStatus } from "../api/accounts.ts";
import { DASHBOARD_QUERY_KEY } from "../api/board.ts";
import {
  type Account,
  type AccountAction,
  accountName,
  canBeDeleted,
  filterAccounts,
} from "../model/accounts.ts";
import { AccountFormDialog } from "./AccountFormDialog.tsx";
import { AccountRow } from "./AccountRow.tsx";
import { ReadProblem } from "./ReadProblem.tsx";
import { SheetHead } from "./SheetHead.tsx";
import styles from "./Users.module.css";

const STATUS_FILTERS = [
  ["", "Todos"],
  ["active", "Activos"],
  ["inactive", "Inactivos"],
  ["pending", "Pendientes"],
  ["reset_pending", "Cambio de clave"],
] as const;

type EdgeAccountAction = "approve_user" | "approve_reset" | "deny_reset" | "delete_user";

/** What each button does: through auth-admin when it sends a mail or touches a password. */
const THROUGH_SERVER: Partial<
  Record<
    AccountAction,
    { readonly edge: EdgeAccountAction; readonly ok: string; readonly failed: string }
  >
> = {
  approve: { edge: "approve_user", ok: "Usuario aprobado", failed: "No se pudo aprobar: " },
  "approve-reset": {
    edge: "approve_reset",
    ok: "Cambio de contraseña aprobado",
    failed: "Error: ",
  },
  "deny-reset": { edge: "deny_reset", ok: "Cambio de contraseña rechazado", failed: "Error: " },
};

const STATUS_OF: Partial<Record<AccountAction, string>> = {
  reject: "inactive",
  deactivate: "inactive",
  activate: "active",
};

type FormState = { readonly account: Account | null } | null;

function useAccountActions() {
  const { db, callEdge } = useBackend();
  const queryClient = useQueryClient();
  const { show } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const changed = (notice: string) => {
    for (const queryKey of [ACCOUNTS_QUERY_KEY, DASHBOARD_QUERY_KEY, PENDING_ACCOUNTS_QUERY_KEY]) {
      void queryClient.invalidateQueries({ queryKey });
    }
    show(notice);
  };
  const viaServer = async (
    account: Account,
    edge: EdgeAccountAction,
    ok: string,
    failed: string,
  ) => {
    setBusy(account.id);
    const answer = await callEdge("auth-admin", edge, { uid: account.id });
    setBusy(null);
    if (answer.ok) changed(ok);
    else show(`${failed}${answer.error.message}`);
  };
  const toStatus = async (account: Account, status: string) => {
    setBusy(account.id);
    const refused = await setStatus(db, account.id, status);
    setBusy(null);
    if (refused) show(`No se pudo cambiar el estado: ${refused}`);
    else changed(status === "active" ? "Usuario activado" : "Usuario desactivado");
  };
  const run = (action: AccountAction, account: Account) => {
    const server = THROUGH_SERVER[action];
    if (server) void viaServer(account, server.edge, server.ok, server.failed);
    const status = STATUS_OF[action];
    if (status) void toStatus(account, status);
  };
  const remove = (account: Account) =>
    viaServer(account, "delete_user", "Usuario eliminado", "Error: ");
  return { busy, run, remove, changed };
}

function AccountList({
  accounts,
  myId,
  busy,
  onAction,
  onDelete,
}: {
  readonly accounts: readonly Account[];
  readonly myId: string | null;
  readonly busy: string | null;
  readonly onAction: (action: AccountAction, account: Account) => void;
  readonly onDelete: (account: Account) => void;
}) {
  if (!accounts.length) return <p className={styles.nothing}>Sin resultados</p>;
  return accounts.map((account) => (
    <AccountRow
      key={account.id}
      account={account}
      deletable={canBeDeleted(account, myId)}
      busy={busy === account.id}
      onAction={onAction}
      onDelete={onDelete}
    />
  ));
}

/** Admin → Usuarios: the accounts, by status, and what the administrator does on them. */
export function UsersSheet() {
  const { db } = useBackend();
  const session = useSession();
  const myId = session.status === "signed-in" ? session.user.id : null;
  const accounts = useQuery({
    queryKey: ACCOUNTS_QUERY_KEY,
    queryFn: () => readAccounts(db),
    staleTime: 0,
  });
  const [query, setQuery] = useState("");
  const [status, setFilter] = useState("");
  const [form, setForm] = useState<FormState>(null);
  const [deleting, setDeleting] = useState<Account | null>(null);
  const { busy, run, remove, changed } = useAccountActions();
  const all = accounts.data ?? [];

  const onAction = (action: AccountAction, account: Account) => {
    if (action === "edit") setForm({ account });
    else run(action, account);
  };

  return (
    <div data-testid="admin-users">
      <SheetHead title="Usuarios del sistema" space="users">
        <Button
          size="sm"
          onClick={() => {
            setForm({ account: null });
          }}
        >
          + Nuevo usuario
        </Button>
      </SheetHead>
      <div className={styles.searchBar}>
        <Input
          elevated
          className={styles.search}
          placeholder="Buscar por nombre o email..."
          aria-label="Buscar usuarios"
          value={query}
          onChange={({ target }) => {
            setQuery(target.value);
          }}
        />
        <Select
          appearance="native"
          elevated
          aria-label="Estado"
          className={styles.filter}
          value={status}
          onChange={({ target }) => {
            setFilter(target.value);
          }}
        >
          {STATUS_FILTERS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>
      <div data-testid="users-list" aria-busy={accounts.isPending}>
        {accounts.isError && (
          <ReadProblem
            message="No se pudieron leer los usuarios"
            detail={accounts.error.message}
            onRetry={() => void accounts.refetch()}
          />
        )}
        {accounts.isPending && [1, 2, 3, 4].map((at) => <Skeleton key={at} />)}
        {accounts.isSuccess && (
          <AccountList
            accounts={filterAccounts(all, query, status)}
            myId={myId}
            busy={busy}
            onAction={onAction}
            onDelete={setDeleting}
          />
        )}
      </div>
      {form && (
        <AccountFormDialog
          account={form.account}
          accounts={all}
          onClose={() => {
            setForm(null);
          }}
          onSaved={changed}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`¿Eliminar definitivamente a ${accountName(deleting) || "este usuario"}?`}
          danger
          confirmLabel="Eliminar usuario"
          onCancel={() => {
            setDeleting(null);
          }}
          onConfirm={() => {
            setDeleting(null);
            void remove(deleting);
          }}
        >
          Se borrará su cuenta de acceso y su perfil. Esta acción no se puede deshacer.
        </ConfirmDialog>
      )}
    </div>
  );
}
