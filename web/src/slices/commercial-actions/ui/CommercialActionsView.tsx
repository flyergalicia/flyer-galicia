// The tab Gestiones. Who sees what and who writes what is decided by the database: here it is only
// drawn.
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isInnerTab } from "@/shared/domain/commercial-tabs.ts";
import { useActionRequests } from "@/shared/lib/commercial-actions/commercial-desk.ts";
import { useCommercialNotices } from "@/shared/lib/commercial-actions/commercial-notices-query.ts";
import { usePlaceRequests } from "@/shared/lib/places/place-desk.ts";
import type { ViewProps } from "@/shared/lib/view-props.ts";
import { Button } from "@/shared/ui/index.ts";
import { type ListFilters, NO_FILTERS } from "../model/action-list.ts";
import { type AgendaPlace, NO_PLACE, savedView } from "../model/agenda-place.ts";
import { type DashboardFilters, initialDashboardFilters } from "../model/dashboard.ts";
import type { CompanyLine } from "../model/my-companies.ts";
import type { PendingList } from "../model/use-action-saving.ts";
import {
  invalidateActionList,
  invalidateAgenda,
  invalidateUnread,
} from "../model/use-actions-data.ts";
import { useWho } from "../model/use-who.ts";
import { type InnerTab, subtitleOf, tabsOf, type Who } from "../model/who.ts";
import { ActionDetail, type DetailTarget } from "./ActionDetail.tsx";
import { ActionsList } from "./ActionsList.tsx";
import { AgendaTab } from "./AgendaTab.tsx";
import { CompaniesTab } from "./CompaniesTab.tsx";
import { DashboardTab } from "./DashboardTab.tsx";
import { ForwardWindow } from "./ForwardWindow.tsx";
import { Chip } from "./parts.tsx";
import styles from "./CommercialActions.module.css";

const SEE_ALL_KEY = "fg_ges_vertodo";
const AGENDA_VIEW_KEY = "fg_ges_agver";

function readAgendaPlace() {
  try {
    return { ...NO_PLACE, view: savedView(localStorage.getItem(AGENDA_VIEW_KEY)) };
  } catch {
    return NO_PLACE;
  }
}

function readSeeAll(): boolean {
  try {
    return localStorage.getItem(SEE_ALL_KEY) === "1";
  } catch {
    return false;
  }
}

function saveSeeAll(on: boolean): void {
  try {
    localStorage.setItem(SEE_ALL_KEY, on ? "1" : "0");
  } catch {
    // Without a place to keep it, it is chosen again next time.
  }
}

/** The administrator enters seeing their own, as one more officer. The rest, what the base lets. */
function useSeeAll(who: Who) {
  const [seesAll, setSeesAll] = useState(readSeeAll);
  const toggle = useCallback(() => {
    setSeesAll((before) => {
      saveSeeAll(!before);
      return !before;
    });
  }, []);
  return { seesAll, onlyMine: who.isAdmin && !seesAll, toggle };
}

function Head({
  who,
  isTestAccount,
  seesAll,
  showsSeeAll,
  onToggle,
}: {
  readonly who: Who;
  readonly isTestAccount: boolean;
  readonly seesAll: boolean;
  readonly showsSeeAll: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <div className={styles.top}>
      <div>
        <h2 className={styles.title}>Gestiones comerciales</h2>
        <p className={styles.subtitle}>{subtitleOf(who.role)}</p>
      </div>
      <div className={styles.topActions}>
        {isTestAccount && (
          <Chip
            tone="warn"
            title="Lo que hagas con esta cuenta queda marcado como prueba y no suma en el tablero de los demás"
          >
            Cuenta de prueba
          </Chip>
        )}
        {showsSeeAll && (
          <>
            <Chip tone={seesAll ? "info" : "ok"}>
              {seesAll ? "Viendo: todo el equipo" : "Viendo: lo tuyo"}
            </Chip>
            <Button variant="ghost" className={styles.small} onClick={onToggle}>
              {seesAll ? "Sólo lo mío" : "Ver todo"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

interface TabsProps {
  readonly who: Who;
  readonly tab: InnerTab;
  readonly isInDetail: boolean;
  readonly waiting: number;
  readonly onChoose: (tab: InnerTab) => void;
}

function Tabs({ who, tab, isInDetail, waiting, onChoose }: TabsProps) {
  return (
    <div className={styles.tabs} role="tablist" data-testid="commercial-tabs">
      {tabsOf(who.role).map(([id, label]) => {
        const isOn = tab === id && !isInDetail;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isOn}
            data-tab={id}
            className={`${styles.tab}${isOn ? ` ${styles.tabOn}` : ""}`}
            onClick={() => {
              onChoose(id);
            }}
          >
            {label}
            {id === "lista" && waiting > 0 && <span className={styles.badge}>{waiting}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** When the number of what is new changes, what is on screen is old. */
function useListFollowsNotices(count: number, isShowingList: boolean) {
  const queryClient = useQueryClient();
  const before = useRef(count);
  useEffect(() => {
    if (before.current === count) return;
    before.current = count;
    invalidateUnread(queryClient);
    if (isShowingList) invalidateActionList(queryClient);
  }, [count, isShowingList, queryClient]);
}

function isListOrAgenda(tab: InnerTab): boolean {
  return tab === "lista" || tab === "agenda";
}

/** If the profile changed (preview of the administrator) the solapa before may not exist. */
function tabToShow(role: string, chosen: InnerTab | null): InnerTab {
  const tabs = tabsOf(role);
  if (chosen && tabs.some(([id]) => id === chosen)) return chosen;
  return tabs[0]?.[0] ?? "lista";
}

interface SolapaProps {
  readonly tab: InnerTab;
  readonly who: Who;
  readonly myLeader: string | null;
  readonly onlyMine: boolean;
  readonly canSeeTrials: boolean;
  readonly filters: ListFilters;
  readonly onFilters: (filters: ListFilters) => void;
  readonly companySearch: string;
  readonly companyFilter: string;
  readonly onCompanySearch: (search: string) => void;
  readonly onCompanyFilter: (filter: string) => void;
  readonly onForward: (company: CompanyLine) => void;
  readonly agendaPlace: AgendaPlace;
  readonly onAgendaPlace: (place: AgendaPlace) => void;
  readonly dashboardFilters: DashboardFilters;
  readonly onDashboardFilters: (filters: DashboardFilters) => void;
  readonly onOpen: (id: string) => void;
  readonly onOpenHere: (target: DetailTarget) => void;
  readonly onOpenOnList: (id: string, pending: PendingList | null) => void;
  readonly onRegister: () => void;
}

function SolapaOf(props: SolapaProps) {
  const { tab, who, myLeader, onlyMine, canSeeTrials } = props;
  if (tab === "lista") {
    return (
      <ActionsList
        who={who}
        onlyMine={onlyMine}
        filters={props.filters}
        onFilters={props.onFilters}
        onOpen={props.onOpen}
        onRegister={props.onRegister}
      />
    );
  }
  if (tab === "empresas") {
    return (
      <CompaniesTab
        who={who}
        onlyMine={onlyMine}
        search={props.companySearch}
        filter={props.companyFilter}
        onSearch={props.onCompanySearch}
        onFilter={props.onCompanyFilter}
        onForward={props.onForward}
      />
    );
  }
  if (tab === "agenda") {
    return (
      <AgendaTab
        who={who}
        myLeader={myLeader}
        place={props.agendaPlace}
        onPlace={props.onAgendaPlace}
        onOpen={props.onOpenHere}
        onOpenAction={props.onOpenOnList}
      />
    );
  }
  return (
    <DashboardTab
      who={who}
      onlyMine={onlyMine}
      canSeeTrials={canSeeTrials}
      filters={props.dashboardFilters}
      onFilters={props.onDashboardFilters}
    />
  );
}

export function CommercialActionsView({ isActive, goToTab }: ViewProps) {
  const who = useWho();
  const { isTestAccount, myLeader, me, role, isAdmin, people } = who;
  const { peopleFailed, reloadPeople } = who;
  const stableWho = useMemo<Who>(
    () => ({ me, role, isAdmin, people, peopleFailed: Boolean(peopleFailed) }),
    [isAdmin, me, people, peopleFailed, role],
  );
  const [chosen, setChosen] = useState<InnerTab | null>(null);
  const tab = tabToShow(role, chosen);
  const [target, setTarget] = useState<DetailTarget | null>(null);
  const [filters, setFilters] = useState<ListFilters>(NO_FILTERS);
  const [companySearch, setCompanySearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("todas");
  const [forwarding, setForwarding] = useState<CompanyLine | null>(null);
  const [agendaPlace, setAgendaPlace] = useState(readAgendaPlace);
  const [dashboardFilters, setDashboardFilters] = useState(initialDashboardFilters);
  const queryClient = useQueryClient();
  const { seesAll, onlyMine, toggle } = useSeeAll(stableWho);
  const { notices } = useCommercialNotices();
  useListFollowsNotices(notices.length, isActive && !target && isListOrAgenda(tab));

  const openTarget = (next: DetailTarget) => {
    setChosen("lista");
    setTarget(next);
    window.scrollTo(0, 0);
  };
  const openHere = (next: DetailTarget) => {
    setTarget(next);
    window.scrollTo(0, 0);
  };
  const open = (id: string) => {
    openHere({ id });
  };
  const openOnList = (id: string, pending: PendingList | null) => {
    openTarget({ id, ...(pending ? { pendingList: pending.text } : {}) });
  };
  useActionRequests(({ id, complete }) => {
    openTarget({ id, complete });
  });
  const chooseTab = (next: InnerTab) => {
    setChosen(next);
    setTarget(null);
  };
  // A solapa from the search of screens: as the solapa itself does.
  usePlaceRequests("commercial-actions", (next) => {
    if (isInnerTab(next)) chooseTab(next);
  });

  return (
    <div className={styles.view}>
      <div className={styles.root}>
        <Head
          who={stableWho}
          isTestAccount={isTestAccount}
          seesAll={seesAll}
          showsSeeAll={isAdmin && !isTestAccount && tab !== "agenda"}
          onToggle={() => {
            toggle();
            setTarget(null);
          }}
        />
        <Tabs
          who={stableWho}
          tab={tab}
          isInDetail={Boolean(target)}
          waiting={notices.length}
          onChoose={chooseTab}
        />
        {peopleFailed && (
          <div className={styles.notice} data-testid="people-problem">
            No se pudieron traer los nombres del equipo.{" "}
            <button type="button" className={styles.link} onClick={reloadPeople}>
              Reintentar
            </button>
          </div>
        )}
        <div data-testid="commercial-screen">
          {target ? (
            <ActionDetail
              key={target.id}
              who={stableWho}
              myLeader={myLeader}
              isActive={isActive}
              target={target}
              onBack={() => {
                setTarget(null);
                invalidateAgenda(queryClient);
              }}
              onBackToList={() => {
                setChosen("lista");
                setTarget(null);
              }}
              onOpen={open}
            />
          ) : (
            <SolapaOf
              tab={tab}
              who={stableWho}
              myLeader={myLeader}
              onlyMine={onlyMine}
              canSeeTrials={isAdmin || isTestAccount}
              filters={filters}
              onFilters={setFilters}
              companySearch={companySearch}
              companyFilter={companyFilter}
              onCompanySearch={setCompanySearch}
              onCompanyFilter={setCompanyFilter}
              onForward={setForwarding}
              agendaPlace={agendaPlace}
              onAgendaPlace={setAgendaPlace}
              dashboardFilters={dashboardFilters}
              onDashboardFilters={setDashboardFilters}
              onOpen={open}
              onOpenHere={openHere}
              onOpenOnList={openOnList}
              onRegister={() => {
                goToTab?.("hunter");
              }}
            />
          )}
        </div>
        {forwarding && (
          <ForwardWindow
            who={stableWho}
            myLeader={myLeader}
            company={forwarding}
            onClose={() => {
              setForwarding(null);
            }}
            onOpenAction={(id, pending) => {
              setForwarding(null);
              openOnList(id, pending);
            }}
          />
        )}
      </div>
    </div>
  );
}
