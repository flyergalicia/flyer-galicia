import { type ReactNode, useEffect, useState } from "react";
import { useFlyerWorkspace } from "@/shared/lib/flyer-workspace/index.ts";
import { registerProbe } from "@/shared/lib/test-probe.ts";
import { usePermissions, useSession } from "@/shared/session/index.ts";
import { FlyerFormContext } from "../model/form-context.ts";
import { createFlyerForm } from "../model/flyer-form.ts";
import { createFlyerHistory } from "../model/flyer-history.ts";
import { FlyerHistoryContext } from "../model/history-context.ts";

export function FlyerFormProvider({ children }: { readonly children: ReactNode }) {
  const workspace = useFlyerWorkspace();
  const session = useSession();
  const { can } = usePermissions();
  const [form] = useState(() => createFlyerForm(workspace));
  const [history] = useState(createFlyerHistory);
  const personId = session.status === "signed-in" ? session.user.id : null;
  const keepsIt = can("guardar_trabajo");
  useEffect(() => registerProbe("flyerForm", () => form.getState()), [form]);
  useEffect(() => registerProbe("flyerHistory", () => history.getItems()), [history]);
  useEffect(() => {
    if (keepsIt && personId) history.keepFor(personId);
    else history.stopKeeping();
  }, [history, keepsIt, personId]);
  return (
    <FlyerFormContext.Provider value={form}>
      <FlyerHistoryContext.Provider value={history}>{children}</FlyerHistoryContext.Provider>
    </FlyerFormContext.Provider>
  );
}
