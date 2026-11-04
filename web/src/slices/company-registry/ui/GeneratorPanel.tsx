import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  cashbackIndex,
  cashbackName,
  type Company,
  companyCategoryLabel,
  type DestinationRules,
  destinationLabel,
  destinationOf,
  destinationWarnings,
  officersLabel,
  searchCompanies,
  taxIdsLine,
} from "@/shared/domain/company-registry/index.ts";
import { optionTab } from "@/shared/domain/flyer-options.ts";
import {
  type FlyerFileFormat,
  type GenerationProgress,
  useFlyerGeneration,
} from "@/shared/lib/company-registry/flyer-generation-port.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { Button, Input, ProgressBar, Select } from "@/shared/ui/index.ts";
import { useCompanies } from "../model/use-companies.ts";
import { useDestinationRules } from "../model/registry-rules.ts";
import { SEPARATOR } from "./separator.ts";
import styles from "./DatabaseWindow.module.css";

const WAIT_FROM_ROWS = 400;
const WAIT_MS = 150;
const ALL = 100_000;
const NOT_READY = "Generar el ZIP llega con el armador nuevo.";
const NOTHING_TICKED: ReadonlySet<number> = new Set();

function GeneratorRowView({
  company,
  row,
  rules,
  ticked,
  onTick,
}: {
  readonly company: Company;
  readonly row: number;
  readonly rules: DestinationRules;
  readonly ticked: boolean;
  readonly onTick: (row: number, on: boolean) => void;
}) {
  const option = destinationOf(company, rules);
  const warnings = destinationWarnings(company, option, rules);
  const category = companyCategoryLabel(company, rules.options);
  const { cashbackNames } = rules;
  const kind = option > 0 ? optionTab(rules.options, option) : "none";
  return (
    <label className={styles.generatorRow} data-testid="generator-row" data-row={row}>
      <input
        type="checkbox"
        className={styles.generatorTick}
        checked={ticked}
        disabled={option <= 0}
        onChange={({ target }) => {
          onTick(row, target.checked);
        }}
      />
      <div className={styles.companyMain}>
        <div className={styles.companyName} data-testid="generator-name">
          {company.empresa || "(sin razón social)"}
        </div>
        <div className={styles.companyTaxIds}>
          {taxIdsLine(company) || "sin CUIT"}
          {SEPARATOR}
          {cashbackName(cashbackIndex(company.config, cashbackNames), cashbackNames)}
          {SEPARATOR}
          {officersLabel(company)}
          {category && (
            <>
              {SEPARATOR}
              <span className={styles.category}>{category}</span>
            </>
          )}
        </div>
        {warnings.length > 0 && (
          <div className={styles.generatorWarning}>⚠ {warnings.join(" · ")}</div>
        )}
      </div>
      <span
        className={styles.generatorFormat}
        data-kind={kind === "rubros" || kind === "none" ? kind : "flyer"}
      >
        {destinationLabel(option, rules)}
      </span>
    </label>
  );
}

/** Ticking one draws only that one: with 3.000 companies the whole list took 43 ms each time. */
const GeneratorRow = memo(GeneratorRowView);

function counterText(
  ticked: number,
  total: number,
  query: string,
  shown: number,
  shownTicked: number,
) {
  const filtered = query
    ? ` · mostrando ${String(shown)} (${String(shownTicked)} tildada${shownTicked === 1 ? "" : "s"})`
    : "";
  return `de ${String(total)} empresa${total === 1 ? "" : "s"} seleccionada${ticked === 1 ? "" : "s"}${filtered}`;
}

function Connection({ onRetry }: { readonly onRetry: () => void }) {
  return (
    <div data-testid="generator">
      <p className={styles.nothing}>No se pudo conectar para traer tus empresas.</p>
      <Button variant="soft-neutral" size="xs" onClick={onRetry}>
        ↻ Reintentar
      </Button>
    </div>
  );
}

/** The ticks belong to a reading of the list: when the list is read again they do not count. */
function useTicks(rows: readonly Company[]) {
  const [ticks, setTicks] = useState({ rows, picked: NOTHING_TICKED });
  const picked = ticks.rows === rows ? ticks.picked : NOTHING_TICKED;
  const change = useCallback(
    (update: (before: ReadonlySet<number>) => ReadonlySet<number>) => {
      setTicks((before) => ({
        rows,
        picked: update(before.rows === rows ? before.picked : NOTHING_TICKED),
      }));
    },
    [rows],
  );
  return { picked, change };
}

/** Tick the companies and generate the ZIP, each flyer in its own format. */
export function GeneratorPanel() {
  const { rows, loading, failed, reload } = useCompanies();
  const rules = useDestinationRules();
  const generation = useFlyerGeneration();
  const { show } = useToast();
  const { picked, change } = useTicks(rows);
  const [written, setWritten] = useState("");
  const [query, setQuery] = useState("");
  const [format, setFormat] = useState<FlyerFileFormat>("pdf");
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  const positions = useMemo(() => {
    const places = new Map(rows.map((company, position) => [company, position]));
    return searchCompanies(query, rows, ALL).map((company) => places.get(company) ?? -1);
  }, [query, rows]);
  const onTick = useCallback(
    (row: number, on: boolean) => {
      change((before) => {
        const next = new Set(before);
        if (on) next.add(row);
        else next.delete(row);
        return next;
      });
    },
    [change],
  );

  if (failed && rows.length === 0) return <Connection onRetry={() => void reload()} />;
  if (loading) return <p className={styles.nothing}>Cargando tus empresas...</p>;
  if (rows.length === 0) {
    return (
      <div data-testid="generator">
        <p className={styles.nothing}>Todavía no cargaste empresas.</p>
      </div>
    );
  }

  const filter = (text: string) => {
    setWritten(text);
    clearTimeout(timer.current);
    if (rows.length < WAIT_FROM_ROWS) setQuery(text);
    else {
      timer.current = setTimeout(() => {
        setQuery(text);
      }, WAIT_MS);
    }
  };
  const tickAll = (on: boolean) => {
    change((before) => {
      const next = new Set(before);
      for (const position of positions) {
        const company = rows[position];
        if (on && company && destinationOf(company, rules) > 0) next.add(position);
        else if (!on) next.delete(position);
      }
      return next;
    });
  };
  const generate = async () => {
    const companies = [...picked].flatMap((position) => rows[position] ?? []);
    if (companies.length === 0) {
      show("Tildá al menos una empresa");
      return;
    }
    if (!generation) {
      show(NOT_READY);
      return;
    }
    await generation.generate({ companies, format, onProgress: setProgress });
  };
  const shownTicked = positions.filter((position) => picked.has(position)).length;

  return (
    <div data-testid="generator">
      <p className={styles.generatorLead}>
        Tildá las empresas (o «Todas») y generá el ZIP: cada flyer sale en{" "}
        <strong>su formato</strong> según el rubro que tenga cargado, con sus oficiales, cashback y
        topes. Al lado de cada empresa ves con qué formato va a salir.
      </p>
      <div className={styles.generatorTools}>
        <Input
          className={styles.generatorFilter}
          placeholder="Filtrar por razón social o CUIT..."
          autoComplete="off"
          value={written}
          onChange={({ target }) => {
            filter(target.value);
          }}
        />
        <Button
          variant="soft-neutral"
          size="xs"
          onClick={() => {
            tickAll(true);
          }}
        >
          Todas
        </Button>
        <Button
          variant="soft-neutral"
          size="xs"
          onClick={() => {
            tickAll(false);
          }}
        >
          Ninguna
        </Button>
        <Select
          appearance="native"
          aria-label="Formato de los archivos"
          className={styles.generatorFormatSelect}
          value={format}
          onChange={({ target }) => {
            setFormat(target.value === "png" ? "png" : "pdf");
          }}
        >
          <option value="pdf">PDF</option>
          <option value="png">PNG</option>
        </Select>
        <Button
          size="sm"
          disabled={progress !== null && generation?.isGenerating() === true}
          onClick={() => void generate()}
        >
          ⚡ Generar ZIP
        </Button>
      </div>
      <div className={styles.generatorCount} data-testid="generator-count">
        <strong>{picked.size}</strong>{" "}
        {counterText(picked.size, rows.length, query, positions.length, shownTicked)}
      </div>
      {progress && (
        <div className={styles.generatorProgress}>
          <ProgressBar value={progress.percent} label={progress.text} />
          <div className={styles.generatorProgressText}>{progress.text}</div>
        </div>
      )}
      <div>
        {positions.length === 0 && <p className={styles.nothing}>Sin resultados para "{query}".</p>}
        {positions.map((position) => {
          const company = rows[position];
          return company ? (
            <GeneratorRow
              key={position}
              company={company}
              row={position}
              rules={rules}
              ticked={picked.has(position)}
              onTick={onTick}
            />
          ) : null;
        })}
      </div>
    </div>
  );
}
