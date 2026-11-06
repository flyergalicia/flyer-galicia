import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePendingProposals } from "@/shared/lib/company-registry/proposals-query.ts";
import { registerProbe } from "@/shared/lib/test-probe.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import type { MenuWindowProps } from "@/shared/lib/view-props.ts";
import { usePermissions } from "@/shared/session/index.ts";
import { Modal, Tabs } from "@/shared/ui/index.ts";
import { databasePanes, type DatabasePane } from "../model/database-panes.ts";
import { registryProbe } from "../model/registry-probe.ts";
import { useDestinationRules, useRegistryContext } from "../model/registry-rules.ts";
import { useUserId } from "../model/use-companies.ts";
import { AdvisorsPane } from "./AdvisorsPane.tsx";
import { CompaniesPane } from "./CompaniesPane.tsx";
import { ProposalsPane } from "./ProposalsPane.tsx";
import { useRegistryWork } from "./use-registry-work.ts";

interface DatabaseWindowProps extends MenuWindowProps {
  /** Which pane opens first, for whoever comes to it from somewhere else. */
  readonly pane?: DatabasePane;
}

/** What each person saved: their companies, their advisors and what waits for their decision. */
export function DatabaseWindow({ onClose, pane }: DatabaseWindowProps) {
  const { can } = usePermissions();
  const { count: pendingCount } = usePendingProposals();
  const { show } = useToast();
  const panes = useMemo(() => databasePanes(can, pendingCount), [can, pendingCount]);
  const [chosen, setChosen] = useState<DatabasePane | undefined>(pane);
  const work = useRegistryWork();
  const { editor, dispatchEditor, generatorOpen, setGeneratorOpen, draft, dispatchDraft } = work;
  const { ask, question, leave } = work;
  // If the permissions change with the window open, it stays consistent.
  const active = panes.find(({ id }) => id === chosen) ?? panes[0];

  const queryClient = useQueryClient();
  const userId = useUserId();
  const context = useRegistryContext();
  const rules = useDestinationRules();
  const probe = useRef({ editor, rules, context });
  useEffect(() => {
    probe.current = { editor, rules, context };
  });
  useEffect(
    () =>
      registerProbe("companyRegistry", () =>
        registryProbe(queryClient, userId, () => probe.current),
      ),
    [queryClient, userId],
  );

  const nobodyHere = panes.length === 0;
  useEffect(() => {
    if (!nobodyHere) return;
    show("No tenés habilitada la base de datos.");
    onClose();
  }, [nobodyHere, onClose, show]);

  const choose = (next: string) => {
    if (next === active?.id) return;
    leave(() => {
      setChosen(panes.find(({ id }) => id === next)?.id);
    });
  };

  if (!active) return null;
  return (
    <Modal
      size="wide"
      closeOnBackdrop={false}
      onClose={() => {
        leave(onClose);
      }}
    >
      <Modal.Header icon="database-window">
        Base de datos{panes.length === 1 ? ` · ${active.label}` : ""}
      </Modal.Header>
      <Tabs value={active.id} onChange={choose} variant="pills-window">
        {panes.length > 1 && (
          <Tabs.List label="Base de datos">
            {panes.map(({ id, label }) => (
              <Tabs.Tab key={id} value={id}>
                {label}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        )}
        <Modal.Body>
          <div data-screen="my-database">
            {panes.some(({ id }) => id === "empresas") && (
              <Tabs.Panel value="empresas" keepMounted>
                <CompaniesPane
                  isActive={active.id === "empresas"}
                  editor={editor}
                  dispatchEditor={dispatchEditor}
                  generatorOpen={generatorOpen}
                  setGeneratorOpen={setGeneratorOpen}
                  ask={ask}
                />
              </Tabs.Panel>
            )}
            {panes.some(({ id }) => id === "asesores") && (
              <Tabs.Panel value="asesores" keepMounted>
                <AdvisorsPane
                  isActive={active.id === "asesores"}
                  draft={draft}
                  dispatch={dispatchDraft}
                  ask={ask}
                />
              </Tabs.Panel>
            )}
            {panes.some(({ id }) => id === "propuestas") && (
              <Tabs.Panel value="propuestas" keepMounted>
                <ProposalsPane isActive={active.id === "propuestas"} />
              </Tabs.Panel>
            )}
          </div>
        </Modal.Body>
      </Tabs>
      {question}
    </Modal>
  );
}
