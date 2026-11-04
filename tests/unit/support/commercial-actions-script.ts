import { readFileSync } from "node:fs";
import { type Context, createContext, runInContext } from "node:vm";
import { restartClock } from "../../e2e/support/clock.ts";

export interface FakeElement {
  id: string;
  innerHTML: string;
  value: string;
  textContent: string;
  hidden: boolean;
  disabled: boolean;
  style: Record<string, string>;
}

export type Row = Record<string, unknown>;
export type RpcHandler = (args: Record<string, unknown>) => unknown;

export interface Person {
  nombre: string;
  rol: string;
  lider_id?: string;
}

export interface QueryResult {
  data?: unknown;
  error?: { message: string };
}

export type QueryAnswer = () => QueryResult | Promise<QueryResult>;
export type QueryStep = (...args: never[]) => void;
export type QueryFactory = () => PromiseLike<QueryResult>;

/** The state of the module the tests read or prepare. */
export interface ModuleState {
  tab: string | null;
  det: string | null;
  detPros: Row[];
  personas: Record<string, Person>;
  tablero: unknown;
  ag: AgendaState;
}

export interface AgendaState {
  ver: string | null;
  lunes: string;
  mes: string;
  dia: string | null;
  data: Row[] | null;
  dataL?: string;
  ocup: unknown;
  hun: string;
  turno: number;
}

/** gestiones.js as the tests see it. Its names are the file's own: this is what they test. */
export interface CommercialActionsScript extends Context {
  GES: ModuleState;
  GES_PAQ: Record<string, string>;
  GES_TIPO: Record<string, string>;
  GES_MOTIVO: Record<string, string>;
  gesModal(html: string): void;
  gesCerrar(): void;
  gesPersonas(): Promise<unknown>;
  gesPaqDe(text: string): string | null;
  gesPasteParse(text: string): Row[];
  gesTableroPintar(): void;
  gesHorarioDe(text: string): (string | null)[] | null;
  gesFechaDe(text: string): string | null;
  gesSePisan(a: Row, b: Row): boolean;
  gesHorError(action: Row): string | null;
  gesHorario(action: Row): string;
  gesLunes(date: string): string;
  gesAgenda(): void;
  gesAgPintar(): void;
  gesChoque(hunter: string, action: Row, ignore?: string): Promise<boolean>;
  gesAgendar(hunterIndex?: number, date?: string): void;
  gesAgendarOk(): void;
  gesAgPasteParse(text: string): Row[];
  gesAgPasteRevisar(): void;
  gesAgPasteOk(): void;
  gesCuilORef(text: string): Row;
  gesCuitTxt(value: string | string[] | null): string;
  gesPersonasParse(text: string, hasHeader: boolean, existing: Row[]): Row[];
  gesAsigError(action: Row): string | null;
  gesPuedeReasignar(action: Row): boolean;
  gesPuedeForzar(hunter: string): boolean;
  gesPuedeAlLider(): boolean;
  gesLideresOpts(): string;
  gesLibres(date: string, from: string, to: string, hunter: string): Promise<string[]>;
  gesConSin(rows: Row[]): Row;
  gesPaqTxt(packages: Record<string, number>): string;
  gesPaqResumen(rows: Row[]): string;
  gesErrTxt(error: { message: string }): string;
  gesEvTxt(event: Row): string;
  gesCrearSerie(action: Row, done: (created: number, failed: Row[]) => void): void;
  gesAgRangoAct(): { desde: string; hasta: string };
  gesMesSumar(month: string, by: number): string;
  gesAgTitulo(days: string[]): string;
  gesDias(from: string | null, to: string): number;
  gesAgPideOcup(): boolean;
  gesHorRango(rows: Row[]): number[];
  gesHorColumnas(rows: Row[]): { n: number; col: number }[];
  gesHorHHMM(minutes: number): string;
  gesHorEtiqueta(hour: number): string;
  gesHorCol(
    date: string,
    rows: Row[],
    from: number,
    to: number,
    onOpen: null,
    onClick: null,
    readOnly?: boolean,
  ): string;
  gesAgCargar(): Promise<Row[] | null>;
  gesAgOcupado(row: Row): string;
}

export interface ScriptHarness {
  script: CommercialActionsScript;
  /** Creates the element the script will find under that id, and optionally sets its value. */
  element(id: string, value?: string): FakeElement;
  rpc: Record<string, RpcHandler>;
  confirmations: string[];
  toasts: string[];
  /** Plays a signed-in user. */
  signInAs(role: string, id: string, admin?: boolean): void;
  /** Rows a query to any table answers with. */
  setTableRows(rows: Row[]): void;
  /** What the script inserted: each entry is the body of one insert. */
  inserted: unknown[];
  /** Replaces the simulated table for the queries from now on. */
  answerQueriesWith(factory: QueryFactory): void;
  /** Which hunters the agenda grid offers. */
  offerHunters(hunters: string[]): void;
  /** The company chosen in the window that assigns from the grid. */
  chooseCompany(company: Row): void;
  /** The rows of the agenda pasted from Excel, as they were reviewed. */
  pastedAgenda(): Row[];
}

const SOURCE_URL = new URL("../../../gestiones.js", import.meta.url);

function normalize(value: unknown): string {
  return (typeof value === "string" ? value : "")
    .normalize("NFD")
    .replaceAll(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replaceAll(/\s+/g, " ")
    .trim();
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function isScript(context: Context): context is CommercialActionsScript {
  return "GES" in context && typeof Reflect.get(context, "gesPaqDe") === "function";
}

/**
 * A query as gestiones.js uses it: each step returns the query and awaiting it answers. The
 * answer is asked for after the steps, since all of them run before the first await.
 */
export function chainableQuery(
  answer: QueryAnswer,
  steps: Readonly<Record<string, QueryStep>>,
): PromiseLike<QueryResult> {
  const query = Promise.resolve().then(answer);
  for (const [name, effect] of Object.entries(steps)) {
    const step = (...args: never[]) => {
      effect(...args);
      return query;
    };
    Reflect.defineProperty(query, name, { value: step });
  }
  return query;
}

/** The steps a test does not care about: they only keep the chain going. */
export function passingSteps(...names: readonly string[]): Record<string, QueryStep> {
  return Object.fromEntries(names.map((name) => [name, () => undefined]));
}

interface TableBackend {
  rows(): Row[];
  inserted: unknown[];
}

function isRow(value: unknown): value is Row {
  return typeof value === "object" && value !== null;
}

function insertedResult(body: unknown): QueryResult {
  if (Array.isArray(body)) {
    return {
      data: body.filter(isRow).map((row, index) => Object.assign({ id: `n${String(index)}` }, row)),
    };
  }
  return { data: { id: "n0", ...(isRow(body) ? body : {}) } };
}

/** A minimal table: filters what setTableRows gave it and records what it is asked to insert. */
function simulatedQuery(backend: TableBackend): PromiseLike<QueryResult> {
  const filters: ((row: Row) => boolean)[] = [];
  let body: unknown;
  const filtering =
    (test: (value: unknown, expected: unknown) => boolean) =>
    (column: string, expected: unknown) => {
      filters.push((row) => test(row[column], expected));
    };
  const answer = (): QueryResult =>
    body === undefined
      ? { data: backend.rows().filter((row) => filters.every((keep) => keep(row))) }
      : insertedResult(body);
  return chainableQuery(answer, {
    ...passingSteps("select", "order", "limit", "single", "maybeSingle"),
    gte: filtering((value, expected) => String(value) >= String(expected)),
    lte: filtering((value, expected) => String(value) <= String(expected)),
    eq: filtering((value, expected) => value === expected),
    in: filtering((value, expected) => Array.isArray(expected) && expected.includes(value)),
    is: filtering((value, expected) => (value == null) === (expected === null)),
    not: (column: string, operator: string, expected: unknown) => {
      filters.push((row) => !(operator === "is" && (row[column] == null) === (expected === null)));
    },
    insert: (row: unknown) => {
      body = row;
      backend.inserted.push(row);
    },
  });
}

/** Runs the real gestiones.js in Node with only what it needs from auth.js and the browser. */
export function loadCommercialActionsScript(): ScriptHarness {
  restartClock();
  const elements = new Map<string, FakeElement>();
  const rpc: Record<string, RpcHandler> = {};
  const confirmations: string[] = [];
  const toasts: string[] = [];
  const inserted: unknown[] = [];
  let tableRows: Row[] = [];
  const backend: TableBackend = { rows: () => tableRows, inserted };
  const database = {
    rpc: (name: string, args: Record<string, unknown>) =>
      Promise.resolve({ data: rpc[name]?.(args) ?? [] }),
    from: (): PromiseLike<QueryResult> => simulatedQuery(backend),
  };
  const sandbox: Context = {
    console,
    Promise,
    Object,
    Math,
    JSON,
    Date,
    String,
    Number,
    Array,
    isFinite,
    parseFloat,
    parseInt,
    setTimeout,
    clearTimeout,
    localStorage: { getItem: () => null, setItem: () => undefined },
    document: {
      getElementById: (id: string) => elements.get(id) ?? null,
      createElement: () => ({}),
      head: { appendChild: () => undefined },
      querySelector: () => null,
    },
    _padNorm: normalize,
    _escHtml: escapeHtml,
    _escAttr: (value: unknown) => String(value).replaceAll('"', "&quot;"),
    _rol: "hunter",
    _rolVigente: () => Reflect.get(sandbox, "_rol"),
    _admin: false,
    _esPrueba: false,
    _me: { id: "h1" },
    _sb: database,
    fgConfirm: (message: string) => {
      confirmations.push(message);
      return Promise.resolve(true);
    },
    showToast: (message: string) => {
      toasts.push(message);
    },
  };
  const context = createContext(sandbox);
  runInContext(readFileSync(SOURCE_URL, "utf8"), context, { filename: "gestiones.js" });
  if (!isScript(context)) throw new Error("gestiones.js no longer defines its module state");
  const script = context;
  return {
    script,
    rpc,
    confirmations,
    toasts,
    inserted,
    element: (id, value) => {
      const found = elements.get(id) ?? {
        id,
        innerHTML: "",
        value: "",
        textContent: "",
        hidden: false,
        disabled: false,
        style: {},
      };
      elements.set(id, found);
      if (value !== undefined) found.value = value;
      return found;
    },
    signInAs: (role, id, admin = false) => {
      Reflect.set(script, "_rol", role);
      Reflect.set(script, "_me", { id });
      Reflect.set(script, "_admin", admin);
    },
    setTableRows: (rows) => {
      tableRows = rows;
    },
    answerQueriesWith: (factory) => {
      database.from = factory;
    },
    offerHunters: (hunters) => {
      Reflect.set(script.GES, "_agHun", hunters);
    },
    chooseCompany: (company) => {
      Reflect.set(script.GES, "_agEmp", company);
    },
    pastedAgenda: () => {
      const rows: unknown = Reflect.get(script.GES, "_agPaste");
      return Array.isArray(rows) ? rows.filter(isRow) : [];
    },
  };
}

/** Lets what the script left pending finish. */
export function settle(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 30);
  });
}
