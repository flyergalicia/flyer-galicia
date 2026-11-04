import { useState } from "react";
import type {
  PublicEnvironment,
  PublicEnvironmentResult,
} from "@/shared/config/public-environment.ts";
import { AppProviders } from "@/shared/lib/AppProviders.tsx";
import { createBackend, createQueryClient } from "@/shared/supabase/index.ts";
import { AppGate } from "./AppGate.tsx";
import { NewVersionNotice } from "./shell/NewVersionNotice.tsx";
import styles from "./App.module.css";

function ConnectedApp({ supabaseUrl, supabaseAnonKey }: PublicEnvironment) {
  const [connection] = useState(() => ({
    backend: createBackend({ url: supabaseUrl, anonKey: supabaseAnonKey }),
    queryClient: createQueryClient(),
  }));
  return (
    <AppProviders backend={connection.backend} queryClient={connection.queryClient}>
      <AppGate />
      <NewVersionNotice />
    </AppProviders>
  );
}

type AppProps = {
  readonly environment: PublicEnvironmentResult;
};

export function App({ environment }: AppProps) {
  if (environment.ok) return <ConnectedApp {...environment.value} />;
  return (
    <main className={styles.page}>
      <h1>Flyer Galicia</h1>
      <p role="alert">
        Falta configurar la conexión con Supabase: {environment.missing.join(", ")}. Mirá
        web/.env.example.
      </p>
    </main>
  );
}
