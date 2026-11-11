import { useState } from "react";
import { useSession, useSessionActions } from "@/shared/session/index.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { Button, Spinner } from "@/shared/ui/index.ts";
import { type EntryFormView, ForgotPasswordForm, LoginForm, RegisterForm } from "./EntryForms.tsx";
import { GaliciaHero } from "./GaliciaHero.tsx";
import styles from "./EntryScreen.module.css";

function EnteringCard() {
  return (
    <div className={styles.entering} aria-live="polite">
      <span className={styles.enteringSpinner}>
        <Spinner label="Ingresando" />
      </span>
      <h2 className={styles.title}>Ingresando…</h2>
      <p className={styles.subtitle}>Estamos abriendo tu armador.</p>
    </div>
  );
}

function RetryCard({ slow }: { readonly slow: boolean }) {
  const { retry, continueWithAnotherAccount } = useSessionActions();
  return (
    <div className={styles.retry} role="alert">
      <span className={styles.retryMark} aria-hidden="true">
        !
      </span>
      <h2 className={styles.title}>
        {slow ? "Está tardando más de lo normal" : "No se pudo conectar"}
      </h2>
      <p className={styles.subtitle}>
        Revisá la conexión y probá de nuevo. Tu sesión sigue abierta: no hace falta volver a poner
        la clave.
      </p>
      <Button size="lg" fullWidth onClick={retry}>
        Reintentar
      </Button>
      <div className={`${styles.links} ${styles.linksCentered}`}>
        <Button
          variant="link"
          size="xs"
          onClick={() => {
            void continueWithAnotherAccount();
          }}
        >
          Ingresar con otra cuenta
        </Button>
      </div>
    </div>
  );
}

/**
 * What whoever is not inside sees: the forms, "Ingresando…" or the card to try again. The forms
 * stay mounted, hidden, so that what was written is still there when coming back to them.
 */
export function EntryScreen() {
  const session = useSession();
  const { dismissPasswordRecovery } = useSessionActions();
  const { auth } = useBackend();
  const [view, setView] = useState<EntryFormView>("login");
  const [viewChanges, setViewChanges] = useState(0);
  const [rejectionRead, setRejectionRead] = useState(false);

  const { status, passwordRecovery } = session;
  const [seenStatus, setSeenStatus] = useState(status);
  if (status !== seenStatus) {
    setSeenStatus(status);
    setRejectionRead(false);
  }

  const isEntering = status === "signed-in" || (status === "loading" && auth.hasStoredSession());
  const isRetrying = status === "unreachable";
  const shownForm = passwordRecovery ? "forgot" : view;
  const hideForms = isEntering || isRetrying;

  const show = (next: EntryFormView) => {
    if (passwordRecovery) dismissPasswordRecovery();
    setRejectionRead(true);
    setView(next);
    setViewChanges((changes) => changes + 1);
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.shell}>
        <GaliciaHero />
        <div className={styles.card} data-testid="entry-card">
          {isEntering && <EnteringCard />}
          {isRetrying && <RetryCard slow={session.slow} />}
          <LoginForm
            hidden={hideForms || shownForm !== "login"}
            rejection={status === "rejected" && !rejectionRead ? session.message : ""}
            viewChanges={viewChanges}
            onShow={show}
          />
          <ForgotPasswordForm
            hidden={hideForms || shownForm !== "forgot"}
            viewChanges={viewChanges}
            onShow={show}
          />
          <RegisterForm
            hidden={hideForms || shownForm !== "register"}
            viewChanges={viewChanges}
            onShow={show}
          />
        </div>
      </div>
    </div>
  );
}
