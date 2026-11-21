// PostgREST query language: eq, neq, gt, gte, lt, lte, is, in, not.<op> and or=(and(...),...).
import { type Row } from "./state.ts";

export const NON_FILTER_PARAMS: ReadonlySet<string> = new Set([
  "select",
  "order",
  "limit",
  "offset",
  "on_conflict",
  "columns",
]);

type Predicate = (row: Row) => boolean;

function literal(raw: string): string | boolean | null {
  const known: Record<string, boolean | null> = { null: null, true: true, false: false };
  return raw in known ? (known[raw] ?? null) : raw;
}

/** What a value looks like inside a query, where everything is text. */
function cellText(value: unknown): string {
  if (typeof value === "string") return value;
  return value === undefined ? "undefined" : JSON.stringify(value);
}

function inPredicate(column: string, raw: string): Predicate {
  const list = new Set(
    raw
      .replace(/^\(|\)$/g, "")
      .split(",")
      .map((item) => item.replace(/^"|"$/g, "")),
  );
  return (row) => list.has(cellText(row[column]));
}

function isPredicate(column: string, raw: string): Predicate {
  const value = literal(raw);
  return (row) => (value === null ? row[column] == null : row[column] === value);
}

function comparison(op: string, actual: string, expected: string): boolean {
  const comparisons: Record<string, boolean> = {
    gte: actual >= expected,
    lte: actual <= expected,
    gt: actual > expected,
    lt: actual < expected,
  };
  return comparisons[op] ?? true;
}

function valuePredicate(column: string, op: string, raw: string): Predicate {
  const value = literal(raw);
  return (row) => {
    const actual = row[column];
    if (op === "eq") {
      return typeof value === "boolean" ? actual === value : cellText(actual) === cellText(value);
    }
    if (op === "neq") return cellText(actual) !== cellText(value);
    if (actual == null) return false;
    return comparison(op, cellText(actual), cellText(value));
  };
}

function condition(column: string, rawExpression: string): Predicate {
  const negated = rawExpression.startsWith("not.");
  const expression = negated ? rawExpression.slice(4) : rawExpression;
  const dot = expression.indexOf(".");
  const op = expression.slice(0, dot);
  const raw = expression.slice(dot + 1);
  const builders: Record<string, () => Predicate> = {
    in: () => inPredicate(column, raw),
    is: () => isPredicate(column, raw),
  };
  const predicate = builders[op]?.() ?? valuePredicate(column, op, raw);
  return negated ? (row) => !predicate(row) : predicate;
}

export function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of text) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current) parts.push(current);
  return parts;
}

function group(kind: string, body: string): Predicate {
  const predicates = splitTopLevel(body).map((term) => {
    const nested = /^(and|or)\((.*)\)$/.exec(term);
    if (nested) return group(nested[1] ?? "", nested[2] ?? "");
    const dot = term.indexOf(".");
    return condition(term.slice(0, dot), term.slice(dot + 1));
  });
  return kind === "and"
    ? (row) => predicates.every((predicate) => predicate(row))
    : (row) => predicates.some((predicate) => predicate(row));
}

function compareBy(keys: readonly (readonly [string, number])[]) {
  return (a: Row, b: Row): number => {
    for (const [column, direction] of keys) {
      const x = a[column] == null ? "" : cellText(a[column]);
      const y = b[column] == null ? "" : cellText(b[column]);
      if (x !== y) return x < y ? -direction : direction;
    }
    return 0;
  };
}

export function filterRows<T extends object>(rows: readonly T[], query: URLSearchParams): T[] {
  const predicates: Predicate[] = [];
  for (const [key, value] of query.entries()) {
    if (NON_FILTER_PARAMS.has(key)) continue;
    predicates.push(
      key === "or" ? group("or", value.replace(/^\(|\)$/g, "")) : condition(key, value),
    );
  }
  const kept = rows.filter((row) => predicates.every((predicate) => predicate(row as Row)));
  const order = query.get("order");
  if (!order) return kept;
  const keys = order.split(",").map((term) => {
    const [column = "", direction] = term.split(".");
    return [column, direction === "desc" ? -1 : 1] as const;
  });
  return kept.toSorted((a, b) => compareBy(keys)(a as Row, b as Row));
}

/** Plain column list; a column the row does not have comes back as null. */
export function selectColumns(row: object, select: string | null): Row {
  if (!select || select === "*") return { ...row };
  const source = row as Row;
  const projected: Row = {};
  for (const rawKey of select.split(",")) {
    const key = rawKey.trim();
    projected[key] = key in source ? source[key] : null;
  }
  return projected;
}
