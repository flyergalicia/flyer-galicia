import { initialsOf } from "@/shared/domain/initials.ts";
import { relativeDate } from "@/shared/domain/relative-date.ts";
import { ROLE_LABELS, roleTone } from "@/shared/session/index.ts";
import { Avatar, Badge, Button, ListRow } from "@/shared/ui/index.ts";
import {
  type Account,
  type AccountAction,
  accountButtons,
  isWaiting,
  showsRole,
  statusLabel,
  statusTone,
} from "../model/accounts.ts";
import { avatarColor } from "../model/people.ts";
import { SEPARATOR } from "../model/text.ts";

const BUTTON_VARIANT = { ok: "soft-ok", warn: "soft-danger", edit: "soft-neutral" } as const;

export interface AccountRowProps {
  readonly account: Account;
  readonly deletable: boolean;
  /** A button of this row was pressed and its answer has not arrived. */
  readonly busy: boolean;
  readonly onAction: (action: AccountAction, account: Account) => void;
  readonly onDelete: (account: Account) => void;
}

/** A user of Admin → Usuarios: who, their profile and status, and what can be done with them. */
export function AccountRow({ account, deletable, busy, onAction, onDelete }: AccountRowProps) {
  const mail = account.email_asesor ?? "";
  const role = account.role ?? "";
  return (
    <ListRow tone={isWaiting(account) ? "waiting" : "plain"} data-testid="account-row">
      <Avatar
        initials={initialsOf(account.full_name ?? "", mail)}
        color={avatarColor(account.id)}
      />
      <ListRow.Main>
        <ListRow.Title>{account.full_name || mail || "Sin nombre"}</ListRow.Title>
        <ListRow.Meta>
          {mail}
          {SEPARATOR}Últ. acceso:{" "}
          {account.last_login ? relativeDate(account.last_login) : "Sin accesos"}
        </ListRow.Meta>
      </ListRow.Main>
      <ListRow.Aside tight>
        {showsRole(account) && (
          <Badge tone={roleTone(role)} data-testid="account-badge">
            {ROLE_LABELS[role] ?? "Asesor"}
          </Badge>
        )}
        <Badge tone={statusTone(account.status)} data-testid="account-badge">
          {statusLabel(account.status)}
        </Badge>
      </ListRow.Aside>
      <ListRow.Aside>
        {accountButtons(account).map(({ action, label, tone, hint }) => (
          <Button
            key={action}
            variant={BUTTON_VARIANT[tone]}
            size="xs"
            title={hint}
            disabled={busy}
            onClick={() => {
              onAction(action, account);
            }}
          >
            {label}
          </Button>
        ))}
        {deletable && (
          <Button
            variant="soft-danger"
            size="icon"
            aria-label="Eliminar usuario"
            title="Eliminar usuario definitivamente"
            disabled={busy}
            onClick={() => {
              onDelete(account);
            }}
          >
            🗑
          </Button>
        )}
      </ListRow.Aside>
    </ListRow>
  );
}
