// Writes web/src/shared/supabase/database.types.ts from supabase/migrations/*.sql, without
// asking the database: `node scripts/generate-database-types.ts`.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { argv } from "node:process";

export const MIGRATIONS_DIR = "supabase/migrations";
export const OUTPUT_FILE = "web/src/shared/supabase/database.types.ts";

export interface ColumnModel {
  readonly name: string;
  readonly sqlType: string;
  readonly nullable: boolean;
  readonly hasDefault: boolean;
}

export interface ArgumentModel {
  readonly name: string;
  readonly sqlType: string;
  readonly hasDefault: boolean;
}

export interface DatabaseModel {
  readonly tables: Map<string, Map<string, ColumnModel>>;
  /** Each function with its overloads: the same name with other argument types is another one. */
  readonly functions: Map<string, ArgumentModel[][]>;
}

/**
 * Two tables were created by hand in the Supabase panel before migration 001, so no migration says
 * they exist. Their columns come from what the app and auth-admin read and write, and all of them
 * except the keys count as nullable because nothing here knows better. The columns that migrations
 * do add (facultades, es_prueba...) are not repeated.
 */
export const TABLES_WITHOUT_MIGRATION: Readonly<Record<string, readonly (readonly string[])[]>> = {
  profiles: [
    ["id", "uuid", "key"],
    ["role", "text"],
    ["status", "text"],
    ["full_name", "text"],
    ["email", "text"],
    ["nombre_asesor", "text"],
    ["celular_asesor", "text"],
    ["email_asesor", "text"],
    ["last_login", "timestamptz"],
  ],
  flyer_logs: [
    ["id", "uuid", "key"],
    ["user_id", "uuid"],
    ["created_at", "timestamptz"],
    ["empresa", "text"],
    ["config_name", "text"],
    ["flyer_type", "text"],
    ["format", "text"],
    ["is_bulk", "boolean"],
    ["bulk_count", "int"],
  ],
};

const TABLE_LEVEL = /^(?:constraint|primary|unique|check|foreign|exclude|like)\b/i;
const COLUMN_ATTRIBUTE =
  /\s+(?:not\s+null|null|default|primary|unique|references|check|generated|constraint|collate)\b/i;
const CREATE_TABLE = /^create\s+table\s+(?:if\s+not\s+exists\s+)?(?:(\w+)\.)?(\w+)\s*\(/i;
const ALTER_TABLE = /\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:(\w+)\.)?(\w+)\s+/i;
const DROP_TABLE = /^drop\s+table\s+(?:if\s+exists\s+)?(?:(\w+)\.)?(\w+)/i;
const CREATE_FUNCTION = /^create\s+(?:or\s+replace\s+)?function\s+(?:(\w+)\.)?(\w+)\s*\(/i;
const DROP_FUNCTION = /^drop\s+function\s+(?:if\s+exists\s+)?(?:(\w+)\.)?(\w+)\s*(\()?/i;
const TRIGGER_RETURN = /^\s*returns\s+(?:event_)?trigger\b/i;

const TS_TYPES: Readonly<Record<string, string>> = {
  text: "string",
  varchar: "string",
  char: "string",
  uuid: "string",
  date: "string",
  time: "string",
  timestamp: "string",
  timestamptz: "string",
  interval: "string",
  inet: "string",
  smallint: "number",
  int: "number",
  bigint: "number",
  numeric: "number",
  real: "number",
  serial: "number",
  bigserial: "number",
  boolean: "boolean",
  json: "Json",
  jsonb: "Json",
};

const TYPE_ALIASES: Readonly<Record<string, string>> = {
  integer: "int",
  int2: "smallint",
  int4: "int",
  int8: "bigint",
  bool: "boolean",
  decimal: "numeric",
  "character varying": "varchar",
  "timestamp with time zone": "timestamptz",
  "timestamp without time zone": "timestamp",
  "time without time zone": "time",
  "double precision": "real",
};

function normalizeType(raw: string): string {
  const isArray = /\[\s*\]\s*$/.test(raw);
  const base = raw
    .replace(/\[\s*\]\s*$/, "")
    .replace(/\(.*\)/, "")
    .replace(/\bpublic\./i, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
  return `${TYPE_ALIASES[base] ?? base}${isArray ? "[]" : ""}`;
}

/** Where the comment, string or dollar-quoted body that starts at `index` ends, if one does. */
function quotedEnd(sql: string, index: number): number | null {
  const char = sql[index];
  if (char === "'" || char === '"') {
    let end = index + 1;
    while (end < sql.length) {
      if (sql[end] === char && sql[end + 1] === char) end += 2;
      else if (sql[end] === char) return end + 1;
      else end += 1;
    }
    return sql.length;
  }
  if (char !== "$") return null;
  const tag = /^\$\w*\$/.exec(sql.slice(index, index + 64))?.[0];
  if (!tag) return null;
  const close = sql.indexOf(tag, index + tag.length);
  return close < 0 ? sql.length : close + tag.length;
}

function commentEnd(sql: string, index: number): number | null {
  if (sql.startsWith("--", index)) {
    const newline = sql.indexOf("\n", index);
    return newline < 0 ? sql.length : newline;
  }
  if (sql.startsWith("/*", index)) {
    const close = sql.indexOf("*/", index);
    return close < 0 ? sql.length : close + 2;
  }
  return null;
}

/** Statements split on `;`, without comments and leaving strings and bodies whole. */
export function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let index = 0;
  while (index < sql.length) {
    const afterComment = commentEnd(sql, index);
    const afterQuoted = afterComment === null ? quotedEnd(sql, index) : null;
    if (afterComment !== null) {
      index = afterComment;
    } else if (afterQuoted !== null) {
      current += sql.slice(index, afterQuoted);
      index = afterQuoted;
    } else if (sql[index] === ";") {
      statements.push(current.trim());
      current = "";
      index += 1;
    } else {
      current += sql[index];
      index += 1;
    }
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

/** The text between the parenthesis at `open` and its pair, and what comes after it. */
function insideParentheses(text: string, open: number): { inside: string; rest: string } {
  let depth = 0;
  let index = open;
  while (index < text.length) {
    const afterQuoted = quotedEnd(text, index);
    if (afterQuoted !== null) {
      index = afterQuoted;
      continue;
    }
    if (text[index] === "(") depth += 1;
    if (text[index] === ")") depth -= 1;
    if (depth === 0) {
      return { inside: text.slice(open + 1, index), rest: text.slice(index + 1) };
    }
    index += 1;
  }
  return { inside: text.slice(open + 1), rest: "" };
}

function splitOnCommas(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  let index = 0;
  while (index < text.length) {
    const char = text[index] ?? "";
    const afterQuoted = quotedEnd(text, index);
    if (afterQuoted !== null) {
      current += text.slice(index, afterQuoted);
      index = afterQuoted;
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += char;
    }
    index += 1;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parseColumn(definition: string): ColumnModel | null {
  const match = /^"?(\w+)"?\s+(.+)$/s.exec(definition.trim());
  if (!match) return null;
  const [, name = "", rest = ""] = match;
  const attribute = COLUMN_ATTRIBUTE.exec(rest);
  const typeText = attribute ? rest.slice(0, attribute.index) : rest;
  const attributes = attribute ? rest.slice(attribute.index) : "";
  const sqlType = normalizeType(typeText);
  const isPrimary = /\bprimary\s+key\b/i.test(attributes);
  return {
    name,
    sqlType,
    nullable: !isPrimary && !/\bnot\s+null\b/i.test(attributes),
    hasDefault: /\b(?:default|generated)\b/i.test(attributes) || sqlType.endsWith("serial"),
  };
}

function schemaIsPublic(schema: string | undefined): boolean {
  return schema === undefined || schema.toLowerCase() === "public";
}

function markNotNull(table: Map<string, ColumnModel>, names: string): void {
  for (const raw of names.split(",")) {
    const name = raw.trim();
    const column = table.get(name);
    if (column) table.set(name, { ...column, nullable: false });
  }
}

function applyCreateTable(model: DatabaseModel, statement: string): boolean {
  const match = CREATE_TABLE.exec(statement);
  if (!match) return false;
  const [header, schema, name = ""] = match;
  if (!schemaIsPublic(schema) || model.tables.has(name)) return true;
  const table = new Map<string, ColumnModel>();
  const { inside } = insideParentheses(statement, header.length - 1);
  const items = splitOnCommas(inside);
  for (const item of items.filter((candidate) => !TABLE_LEVEL.test(candidate))) {
    const column = parseColumn(item);
    if (column) table.set(column.name, column);
  }
  for (const item of items) {
    const primary = /^(?:constraint\s+\w+\s+)?primary\s+key\s*\(([^)]*)\)/i.exec(item);
    if (primary) markNotNull(table, primary[1] ?? "");
  }
  model.tables.set(name, table);
  return true;
}

function alterColumn(table: Map<string, ColumnModel>, action: string): void {
  const match = /^alter\s+(?:column\s+)?(\w+)\s+(.*)$/is.exec(action);
  const column = table.get(match?.[1] ?? "");
  if (!match || !column) return;
  const change = match[2] ?? "";
  const nullability: Record<string, Partial<ColumnModel>> = {
    "drop not null": { nullable: true },
    "set not null": { nullable: false },
    "drop default": { hasDefault: false },
  };
  const known = nullability[change.trim().toLowerCase().replace(/\s+/g, " ")];
  const setsDefault = /^set\s+default\b/i.test(change) ? { hasDefault: true } : {};
  const type = /^(?:set\s+data\s+)?type\s+(.+?)(?:\s+using\b.*)?$/is.exec(change)?.[1];
  table.set(column.name, {
    ...column,
    ...known,
    ...setsDefault,
    ...(type === undefined ? {} : { sqlType: normalizeType(type) }),
  });
}

function renameColumn(table: Map<string, ColumnModel>, from: string, to: string): void {
  const column = table.get(from);
  if (!column) return;
  table.delete(from);
  table.set(to, { ...column, name: to });
}

function applyAlterAction(table: Map<string, ColumnModel>, action: string): void {
  const dropped = /^drop\s+(?:column\s+)?(?!constraint\b)(?:if\s+exists\s+)?(\w+)/i.exec(action);
  const renamed = /^rename\s+(?:column\s+)?(?!to\b)(\w+)\s+to\s+(\w+)/i.exec(action);
  const added =
    /^add\s+(?:column\s+)?(?!constraint\b|primary\b|unique\b|check\b|foreign\b|exclude\b)(?:if\s+not\s+exists\s+)?(.+)$/is.exec(
      action,
    );
  if (dropped) {
    table.delete(dropped[1] ?? "");
  } else if (renamed) {
    renameColumn(table, renamed[1] ?? "", renamed[2] ?? "");
  } else if (added) {
    const column = parseColumn(added[1] ?? "");
    if (column && !table.has(column.name)) table.set(column.name, column);
  } else {
    alterColumn(table, action);
  }
}

function applyAlterTable(model: DatabaseModel, statement: string): boolean {
  const match = ALTER_TABLE.exec(statement);
  if (!match) return false;
  const [header, schema, name = ""] = match;
  if (!schemaIsPublic(schema)) return true;
  const rest = statement.slice(match.index + header.length);
  const renamedTable = /^rename\s+to\s+(\w+)/i.exec(rest)?.[1];
  const table = model.tables.get(name) ?? new Map<string, ColumnModel>();
  if (renamedTable) {
    model.tables.delete(name);
    model.tables.set(renamedTable, table);
    return true;
  }
  for (const action of splitOnCommas(rest)) applyAlterAction(table, action);
  if (table.size > 0) model.tables.set(name, table);
  return true;
}

function parseArgument(definition: string): ArgumentModel | null {
  const text = definition.replace(/^(?:in|variadic)\s+/i, "").trim();
  if (/^(?:out|inout)\s/i.test(text)) return null;
  const match = /^(\w+)\s+(.+?)(?:\s+(default|=)\s+.*)?$/is.exec(text);
  if (!match) return null;
  return {
    name: match[1] ?? "",
    sqlType: normalizeType(match[2] ?? ""),
    hasDefault: match[3] !== undefined,
  };
}

function sameTypes(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((type, index) => type === b[index]);
}

function applyCreateFunction(model: DatabaseModel, statement: string): boolean {
  const match = CREATE_FUNCTION.exec(statement);
  if (!match) return false;
  const [header, schema, name = ""] = match;
  if (!schemaIsPublic(schema)) return true;
  const { inside, rest } = insideParentheses(statement, header.length - 1);
  if (TRIGGER_RETURN.test(rest)) return true;
  const args = splitOnCommas(inside).flatMap((item) => parseArgument(item) ?? []);
  const types = args.map((arg) => arg.sqlType);
  const overloads = model.functions.get(name) ?? [];
  const kept = overloads.filter(
    (overload) =>
      !sameTypes(
        overload.map((arg) => arg.sqlType),
        types,
      ),
  );
  model.functions.set(name, [...kept, args]);
  return true;
}

function applyDropFunction(model: DatabaseModel, statement: string): boolean {
  const match = DROP_FUNCTION.exec(statement);
  if (!match) return false;
  const [header, schema, name = "", hasArguments] = match;
  if (!schemaIsPublic(schema)) return true;
  if (!hasArguments) {
    model.functions.delete(name);
    return true;
  }
  const { inside } = insideParentheses(statement, header.length - 1);
  const types = splitOnCommas(inside).map((type) => normalizeType(type));
  const kept = (model.functions.get(name) ?? []).filter(
    (overload) =>
      !sameTypes(
        overload.map((arg) => arg.sqlType),
        types,
      ),
  );
  if (kept.length > 0) model.functions.set(name, kept);
  else model.functions.delete(name);
  return true;
}

function applyDropTable(model: DatabaseModel, statement: string): boolean {
  const match = DROP_TABLE.exec(statement);
  if (!match) return false;
  if (schemaIsPublic(match[1])) model.tables.delete(match[2] ?? "");
  return true;
}

/** The body of `do $$ ... $$`: migrations add constraints and some columns inside one. */
function doBlockBody(statement: string): string | null {
  if (!/^do\b/i.test(statement)) return null;
  const tag = /\$\w*\$/.exec(statement);
  if (!tag) return null;
  const start = tag.index + tag[0].length;
  return statement.slice(start, statement.indexOf(tag[0], start));
}

function applyStatement(model: DatabaseModel, statement: string): void {
  const body = doBlockBody(statement);
  if (body !== null) {
    for (const inner of splitStatements(body)) {
      if (ALTER_TABLE.test(inner)) applyAlterTable(model, inner);
    }
    return;
  }
  const appliers = [applyCreateTable, applyDropTable, applyCreateFunction, applyDropFunction];
  if (appliers.some((apply) => apply(model, statement))) return;
  if (/^alter\s+table\b/i.test(statement)) applyAlterTable(model, statement);
}

/** The model of a list of SQL scripts, in the order they are applied. */
export function modelFromSql(scripts: readonly string[]): DatabaseModel {
  const model: DatabaseModel = { tables: new Map(), functions: new Map() };
  for (const script of scripts) {
    for (const statement of splitStatements(script)) applyStatement(model, statement);
  }
  return model;
}

/** Adds what no migration creates, under what the migrations did add to it. */
function withTablesWithoutMigration(model: DatabaseModel): DatabaseModel {
  for (const [name, columns] of Object.entries(TABLES_WITHOUT_MIGRATION)) {
    const table = new Map<string, ColumnModel>();
    for (const [column = "", sqlType = "", key] of columns) {
      table.set(column, {
        name: column,
        sqlType: normalizeType(sqlType),
        nullable: key === undefined,
        hasDefault: key !== undefined,
      });
    }
    for (const [column, definition] of model.tables.get(name) ?? []) table.set(column, definition);
    model.tables.set(name, table);
  }
  return model;
}

export function readMigrations(root = "."): string[] {
  const dir = join(root, MIGRATIONS_DIR);
  return readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .toSorted()
    .map((file) => readFileSync(join(dir, file), "utf8"));
}

/** Only what the migrations say, for the test that reports what they do not. */
export function migrationsModel(root = "."): DatabaseModel {
  return modelFromSql(readMigrations(root));
}

export function databaseModel(root = "."): DatabaseModel {
  return withTablesWithoutMigration(migrationsModel(root));
}

export function isKnownSqlType(sqlType: string): boolean {
  return sqlType.replace(/\[\]$/, "") in TS_TYPES;
}

/** Any other type is a composite, like an argument that is a whole row: it travels as JSON. */
export function tsType(sqlType: string): string {
  if (sqlType.endsWith("[]")) return `${tsType(sqlType.slice(0, -2))}[]`;
  return TS_TYPES[sqlType] ?? "Json";
}

function byName<T>(entries: Iterable<[string, T]>): [string, T][] {
  return [...entries].toSorted(([a], [b]) => (a < b ? -1 : 1));
}

function columnLines(columns: readonly ColumnModel[], indent: string, kind: string): string[] {
  return columns.map((column) => {
    const type = tsType(column.sqlType);
    if (kind === "Row")
      return `${indent}${column.name}: ${type}${column.nullable ? " | null" : ""};`;
    const optional = kind === "Update" || column.nullable || column.hasDefault;
    return `${indent}${column.name}${optional ? "?" : ""}: ${type}${column.nullable ? " | null" : ""};`;
  });
}

function renderTable(name: string, table: Map<string, ColumnModel>): string[] {
  const columns = byName(table.entries()).map(([, column]) => column);
  const part = (kind: string): string[] => [
    `        ${kind}: {`,
    ...columnLines(columns, "          ", kind),
    "        };",
  ];
  return [
    `      ${name}: {`,
    ...part("Row"),
    ...part("Insert"),
    ...part("Update"),
    "        Relationships: [];",
    "      };",
  ];
}

// SQL arguments have no NOT NULL: PostgREST passes a null to any of them.
function renderArguments(args: readonly ArgumentModel[], indent: string): string[] {
  return byName(args.map((arg): [string, ArgumentModel] => [arg.name, arg])).map(
    ([, arg]) => `${indent}${arg.name}${arg.hasDefault ? "?" : ""}: ${tsType(arg.sqlType)} | null;`,
  );
}

function renderFunction(name: string, overloads: readonly ArgumentModel[][]): string[] {
  const lines = [`      ${name}: {`];
  if (overloads.length === 1) {
    const args = overloads[0] ?? [];
    if (args.length === 0) {
      lines.push("        Args: Record<PropertyKey, never>;");
    } else {
      lines.push("        Args: {", ...renderArguments(args, "          "), "        };");
    }
  } else {
    lines.push("        Args:");
    overloads.forEach((args, index) => {
      lines.push(
        "          | {",
        ...renderArguments(args, "              "),
        `            }${index === overloads.length - 1 ? ";" : ""}`,
      );
    });
  }
  lines.push("        Returns: unknown;", "      };");
  return lines;
}

export function renderDatabaseTypes(model: DatabaseModel): string {
  return [
    "// Generated by scripts/generate-database-types.ts from supabase/migrations: do not edit.",
    "export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];",
    "",
    "export type Database = {",
    "  public: {",
    "    Tables: {",
    ...byName(model.tables.entries()).flatMap(([name, table]) => renderTable(name, table)),
    "    };",
    "    Views: Record<string, never>;",
    "    Functions: {",
    ...byName(model.functions.entries()).flatMap(([name, overloads]) =>
      renderFunction(name, overloads),
    ),
    "    };",
    "    Enums: Record<string, never>;",
    "    CompositeTypes: Record<string, never>;",
    "  };",
    "};",
    "",
  ].join("\n");
}

if (argv[1]?.endsWith("generate-database-types.ts")) {
  writeFileSync(OUTPUT_FILE, renderDatabaseTypes(databaseModel()));
}
