import { type ReactNode, useEffect, useState } from "react";
import { registerProbe } from "@/shared/lib/test-probe.ts";
import { type Bucket, useBackend } from "@/shared/supabase/index.ts";
import { fetchLogoBlob, promotionLogoAddress } from "@/shared/lib/promotions/logo-file.ts";
import { useFlyerChanges } from "../flyer-changes/flyer-changes.ts";
import { emptyFormValues } from "./flyer-tab.ts";
import { createOptionLoader } from "./option-loader.ts";
import { FlyerWorkspaceContext } from "./workspace-context.ts";
import { workspaceReadings } from "./workspace-readings.ts";
import { createFlyerWorkspace, type WorkspaceOptions } from "./workspace-store.ts";

const SOURCES_FILE = "_fuentes.json";

interface FlyerWorkspaceProviderProps {
  readonly children: ReactNode;
  /** For the tests of a component: where it comes from. */
  readonly options?: Partial<WorkspaceOptions>;
}

/** The address the files of our bucket start with. */
function sectionsHome(bucket: Bucket): string {
  return bucket.publicUrl(SOURCES_FILE).slice(0, -SOURCES_FILE.length);
}

export function FlyerWorkspaceProvider({ children, options }: FlyerWorkspaceProviderProps) {
  const backend = useBackend();
  const [workspace] = useState(() =>
    createFlyerWorkspace({
      loadOption: createOptionLoader(backend.bucket),
      fetchLogo: (key) => fetchLogoBlob(promotionLogoAddress(key, backend.bucket)),
      initialForm: emptyFormValues("flyer"),
      isSectionAddress: (address) => address.startsWith(sectionsHome(backend.bucket)),
      ...options,
    }),
  );
  const changes = useFlyerChanges();
  useEffect(
    () =>
      changes.listen((option) => {
        workspace.forgetOption(option);
      }),
    [changes, workspace],
  );
  useEffect(() => registerProbe("flyerWorkspace", () => workspace), [workspace]);
  useEffect(() => registerProbe("flyerReadings", () => workspaceReadings(workspace)), [workspace]);
  return (
    <FlyerWorkspaceContext.Provider value={workspace}>{children}</FlyerWorkspaceContext.Provider>
  );
}
