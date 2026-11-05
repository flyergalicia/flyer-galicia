// The tab Gestiones. Who sees what and who writes what is decided by the database: here it is only
// drawn. The solapas of the agenda and of the dashboard are not here yet.
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useActionRequests } from "@/shared/lib/commercial-actions/commercial-desk.ts";
import { useCommercialNotices } from "@/shared/lib/commercial-actions/commercial-notices-query.ts";
import type { ViewProps } from "@/shared/lib/view-props.ts";
import { Button } from "@/shared/ui/index.ts";
import { type ListFilters, NO_FILTERS } from "../model/action-list.ts";
import type { CompanyLine } from "../model/my-companies.ts";
import type { PendingList } from "../model/use-action-saving.ts";
import { invalidateActionList, invalidateUnread } from "../model/use-actions-data.ts";
import { useWho } from "../model/use-who.ts";
import { type InnerTab, subtitleOf, tabsOf, type Who } from "../model/who.ts";
import { ActionDetail, type DetailTarget } from "./ActionDetail.tsx";
import { ActionsList } from "./ActionsList.tsx";
import { CompaniesTab } from "./CompaniesTab.tsx";
import { ForwardWindow } from "./ForwardWindow.tsx";
import { Chip } from "./parts.tsx";
import styles from "./CommercialActions.module.css";

const SEE_ALL_KEY = "fg_ges_vertodo";

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
  const { seesAll, onlyMine, toggle } = useSeeAll(stableWho);
  const { notices } = useCommercialNotices();
  useListFollowsNotices(notices.length, isActive && !target && isListOrAgenda(tab));

  const openTarget = (next: DetailTarget) => {
    setChosen("lista");
    setTarget(next);
    window.scrollTo(0, 0);
  };
  const open = (id: string) => {
    setTarget({ id });
    window.scrollTo(0, 0);
  };
  useActionRequests(({ id, complete }) => {
    openTarget({ id, complete });
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
          onChoose={(next) => {
            setChosen(next);
            setTarget(null);
          }}
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
          {target && (
            <ActionDetail
              key={target.id}
              who={stableWho}
              myLeader={myLeader}
              isActive={isActive}
              target={target}
              onBack={() => {
                setTarget(null);
              }}
              onBackToList={() => {
                setChosen("lista");
                setTarget(null);
              }}
              onOpen={open}
            />
          )}
          {!target && tab === "lista" && (
            <ActionsList
              who={stableWho}
              onlyMine={onlyMine}
              filters={filters}
              onFilters={setFilters}
              onOpen={open}
              onRegister={() => {
                goToTab?.("hunter");
              }}
            />
          )}
          {!target && tab === "empresas" && (
            <CompaniesTab
              who={stableWho}
              onlyMine={onlyMine}
              search={companySearch}
              filter={companyFilter}
              onSearch={setCompanySearch}
              onFilter={setCompanyFilter}
              onForward={setForwarding}
            />
          )}
          {/* The agenda and the dashboard arrive with the second part: `gesAgenda`, `gesTablero`. */}
        </div>
        {forwarding && (
          <ForwardWindow
            who={stableWho}
            myLeader={myLeader}
            company={forwarding}
            onClose={() => {
              setForwarding(null);
            }}
            onOpenAction={(id, pending: PendingList | null) => {
              setForwarding(null);
              openTarget({ id, ...(pending ? { pendingList: pending.text } : {}) });
            }}
          />
        )}
      </div>
    </div>
  );
}
