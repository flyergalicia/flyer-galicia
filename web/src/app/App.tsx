import type { PublicEnvironmentResult } from "@/shared/config/public-environment.ts";
import styles from "./App.module.css";

type AppProps = {
  readonly environment: PublicEnvironmentResult;
};

export function App({ environment }: AppProps) {
  return (
    <main className={styles.page}>
      <h1>Flyer Galicia</h1>
      {environment.ok ? (
        <p>Base de la nueva aplicación lista.</p>
      ) : (
        <p role="alert">
          Falta configurar la conexión con Supabase: {environment.missing.join(", ")}. Mirá
          web/.env.example.
        </p>
      )}
    </main>
  );
}
