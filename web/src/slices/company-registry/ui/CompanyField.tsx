import {
  type ComponentProps,
  type KeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  companySubtitle,
  digitsOf,
  isBorrowed,
  normalizeName,
  type SearchableCompany,
  searchCompanies,
} from "@/shared/domain/company-registry/index.ts";
import { registerProbe } from "@/shared/lib/test-probe.ts";
import { usePermissions } from "@/shared/session/index.ts";
import { Button, Input } from "@/shared/ui/index.ts";
import { companyListProbe } from "../model/registry-probe.ts";
import { useRegistryContext } from "../model/registry-rules.ts";
import {
  useCompanies,
  useSearchableCompanies,
  useSubstituteCompanies,
  useUserId,
} from "../model/use-companies.ts";
import styles from "./CompanyField.module.css";

const SEARCH_LIMIT = 60;
const MAX_SUGGESTIONS = 8;
const MIN_LETTERS = 2;
const MIN_TAX_ID_DIGITS = 3;
/** Suggestions try again by themselves without bothering: at most once every 10 seconds. */
const QUIET_RETRY_MS = 10_000;
const POPUP_GAP = 5;
const POPUP_EDGE = 10;
const POPUP_BOTTOM = 60;

/** Two groups can have the same name. */
function keyOfOption(company: SearchableCompany, position: number): string {
  return `${company.empresa}-${String(position)}`;
}

function CompanyOption({
  company,
  on,
  names,
  onChoose,
}: {
  readonly company: SearchableCompany;
  readonly on: boolean;
  readonly names: readonly string[];
  readonly onChoose: () => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  // The option under the keyboard stays in sight.
  useEffect(() => {
    if (on) button.current?.scrollIntoView({ block: "nearest" });
  }, [on]);
  return (
    <button
      ref={button}
      type="button"
      className={on ? `${styles.item} ${styles.itemOn}` : styles.item}
      data-testid="company-option"
      data-on={on}
      onClick={onChoose}
    >
      <span className={styles.name} data-part="name">
        {company.empresa || "(sin razón social)"}
      </span>
      <span className={styles.subtitle}>{companySubtitle(company, names)}</span>
      {isBorrowed(company) && (
        <span className={styles.owner} data-part="owner">
          Empresa de {company.owner.nombre}
        </span>
      )}
    </button>
  );
}

interface SearchResultsProps {
  readonly hits: readonly SearchableCompany[];
  readonly selected: number;
  readonly query: string;
  readonly hasCompanies: boolean;
  /** Not "you have no companies": it could not be known (invariant 24). */
  readonly connectionFailed: boolean;
  readonly names: readonly string[];
  readonly onChoose: (company: SearchableCompany) => void;
  readonly onRetry: () => void;
  readonly onOpenDatabase: () => void;
}

function SearchResults({
  hits,
  selected,
  query,
  hasCompanies,
  connectionFailed,
  names,
  onChoose,
  onRetry,
  onOpenDatabase,
}: SearchResultsProps) {
  if (connectionFailed) {
    return (
      <div className={styles.empty}>
        No se pudo conectar para traer tus empresas.
        <br />
        <Button variant="soft-neutral" size="xs" onClick={onRetry}>
          ↻ Reintentar
        </Button>
      </div>
    );
  }
  if (!hasCompanies) {
    return (
      <div className={styles.empty}>
        Todavía no cargaste empresas.
        <br />
        Subí un Excel o cargálas a mano desde <strong>tu nombre → Base de datos</strong>.
        <br />
        <Button variant="soft-neutral" size="xs" onClick={onOpenDatabase}>
          ↑ Cargar mis empresas
        </Button>
      </div>
    );
  }
  if (hits.length === 0) return <div className={styles.empty}>Sin resultados para "{query}".</div>;
  return hits.map((company, index) => (
    <CompanyOption
      key={keyOfOption(company, index)}
      company={company}
      on={index === selected}
      names={names}
      onChoose={() => {
        onChoose(company);
      }}
    />
  ));
}

interface SearchPopupProps {
  readonly anchor: RefObject<HTMLElement | null>;
  readonly onChoose: (company: SearchableCompany) => void;
  readonly onClose: () => void;
  readonly onOpenDatabase: () => void;
}

/** The magnifying glass: it opens showing all of them and filters inside. */
function CompanySearchPopup({ anchor, onChoose, onClose, onOpenDatabase }: SearchPopupProps) {
  const { rows, loading, failed, reload } = useCompanies();
  const { rows: borrowed, refreshIfOld } = useSubstituteCompanies();
  const searchable = useSearchableCompanies();
  const { cashbackNames } = useRegistryContext();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const popup = useRef<HTMLDivElement>(null);
  const opened = useRef(false);
  const queryField = useRef<HTMLInputElement>(null);
  const hits = useMemo(() => searchCompanies(query, searchable, SEARCH_LIMIT), [query, searchable]);

  useLayoutEffect(() => {
    const box = anchor.current?.getBoundingClientRect();
    const width = popup.current?.offsetWidth ?? 0;
    if (!box) return;
    setPosition({
      top: Math.min(box.bottom + POPUP_GAP, window.innerHeight - POPUP_BOTTOM),
      left: Math.max(
        POPUP_EDGE,
        Math.min(box.right - width, window.innerWidth - width - POPUP_EDGE),
      ),
    });
  }, [anchor]);

  useEffect(() => {
    // On opening: a failure is tried again, and the list of a substitute may be old.
    if (opened.current) return;
    opened.current = true;
    // The magnifying glass is for writing in it at once.
    queryField.current?.focus();
    if (failed) void reload();
    void refreshIfOld();
  }, [failed, refreshIfOld, reload]);

  useEffect(() => {
    const outside = ({ target }: MouseEvent) => {
      if (!(target instanceof Node)) return;
      if (!popup.current?.contains(target) && !anchor.current?.contains(target)) onClose();
    };
    document.addEventListener("click", outside);
    return () => {
      document.removeEventListener("click", outside);
    };
  }, [anchor, onClose]);

  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") onClose();
    else if (event.key === "Enter") {
      event.preventDefault();
      const company = hits[selected];
      if (company) onChoose(company);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setSelected((current) => Math.max(0, Math.min(hits.length - 1, current + step)));
    }
  };
  return createPortal(
    <section
      ref={popup}
      className={styles.popup}
      data-testid="company-search"
      style={position}
      aria-label="Mis empresas"
    >
      <div className={styles.head}>
        <span>Mis empresas</span>
        <button
          type="button"
          className={styles.manage}
          title="Subir Excel, editar en línea o descargar tus empresas"
          onClick={onOpenDatabase}
        >
          ✎ Administrar
        </button>
        <button type="button" className={styles.close} aria-label="Cerrar" onClick={onClose}>
          ✕
        </button>
      </div>
      <input
        ref={queryField}
        type="text"
        className={styles.query}
        data-testid="company-search-query"
        placeholder="Razón social o CUIT..."
        aria-label="Razón social o CUIT"
        autoComplete="off"
        value={query}
        onChange={({ target }) => {
          setQuery(target.value);
          setSelected(0);
        }}
        onKeyDown={onKey}
      />
      <div className={styles.list} data-testid="company-search-list">
        {loading ? (
          <div className={styles.empty}>Cargando tus empresas...</div>
        ) : (
          <SearchResults
            hits={hits}
            selected={selected}
            query={query}
            hasCompanies={rows.length > 0 || borrowed.length > 0}
            connectionFailed={failed && rows.length === 0}
            names={cashbackNames}
            onChoose={onChoose}
            onRetry={() => void reload()}
            onOpenDatabase={onOpenDatabase}
          />
        )}
      </div>
    </section>,
    document.body,
  );
}

function suggestionQuery(text: string): string | null {
  const clean = text.trim();
  if (!clean) return null;
  return clean.length < MIN_LETTERS && digitsOf(clean).length < MIN_TAX_ID_DIGITS ? null : clean;
}

function useAnchoredBelow(input: RefObject<HTMLElement | null>, open: boolean) {
  const [box, setBox] = useState({ top: 0, left: 0, width: 0 });
  useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const rect = input.current?.getBoundingClientRect();
      if (rect) setBox({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [input, open]);
  return box;
}

type InputProps = Omit<ComponentProps<typeof Input>, "value" | "onChange" | "ref">;

export interface CompanyFieldProps extends InputProps {
  readonly value: string;
  readonly onChange: (text: string) => void;
  /** The company chosen, from the list or from the suggestions. */
  readonly onChoose: (company: SearchableCompany) => void;
  /** The company in the form: with exactly its name, nothing is suggested. */
  readonly chosen?: SearchableCompany | null;
  /** The warning under the field, such as a company with no officers. */
  readonly note?: string;
  readonly onOpenDatabase: () => void;
}

/**
 * The company field of the flyer editor: while typing it says whether the company is already there,
 * and the magnifying glass is the whole search. Without the permission it is a plain field.
 */
export function CompanyField({
  value,
  onChange,
  onChoose,
  chosen = null,
  note = "",
  onOpenDatabase,
  onFocus,
  ...inputProps
}: CompanyFieldProps) {
  const { can } = usePermissions();
  const canSearch = can("padron_buscar");
  const { failed, reload, loading } = useCompanies();
  const queryClient = useQueryClient();
  const userId = useUserId();
  useEffect(
    () => registerProbe("companyList", () => companyListProbe(queryClient, userId)),
    [queryClient, userId],
  );
  const searchable = useSearchableCompanies();
  const { cashbackNames } = useRegistryContext();
  const [searching, setSearching] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [selected, setSelected] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const searchButton = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const lastRetry = useRef(0);

  const query = canSearch && suggesting && !loading ? suggestionQuery(value) : null;
  const sameAsChosen = chosen !== null && normalizeName(value) === normalizeName(chosen.empresa);
  const found = useMemo(
    () =>
      query === null || sameAsChosen ? [] : searchCompanies(query, searchable, MAX_SUGGESTIONS + 1),
    [query, sameAsChosen, searchable],
  );
  const suggestions = found.slice(0, MAX_SUGGESTIONS);
  const open = suggestions.length > 0;
  const box = useAnchoredBelow(input, open);

  useEffect(() => {
    if (!open) return undefined;
    const outside = ({ target }: MouseEvent) => {
      if (target instanceof Node && !popup.current?.contains(target) && target !== input.current) {
        setSuggesting(false);
      }
    };
    document.addEventListener("click", outside);
    return () => {
      document.removeEventListener("click", outside);
    };
  }, [open]);

  const retryQuietly = useCallback(() => {
    if (!failed || Date.now() - lastRetry.current < QUIET_RETRY_MS) return;
    lastRetry.current = Date.now();
    void reload();
  }, [failed, reload]);

  const choose = (company: SearchableCompany) => {
    setSuggesting(false);
    setSearching(false);
    onChoose(company);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (event.key === "ArrowDown") setSuggesting(true);
      return;
    }
    if (event.key === "Escape") setSuggesting(false);
    else if (event.key === "Enter") {
      event.preventDefault();
      const company = suggestions[selected];
      if (company) choose(company);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setSelected((current) => Math.max(0, Math.min(suggestions.length - 1, current + step)));
    }
  };

  if (!canSearch) {
    return (
      <Input
        {...inputProps}
        value={value}
        onFocus={onFocus}
        onChange={({ target }) => {
          onChange(target.value);
        }}
      />
    );
  }

  return (
    <>
      <div className={styles.wrap}>
        <Input
          {...inputProps}
          ref={input}
          autoComplete="off"
          data-testid="company-name"
          value={value}
          onChange={({ target }) => {
            onChange(target.value);
            setSuggesting(true);
            setSelected(0);
            if (target.value.trim()) retryQuietly();
          }}
          onKeyDown={onKeyDown}
          onFocus={(event) => {
            onFocus?.(event);
            if (event.target.value.trim()) setSuggesting(true);
          }}
        />
        <button
          ref={searchButton}
          type="button"
          className={styles.searchButton}
          data-testid="company-search-button"
          title="Buscar en mis empresas (razón social o CUIT)"
          aria-label="Buscar en mis empresas (razón social o CUIT)"
          onClick={() => {
            setSearching((current) => !current);
          }}
        >
          🔍
        </button>
      </div>
      {note && (
        <div className={styles.note} data-testid="company-note">
          ⚠ {note}
        </div>
      )}
      {searching && (
        <CompanySearchPopup
          anchor={searchButton}
          onChoose={choose}
          onClose={() => {
            setSearching(false);
          }}
          onOpenDatabase={() => {
            setSearching(false);
            onOpenDatabase();
          }}
        />
      )}
      {open &&
        createPortal(
          <div
            ref={popup}
            className={`${styles.popup} ${styles.suggestions}`}
            data-testid="company-suggestions"
            style={box}
          >
            <div className={styles.list}>
              {suggestions.map((company, index) => (
                <CompanyOption
                  key={keyOfOption(company, index)}
                  company={company}
                  on={index === selected}
                  names={cashbackNames}
                  onChoose={() => {
                    choose(company);
                  }}
                />
              ))}
            </div>
            {found.length > MAX_SUGGESTIONS && (
              <div className={styles.more}>
                Hay más coincidencias — abrí la lupa para verlas todas
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
