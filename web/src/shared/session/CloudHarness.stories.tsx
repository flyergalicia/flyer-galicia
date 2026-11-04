// Not a screen: what lets tests/e2e/specs/design-system/network-contract.spec.ts walk the entry of
// the session against the simulated cloud. By hand it is inert, and it never holds an address of its
// own: Playwright gives it the one its simulated cloud intercepts.
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { createBackend, createQueryClient } from "@/shared/supabase/index.ts";
import { usePermissions, useSession, useSessionActions } from "./index.ts";
import { SessionTestProviders } from "./SessionTestProviders.tsx";

interface TestCloud {
  readonly url: string;
  readonly anonKey: string;
}

function SessionState() {
  const session = useSession();
  const { retry } = useSessionActions();
  const { loadStatus } = usePermissions();
  return (
    <>
      <output data-testid="session-status">{session.status}</output>
      <output data-testid="session-message">{"message" in session ? session.message : ""}</output>
      <output data-testid="permissions-status">{loadStatus}</output>
      <button type="button" onClick={retry}>
        Reintentar
      </button>
    </>
  );
}

function CloudHarness() {
  const [parts] = useState(() => {
    const cloud: TestCloud | undefined = Reflect.get(window, "__FLYER_TEST_CLOUD__");
    return cloud ? { backend: createBackend(cloud), queryClient: createQueryClient() } : null;
  });
  if (!parts) return <p>Sin nube de prueba: esta historia no hace nada</p>;
  return (
    <SessionTestProviders backend={parts.backend} queryClient={parts.queryClient} strict>
      <SessionState />
    </SessionTestProviders>
  );
}

const meta = {
  title: "Shared/Session/CloudHarness",
  component: CloudHarness,
} satisfies Meta<typeof CloudHarness>;

export default meta;

export const Entry: StoryObj<typeof meta> = {};
