import { type KeyboardEvent, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useSessionActions } from "@/shared/session/index.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { Button, Field, Input } from "@/shared/ui/index.ts";
import {
  forgotProblem,
  loginFailureMessage,
  loginProblem,
  NO_CONNECTION,
  registerProblem,
} from "../model/entry-rules.ts";
import styles from "./EntryScreen.module.css";

export type EntryFormView = "login" | "forgot" | "register";

interface EntryField {
  readonly label: string;
  readonly type: "email" | "password" | "text";
  readonly placeholder: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onEnter?: () => void;
}

function FormField({ label, type, placeholder, value, onChange, onEnter }: EntryField) {
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") onEnter?.();
  };
  return (
    <Field className={styles.field}>
      <Field.Label>{label}</Field.Label>
      <Input
        controlSize="lg"
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={({ target }) => {
          onChange(target.value);
        }}
        onKeyDown={onKeyDown}
      />
    </Field>
  );
}

const BANK_MAIL_HINT = "tu@bancogalicia.com.ar";
const LONG_PASSWORD_HINT = "Mínimo 8 caracteres";

interface FormProps {
  readonly hidden: boolean;
  /** It changes each time the view changes: what was written stays, the messages do not. */
  readonly viewChanges: number;
  readonly onShow: (view: EntryFormView) => void;
}

/** A message that lasts until the view changes. */
function useFormMessages<T>(empty: T, viewChanges: number) {
  const [messages, setMessages] = useState(empty);
  const [seen, setSeen] = useState(viewChanges);
  if (seen !== viewChanges) {
    setSeen(viewChanges);
    setMessages(empty);
  }
  return [messages, setMessages] as const;
}

interface LoginFormProps extends FormProps {
  /** Why the session was closed; it goes away with the first new attempt or view. */
  readonly rejection: string;
}

export function LoginForm({ hidden, rejection, viewChanges, onShow }: LoginFormProps) {
  const { signIn } = useSessionActions();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useFormMessages("", viewChanges);
  const [busy, setBusy] = useState(false);
  const shown = error || rejection;

  const submit = () => {
    const mail = email.trim();
    const problem = loginProblem(mail, password);
    setError(problem ?? "");
    if (problem) return;
    setBusy(true);
    void signIn({ email: mail, password }).then((session) => {
      setBusy(false);
      if (!session.ok) setError(loginFailureMessage(session.error));
    });
  };

  return (
    <div className={styles.view} hidden={hidden}>
      <h1 className={styles.title}>Flyer Galicia</h1>
      <p className={styles.subtitle}>Ingresá con tu cuenta para continuar</p>
      <FormField
        label="Email"
        type="email"
        placeholder={BANK_MAIL_HINT}
        value={email}
        onChange={setEmail}
      />
      <FormField
        label="Contraseña"
        type="password"
        placeholder={"•".repeat(8)}
        value={password}
        onChange={setPassword}
        onEnter={submit}
      />
      <div className={styles.error} data-testid="login-error">
        {shown}
      </div>
      <Button size="lg" fullWidth disabled={busy} className={styles.submit} onClick={submit}>
        {busy ? "Ingresando..." : "Ingresar"}
      </Button>
      <div className={styles.links}>
        <Button
          variant="link"
          size="xs"
          onClick={() => {
            onShow("forgot");
          }}
        >
          ¿Olvidaste tu contraseña?
        </Button>
        <Button
          variant="link"
          size="xs"
          onClick={() => {
            onShow("register");
          }}
        >
          Crear cuenta
        </Button>
      </div>
    </div>
  );
}

interface SendState {
  readonly error: string;
  readonly ok: string;
}

const NOTHING_YET: SendState = { error: "", ok: "" };

export function ForgotPasswordForm({ hidden, viewChanges, onShow }: FormProps) {
  const { callEdge } = useBackend();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [state, setState] = useFormMessages(NOTHING_YET, viewChanges);
  const send = useMutation({
    mutationFn: (mail: string) =>
      callEdge("auth-admin", "request_reset", { email: mail, password }),
    onSuccess: (answer) => {
      if (!answer.ok) {
        setState({ error: answer.error.message, ok: "" });
        return;
      }
      setPassword("");
      setRepeat("");
      setState({
        error: "",
        ok: "✅ Tu nueva contraseña quedó registrada y está pendiente de aprobación del administrador. Vas a poder ingresar una vez aprobada.",
      });
    },
    onError: () => {
      setState({ error: NO_CONNECTION, ok: "" });
    },
  });

  const submit = () => {
    const mail = email.trim();
    const problem = forgotProblem(mail, password, repeat);
    setState({ error: problem ?? "", ok: "" });
    if (!problem) send.mutate(mail);
  };

  return (
    <div className={styles.view} hidden={hidden}>
      <h2 className={styles.title}>Recuperar contraseña</h2>
      <p className={styles.subtitle}>
        Elegí una nueva contraseña. El cambio quedará pendiente de aprobación del administrador.
      </p>
      <FormField
        label="Email"
        type="email"
        placeholder={BANK_MAIL_HINT}
        value={email}
        onChange={setEmail}
      />
      <FormField
        label="Nueva contraseña"
        type="password"
        placeholder={LONG_PASSWORD_HINT}
        value={password}
        onChange={setPassword}
      />
      <FormField
        label="Repetir nueva contraseña"
        type="password"
        placeholder="Repetí la contraseña"
        value={repeat}
        onChange={setRepeat}
      />
      <div className={styles.error} data-testid="forgot-error">
        {state.error}
      </div>
      <div className={styles.ok} data-testid="forgot-ok">
        {state.ok}
      </div>
      <Button
        size="lg"
        fullWidth
        disabled={send.isPending}
        className={styles.submit}
        data-testid="forgot-submit"
        onClick={submit}
      >
        {send.isPending ? "Enviando..." : "Solicitar cambio"}
      </Button>
      <div className={`${styles.links} ${styles.linksCentered}`}>
        <Button
          variant="link"
          size="xs"
          onClick={() => {
            onShow("login");
          }}
        >
          ← Volver al inicio de sesión
        </Button>
      </div>
    </div>
  );
}

export function RegisterForm({ hidden, viewChanges, onShow }: FormProps) {
  const { callEdge } = useBackend();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useFormMessages(NOTHING_YET, viewChanges);
  const send = useMutation({
    mutationFn: (account: { readonly mail: string; readonly fullName: string }) =>
      callEdge("auth-admin", "register", {
        email: account.mail,
        password,
        full_name: account.fullName,
      }),
    onSuccess: (answer) => {
      if (!answer.ok) {
        setState({ error: answer.error.message, ok: "" });
        return;
      }
      setName("");
      setEmail("");
      setPassword("");
      // Neutral on purpose: the server answers the same whether that mail has an account or not.
      setState({
        error: "",
        ok: "✅ Listo. Si el mail es válido, tu acceso queda pendiente de aprobación del administrador.",
      });
    },
    onError: () => {
      setState({ error: NO_CONNECTION, ok: "" });
    },
  });

  const submit = () => {
    const fullName = name.trim();
    const mail = email.trim();
    const problem = registerProblem(fullName, mail, password);
    setState({ error: problem ?? "", ok: "" });
    if (!problem) send.mutate({ mail, fullName });
  };

  return (
    <div className={styles.view} hidden={hidden}>
      <h2 className={styles.title}>Crear cuenta</h2>
      <p className={styles.subtitle}>Tu acceso queda pendiente de aprobación del administrador</p>
      <FormField
        label="Nombre completo"
        type="text"
        placeholder="Tu nombre y apellido"
        value={name}
        onChange={setName}
      />
      <FormField
        label="Email"
        type="email"
        placeholder={BANK_MAIL_HINT}
        value={email}
        onChange={setEmail}
      />
      <FormField
        label="Contraseña"
        type="password"
        placeholder={LONG_PASSWORD_HINT}
        value={password}
        onChange={setPassword}
      />
      <div className={styles.error} data-testid="register-error">
        {state.error}
      </div>
      <div className={styles.ok} data-testid="register-ok">
        {state.ok}
      </div>
      <Button
        size="lg"
        fullWidth
        disabled={send.isPending}
        className={styles.submit}
        data-testid="register-submit"
        onClick={submit}
      >
        {send.isPending ? "Creando cuenta..." : "Crear cuenta"}
      </Button>
      <div className={`${styles.links} ${styles.linksCentered}`}>
        <Button
          variant="link"
          size="xs"
          onClick={() => {
            onShow("login");
          }}
        >
          ← Ya tengo cuenta
        </Button>
      </div>
    </div>
  );
}
