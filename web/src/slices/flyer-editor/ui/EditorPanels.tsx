import type { ReactNode, RefObject } from "react";
import { type IconName, Tabs } from "@/shared/ui/index.ts";
import { EDITOR_PANELS, type EditorPanel } from "@/shared/domain/editor-panels.ts";
import type { SearchableCompany } from "@/shared/domain/company-registry/index.ts";
import type { HistoryItem } from "../model/stored-flyer.ts";
import type { DownloadKind } from "../model/use-flyer-download.ts";
import { AmountsCard } from "./AmountsCard.tsx";
import { CompanyCard } from "./CompanyCard.tsx";
import { FileNameCard } from "./FileNameCard.tsx";
import { FlyerActions } from "./FlyerActions.tsx";
import { HistoryPanel } from "./HistoryPanel.tsx";
import { LegalCard } from "./LegalCard.tsx";
import { OfficersCard } from "./OfficersCard.tsx";

interface EditorPanelsProps {
  readonly isCategoryTab: boolean;
  readonly busy: boolean;
  readonly sharing: boolean;
  readonly canShare: boolean;
  /** The form takes its place again, for whoever comes from the history. */
  readonly tab: EditorTab;
  readonly onTab: (tab: EditorTab) => void;
  /** Where a person works: what the session draft listens to. */
  readonly individual: RefObject<HTMLDivElement | null>;
  readonly draftOffer: ReactNode;
  /** It stays alive while another panel shows: what was read of a sheet is still there. */
  readonly bulkPanel: ReactNode;
  readonly onChooseCompany: (company: SearchableCompany) => void;
  readonly onOpenDatabase: () => void;
  readonly onPreview: () => void;
  readonly onDownload: (kind: DownloadKind) => void;
  readonly onShare: () => void;
  readonly onRestore: () => void;
  readonly onLoadFromHistory: (item: HistoryItem) => void;
  readonly onDownloadFromHistory: (item: HistoryItem) => void;
}

export type EditorTab = EditorPanel;

const PANEL_ICONS: Readonly<Record<EditorPanel, IconName>> = {
  individual: "pencil",
  masivo: "document",
  historial: "clock",
};

/** Individual, Masivo and Historial. The first two stay mounted while another one shows. */
export function EditorPanels({
  isCategoryTab,
  busy,
  sharing,
  canShare,
  tab,
  onTab,
  individual,
  draftOffer,
  bulkPanel,
  onChooseCompany,
  onOpenDatabase,
  onPreview,
  onDownload,
  onShare,
  onRestore,
  onLoadFromHistory,
  onDownloadFromHistory,
}: EditorPanelsProps) {
  return (
    <Tabs
      value={tab}
      onChange={(next) => {
        for (const [panel] of EDITOR_PANELS) if (panel === next) onTab(panel);
      }}
    >
      <Tabs.List label="Modo de armado">
        {EDITOR_PANELS.map(([value, label]) => (
          <Tabs.Tab key={value} value={value} icon={PANEL_ICONS[value]}>
            {label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      <Tabs.Panel value="individual" keepMounted>
        <div ref={individual}>
          {draftOffer}
          <CompanyCard
            isCategoryTab={isCategoryTab}
            onChoose={onChooseCompany}
            onOpenDatabase={onOpenDatabase}
          />
          <OfficersCard />
          <AmountsCard />
          <LegalCard />
          <FileNameCard />
          <FlyerActions
            busy={busy}
            sharing={sharing}
            canShare={canShare}
            onPreview={onPreview}
            onDownload={onDownload}
            onShare={onShare}
            onRestore={onRestore}
          />
        </div>
      </Tabs.Panel>
      <Tabs.Panel value="masivo" keepMounted>
        {bulkPanel}
      </Tabs.Panel>
      <Tabs.Panel value="historial">
        <HistoryPanel
          onLoad={onLoadFromHistory}
          onDownload={onDownloadFromHistory}
          onBackToForm={() => {
            onTab("individual");
          }}
        />
      </Tabs.Panel>
    </Tabs>
  );
}
