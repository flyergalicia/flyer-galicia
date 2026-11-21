import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { invalidateTeams } from "@/shared/lib/commercial-actions/people-query.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { Button, Field, Input, Modal, Select } from "@/shared/ui/index.ts";
import { type AccountChange, saveAccount, setLeaderByEmail } from "../api/accounts.ts";
import {
  accessToSend,
  type AccountForm,
  becomesActive,
  editAccountForm,
  editProblem,
  newAccountForm,
  newAccountProblem,
  PROFILE_CHOICES,
  STATUS_CHOICES,
} from "../model/account-form.ts";
import { type Account, leaderName, leadersFor } from "../model/accounts.ts";
import styles from "./AccountForm.module.css";

const FOCUS_AFTER_MS = 100;

interface AccountFormDialogProps {
  /** Null: a new account. */
  readonly account: Account | null;
  readonly accounts: readonly Account[];
  readonly onClose: () => void;
  /** It was saved: the list, the numbers and the teams are old. */
  readonly onSaved: (notice: string) => void;
}

function TextField({
  label,
  children,
  className,
}: {
  readonly label: string;
  readonly children: ReactNode;
  readonly className?: string | undefined;
}) {
  return (
    <Field className={className ? `${styles.field} ${className}` : styles.field}>
      <Field.Label>{label}</Field.Label>
      {children}
    </Field>
  );
}

function SendAccess({
  form,
  change,
}: {
  readonly form: AccountForm;
  readonly change: (patch: Partial<AccountForm>) => void;
}) {
  const to = useRef<HTMLInputElement>(null);
  return (
    <div className={styles.full} data-testid="send-access">
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={form.sendAccess}
          onChange={({ target }) => {
            change({ sendAccess: target.checked });
            if (target.checked) {
              setTimeout(() => {
                to.current?.focus();
                to.current?.select();
              });
            }
          }}
        />
        Enviar usuario y contraseña por mail
      </label>
      {form.sendAccess && (
        <div className={styles.sendFields} data-testid="send-access-fields">
          <TextField label="Enviar a">
            <Input
              ref={to}
              controlSize="lg"
              type="email"
              placeholder="mail de quien lo recibe"
              value={form.sendTo}
              onChange={({ target }) => {
                change({ sendTo: target.value });
              }}
            />
          </TextField>
          <TextField label="Nombre de quien lo recibe (opcional)">
            <Input
              placeholder="Para el saludo del mail"
              value={form.sendName}
              onChange={({ target }) => {
                change({ sendName: target.value });
              }}
            />
          </TextField>
        </div>
      )}
    </div>
  );
}

function useSubmit(
  account: Account | null,
  form: AccountForm,
  { onClose, onSaved }: Pick<AccountFormDialogProps, "onClose" | "onSaved">,
) {
  const { db, callEdge } = useBackend();
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const done = (notice: string) => {
    invalidateTeams(queryClient);
    onClose();
    onSaved(notice);
  };

  const create = async () => {
    const email = form.email.trim();
    const created = await callEdge("auth-admin", "create_user", {
      email,
      password: form.password,
      full_name: form.name.trim(),
      role: form.role,
      status: form.status,
    });
    if (!created.ok) return created.error.message;
    if (form.leader) await setLeaderByEmail(db, email, form.leader);
    done("✅ Usuario creado exitosamente");
    return "";
  };

  const edit = async (before: Account) => {
    const change: AccountChange = {
      full_name: form.name.trim(),
      role: form.role,
      status: form.status,
      lider_id: form.leader || null,
    };
    const saved = await saveAccount(db, before.id, change);
    if (saved) return saved;
    // Going to active approves it, which sends the mail "tu cuenta ya está activa".
    if (becomesActive(before, form.status))
      void callEdge("auth-admin", "approve_user", { uid: before.id });
    if (!form.password) {
      done("Usuario actualizado");
      return "";
    }
    const access = accessToSend(form);
    const changed = await callEdge(
      "auth-admin",
      "set_password",
      access
        ? {
            uid: before.id,
            password: form.password,
            enviar_a: access.to,
            enviar_nombre: access.name,
          }
        : { uid: before.id, password: form.password },
    );
    if (!changed.ok) return changed.error.message;
    done(
      access
        ? `Contraseña cambiada. Usuario y contraseña enviados a ${access.to}.`
        : "Usuario actualizado y contraseña cambiada",
    );
    return "";
  };

  const submit = () => {
    const problem = account ? editProblem(form) : newAccountProblem(form);
    setError(problem);
    if (problem) return;
    setBusy(true);
    void (account ? edit(account) : create()).then((refused) => {
      setBusy(false);
      setError(refused);
    });
  };
  return { error, busy, submit };
}

function submitText(isNew: boolean, busy: boolean): string {
  if (isNew) return busy ? "Creando..." : "Crear usuario";
  return busy ? "Guardando..." : "Guardar cambios";
}

/** "+ Nuevo usuario" and Editar: always through auth-admin for what needs the server. */
export function AccountFormDialog({ account, accounts, onClose, onSaved }: AccountFormDialogProps) {
  const [form, setForm] = useState(() => (account ? editAccountForm(account) : newAccountForm()));
  const change = (patch: Partial<AccountForm>) => {
    setForm((current) => ({ ...current, ...patch }));
  };
  const nameField = useRef<HTMLInputElement>(null);
  const { error, busy, submit } = useSubmit(account, form, { onClose, onSaved });
  const leaders = leadersFor(accounts, account?.id ?? null);
  const isNew = account === null;

  useEffect(() => {
    // The window takes the focus first: the name goes after it.
    const timer = setTimeout(() => {
      nameField.current?.focus();
    }, FOCUS_AFTER_MS);
    return () => {
      clearTimeout(timer);
    };
  }, []);

  return (
    <Modal look="account" onClose={onClose}>
      <Modal.Header>{isNew ? "Nuevo usuario" : "Editar usuario"}</Modal.Header>
      <Modal.Body>
        <div className={styles.grid}>
          <TextField label="Nombre completo">
            <Input
              ref={nameField}
              placeholder="Juan Pérez"
              value={form.name}
              onChange={({ target }) => {
                change({ name: target.value });
              }}
            />
          </TextField>
          <TextField label="Email">
            <Input
              controlSize="lg"
              type="email"
              placeholder="juan@banco.com"
              disabled={!isNew}
              value={form.email}
              onChange={({ target }) => {
                change({ email: target.value });
              }}
            />
          </TextField>
          <TextField label={isNew ? "Contraseña" : "Nueva contraseña (opcional)"}>
            <Input
              controlSize="lg"
              type="password"
              placeholder={isNew ? "Mínimo 8 caracteres" : "Dejar vacío para no cambiar"}
              value={form.password}
              onChange={({ target }) => {
                change({ password: target.value });
              }}
            />
          </TextField>
          {!isNew && form.password && <SendAccess form={form} change={change} />}
          <TextField label="Rol">
            <Select
              appearance="native"
              controlSize="lg"
              value={form.role}
              onChange={({ target }) => {
                change({ role: target.value });
              }}
            >
              {PROFILE_CHOICES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </TextField>
          {leaders.length > 0 && (
            <TextField label="Líder a cargo">
              <Select
                appearance="native"
                controlSize="lg"
                value={form.leader}
                onChange={({ target }) => {
                  change({ leader: target.value });
                }}
              >
                <option value="">Sin líder</option>
                {leaders.map((leader) => (
                  <option key={leader.id} value={leader.id}>
                    {leaderName(leader)}
                  </option>
                ))}
              </Select>
            </TextField>
          )}
          <TextField label="Estado" className={styles.full}>
            <Select
              appearance="native"
              controlSize="lg"
              className={styles.half}
              value={form.status}
              onChange={({ target }) => {
                change({ status: target.value });
              }}
            >
              {STATUS_CHOICES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </TextField>
        </div>
      </Modal.Body>
      <div className={styles.error} data-testid="account-form-error">
        {error}
      </div>
      <Modal.Footer>
        <Button
          variant="ghost"
          size="sm"
          className={`${styles.footerButton} ${styles.cancel}`}
          onClick={onClose}
        >
          Cancelar
        </Button>
        <Button
          size="sm"
          disabled={busy}
          className={`${styles.footerButton} ${styles.send}`}
          data-testid="account-form-submit"
          onClick={submit}
        >
          {submitText(isNew, busy)}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
