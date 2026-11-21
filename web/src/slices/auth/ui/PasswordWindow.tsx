import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import type { MenuWindowProps } from "@/shared/lib/view-props.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useSession } from "@/shared/session/index.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { Button, Field, Input, Modal } from "@/shared/ui/index.ts";
import { passwordChangeProblem } from "../model/entry-rules.ts";
import styles from "./AccountWindow.module.css";

const FOCUS_AFTER_MS = 100;
const CLOSE_AFTER_MS = 1600;

type Stage = "idle" | "checking" | "saving";

const SUBMIT_TEXT: Readonly<Record<Stage, string>> = {
  idle: "Cambiar contraseña",
  checking: "Verificando...",
  saving: "Guardando...",
};

/** Whoever is inside changes it directly: the approval of the administrator is for the login. */
export function PasswordWindow({ onClose }: MenuWindowProps) {
  const { auth, callEdge } = useBackend();
  const session = useSession();
  const toast = useToast();
  const email = (session.status === "signed-in" && session.user.email) || "";
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const currentField = useRef<HTMLInputElement>(null);
  const closing = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    // The window takes the focus when it opens: this goes after that.
    const timer = setTimeout(() => {
      currentField.current?.focus();
    }, FOCUS_AFTER_MS);
    return () => {
      clearTimeout(timer);
      clearTimeout(closing.current);
    };
  }, []);

  const change = async (): Promise<void> => {
    // Entering again is how the password it says it has is checked.
    const checked = await auth.signInWithPassword({ email, password: current });
    if (!checked.ok) {
      setStage("idle");
      setError("La contraseña actual es incorrecta.");
      return;
    }
    setStage("saving");
    const changed = await auth.updatePassword(password);
    setStage("idle");
    if (!changed.ok) {
      setError(changed.error.message);
      return;
    }
    void callEdge("auth-admin", "notify_self_password");
    setOk("✅ Tu contraseña se cambió correctamente.");
    setCurrent("");
    setPassword("");
    setRepeat("");
    toast.show("Contraseña actualizada");
    closing.current = setTimeout(onClose, CLOSE_AFTER_MS);
  };

  const submit = () => {
    const problem = passwordChangeProblem(current, password, repeat);
    setError(problem ?? "");
    setOk("");
    if (problem) return;
    setStage("checking");
    void change();
  };

  const onLastFieldKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") submit();
  };

  return (
    <Modal look="account" size="narrow" onClose={onClose}>
      <Modal.Header>Cambiar mi contraseña</Modal.Header>
      <Modal.Body>
        <div className={styles.grid}>
          <Field className={styles.row}>
            <Field.Label>Contraseña actual</Field.Label>
            <Input
              ref={currentField}
              controlSize="lg"
              type="password"
              placeholder="Tu contraseña actual"
              value={current}
              onChange={({ target }) => {
                setCurrent(target.value);
              }}
            />
          </Field>
          <Field className={styles.row}>
            <Field.Label>Nueva contraseña</Field.Label>
            <Input
              controlSize="lg"
              type="password"
              placeholder="Mínimo 8 caracteres"
              value={password}
              onChange={({ target }) => {
                setPassword(target.value);
              }}
            />
          </Field>
          <Field className={styles.row}>
            <Field.Label>Repetir nueva contraseña</Field.Label>
            <Input
              controlSize="lg"
              type="password"
              placeholder="Repetí la nueva contraseña"
              value={repeat}
              onChange={({ target }) => {
                setRepeat(target.value);
              }}
              onKeyDown={onLastFieldKey}
            />
          </Field>
        </div>
      </Modal.Body>
      <div className={styles.error} data-testid="password-error">
        {error}
      </div>
      <div className={styles.ok} data-testid="password-ok">
        {ok}
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
          disabled={stage !== "idle"}
          className={`${styles.footerButton} ${styles.send}`}
          data-testid="password-submit"
          onClick={submit}
        >
          {SUBMIT_TEXT[stage]}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
