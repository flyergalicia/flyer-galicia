// The screen of the Hunter profile: find a company some officer loaded and download its flyer, with
// its officers, its cashback, its caps and the legal text that goes with that flyer. Nothing is built
// here: it reuses what makes the ZIP, and who sees what is decided by the database.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  useCommercialDesk,
  useFlyerRequests,
} from "@/shared/lib/commercial-actions/commercial-desk.ts";
import { optionNumber, optionTab } from "@/shared/domain/flyer-options.ts";
import { type Company, searchCompanies } from "@/shared/domain/company-registry/index.ts";
import { RenameableTitle } from "@/shared/lib/app-config/RenameableTitle.tsx";
import { useWatchFlyerBatch } from "@/shared/lib/company-registry/flyer-generation-port.ts";
import type { CompanyBatchProgress } from "@/shared/lib/flyer-workspace/company-batch/company-batch.ts";
import {
  drawsSingleCashback,
  FlyerWorkspaceProvider,
  useCompanyBatch,
  useFlyerWorkspace,
  useGoToOption,
} from "@/shared/lib/flyer-workspace/index.ts";
import { usePrimaryAction } from "@/shared/lib/primary-action/primary-action-context.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import type { ViewProps } from "@/shared/lib/view-props.ts";
import { hasOpenWindow } from "@/shared/lib/primary-action/has-open-window.ts";
import { useCommercialActionsFlag, usePermissions } from "@/shared/session/index.ts";
import { Button, Field, Input } from "@/shared/ui/index.ts";
import { DEFAULT_CAP, flyerOfCompany } from "../model/company-flyer-rules.ts";
import { listStatus } from "../model/list-status.ts";
import type { PictureZoom } from "../model/picture-zoom.ts";
import { useCompanyPreview } from "../model/use-company-preview.ts";
import { MAX_LISTED, useHunterList, type HunterList } from "../model/use-hunter-list.ts";
import { useOpenProposals } from "../model/use-open-proposals.ts";
import { useTickedCompanies } from "../model/use-ticked-companies.ts";
import { CompanyList } from "./CompanyList.tsx";
import { MultipleBar } from "./MultipleBar.tsx";
import { PreviewPane } from "./PreviewPane.tsx";
import { ProposalWindow } from "./ProposalWindow.tsx";
import { TickedList } from "./TickedList.tsx";
import styles from "./HunterView.module.css";

const ZIP_BASE = "Flyers_Empresas";
const NOTHING_SELECTED = -1;

/** The ZIP of the ticked ones, each one on the flyer `flyerOfCompany` chose. */
function useTickedBatch(list: HunterList) {
  const workspace = useFlyerWorkspace();
  const { can } = usePermissions();
  const { rules } = list;
  const { options } = rules;
  const select = useCallback(
    (option: number) =>
      workspace.selectOption(
        option,
        drawsSingleCashback(optionTab(options, optionNumber(options, option))),
      ),
    [options, workspace],
  );
  const goTo = useGoToOption(select);
  const goBack = useCallback(
    (option: number) => {
      if (workspace.getState().slot.option !== option && can(`opcion_${option}`)) {
        void select(option);
      }
    },
    [can, select, workspace],
  );
  const batch = useCompanyBatch({
    rules,
    optionOf: (company) => flyerOfCompany(company, rules),
    goTo,
    goBack,
    formCap: () => DEFAULT_CAP,
  });
  const isGenerating = useSyncExternalStore(workspace.batch.subscribe, workspace.batch.isRunning);
  // Its ZIP counts as one more batch: meanwhile the search of screens does not open.
  useWatchFlyerBatch(workspace.batch.isRunning);
  return { batch, isGenerating };
}

/** Arriving at the screen, the cursor goes to the search, once it has where to search. */
function useFocusOnArrival(isActive: boolean, isLoading: boolean) {
  const field = useRef<HTMLInputElement>(null);
  const waiting = useRef(true);
  useEffect(() => {
    if (!isActive) waiting.current = true;
    else if (waiting.current && !isLoading) {
      waiting.current = false;
      field.current?.focus();
    }
  }, [isActive, isLoading]);
  return field;
}

function hasOwner(company: Company): company is Company & { readonly user_id: string } {
  return Boolean(company.user_id);
}

/** Alt+G. Not Ctrl+G, which on some browsers searches the web; `code` because of Option+G on a Mac. */
function isRegisterKey(event: KeyboardEvent): boolean {
  if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
  return event.code === "KeyG" || event.key === "g" || event.key === "G";
}

/** "Registrar gestión": it is there when Gestiones is on for this person. */
function useRegisterAction(isActive: boolean, company: Company | null) {
  const { show } = useToast();
  const desk = useCommercialDesk();
  const { on } = useCommercialActionsFlag();
  const register = () => {
    if (!company) show("Elegí primero una empresa de la lista.");
    else if (hasOwner(company)) desk?.register(company);
    else show("No se pudo identificar al oficial de esa empresa. Volvé a buscarla.");
  };
  const latest = useRef(register);
  useEffect(() => {
    latest.current = register;
  });
  useEffect(() => {
    if (!isActive || !on) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (!isRegisterKey(event) || hasOpenWindow()) return;
      event.preventDefault();
      latest.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [isActive, on]);
  return on ? register : null;
}

function RegisterButton({ onRegister }: { readonly onRegister: () => void }) {
  return (
    <Button
      variant="ghost"
      icon="pencil"
      className={styles.registerButton}
      title="Registrar gestión de la empresa elegida (Alt+G)"
      aria-keyshortcuts="Alt+G"
      data-testid="hunter-register"
      onClick={onRegister}
    >
      Registrar gestión
    </Button>
  );
}

/**
 * "Ver su flyer" of an action of Gestiones: the company stays written and the first one is chosen. If
 * the companies could not be read the list says so: it is not that it was not found.
 */
function useFlyerRequest(list: HunterList, chooseAt: (company: Company, position: number) => void) {
  const { show } = useToast();
  const { setQuery, companiesLoading, problem, all } = list;
  const wanted = useRef<string | null>(null);
  useFlyerRequests("hunter", ({ company }) => {
    wanted.current = company.trim();
    setQuery(wanted.current);
  });
  useEffect(() => {
    const name = wanted.current;
    if (name === null || companiesLoading) return;
    wanted.current = null;
    const [first] = searchCompanies(name, all, MAX_LISTED);
    if (first) chooseAt(first, 0);
    else if (problem !== "companies") {
      show(`No encontré «${name}» en las empresas que podés bajar.`);
    }
  });
}

function HunterScreen({ isActive }: ViewProps) {
  const { show } = useToast();
  const list = useHunterList(isActive);
  const { hits, all, query, setQuery, rules, loading, problem } = list;
  const multiple = useTickedCompanies(all);
  const proposals = useOpenProposals(isActive);
  const zoom = useRef<PictureZoom | null>(null);
  const onNewFlyer = useCallback(() => zoom.current?.reset(), []);
  const preview = useCompanyPreview({
    rules,
    noteHasNoFlyer: list.noteHasNoFlyer,
    onNewFlyer,
  });
  const { batch, isGenerating } = useTickedBatch(list);
  const [progress, setProgress] = useState<CompanyBatchProgress | null>(null);
  const [selected, setSelected] = useState(NOTHING_SELECTED);
  const [listRead, setListRead] = useState(all);
  const [proposing, setProposing] = useState<(Company & { readonly user_id: string }) | null>(null);
  const field = useFocusOnArrival(isActive, list.companiesLoading);
  if (all !== listRead) {
    setListRead(all);
    setSelected(NOTHING_SELECTED);
  }

  const { choose } = preview;
  const chooseAt = useCallback(
    (company: Company, position: number) => {
      if (choose(company)) setSelected(position);
    },
    [choose],
  );
  const onPropose = useCallback(
    (company: Company) => {
      if (hasOwner(company)) setProposing(company);
      else show("No se pudo identificar al oficial dueño de esta empresa.");
    },
    [show],
  );
  useFlyerRequest(list, chooseAt);
  const register = useRegisterAction(isActive, hits[selected] ?? null);
  const downloadTicked = () => {
    void batch.generate({
      companies: multiple.list,
      format: "pdf",
      zipBase: ZIP_BASE,
      onProgress: setProgress,
    });
  };

  // With companies ticked it is the ZIP of all of them; if not, the PDF of the one on screen.
  usePrimaryAction(() => {
    if (multiple.isOn && multiple.list.length > 0) {
      if (!isGenerating) downloadTicked();
    } else if (!preview.making) void preview.download();
  }, isActive);

  const showStatus = !loading && !problem && all.length > 0 && hits.length > 0;
  return (
    <div className={styles.screen}>
      <div className={styles.panel}>
        <RenameableTitle titleKey="hunter_ptitle" className={styles.title} />
        <div className={styles.help}>
          Escribí el nombre de la empresa (o su CUIT) y bajá el flyer que le corresponde, con sus
          oficiales y su cashback.
        </div>
        <Field>
          <Field.Label>Empresa</Field.Label>
          <Input
            ref={field}
            placeholder="Nombre de la empresa o CUIT"
            autoComplete="off"
            data-testid="hunter-search"
            value={query}
            onChange={({ target }) => {
              setQuery(target.value);
            }}
            onKeyDown={(event) => {
              const [first] = hits;
              if (event.key === "Escape") setQuery("");
              else if (event.key === "Enter" && !event.ctrlKey && !event.metaKey && first) {
                event.preventDefault();
                chooseAt(first, 0);
              }
            }}
          />
        </Field>
        <div className={styles.status} data-testid="hunter-status">
          {loading && "Buscando las empresas cargadas…"}
          {showStatus && listStatus(query, hits.length, all.length, MAX_LISTED)}
        </div>
        <MultipleBar
          isOn={multiple.isOn}
          count={multiple.list.length}
          isGenerating={isGenerating}
          progress={progress}
          onTickAll={(on) => {
            multiple.tickAll(
              hits.filter((company) => flyerOfCompany(company, rules) > 0),
              on,
            );
          }}
          onDownload={downloadTicked}
          onCancel={multiple.cancel}
        />
        {multiple.isOn && multiple.list.length > 0 && (
          <TickedList
            companies={multiple.list}
            rules={rules}
            onUntick={(company) => {
              multiple.tick(company, false);
            }}
          />
        )}
        <CompanyList
          list={list}
          selected={selected}
          ticked={multiple.isOn ? multiple.ticked : null}
          canPropose={proposals.canPropose}
          statusOf={proposals.statusOf}
          onChoose={chooseAt}
          onTick={multiple.tick}
          onPropose={onPropose}
        />
      </div>
      <PreviewPane
        state={preview.state}
        zoomRef={zoom}
        onDownload={() => {
          void preview.download();
        }}
        onMultiple={multiple.toggle}
        action={register && <RegisterButton onRegister={register} />}
      />
      {proposing && (
        <ProposalWindow
          company={proposing}
          onSent={() => {
            void proposals.reload();
          }}
          onClose={() => {
            setProposing(null);
          }}
        />
      )}
      {batch.dialogs}
    </div>
  );
}

export function HunterView(props: ViewProps) {
  return (
    <FlyerWorkspaceProvider>
      <HunterScreen {...props} />
    </FlyerWorkspaceProvider>
  );
}
