import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  databaseModel,
  type DatabaseModel,
  isKnownSqlType,
  migrationsModel,
  modelFromSql,
  OUTPUT_FILE,
  renderDatabaseTypes,
  splitStatements,
  TABLES_WITHOUT_MIGRATION,
  tsType,
} from "./generate-database-types.ts";

interface ContractEntry {
  readonly kind: string;
  readonly table?: string;
  readonly select?: readonly string[];
  readonly filters?: readonly string[];
  readonly name?: string;
  readonly params?: readonly string[];
}

const contract: readonly ContractEntry[] = JSON.parse(
  readFileSync("tests/fixtures/network-contract.json", "utf8"),
);

/** `flyer:datos->>flyer` reads the column `datos`; `*` names no column. */
function sourceColumn(column: string): string | null {
  if (column === "*") return null;
  return column.split(":").at(-1)?.split("->")[0] ?? column;
}

function missingOfTable(
  { tables }: DatabaseModel,
  { table = "", select = [], filters = [] }: ContractEntry,
): string[] {
  const columns = tables.get(table);
  const absent = [...select, ...filters]
    .map(sourceColumn)
    .filter((column) => column !== null && !columns?.has(column))
    .map((column) => `${table}.${String(column)}`);
  return columns ? absent : [table, ...absent];
}

function missingOfRpc(
  { functions }: DatabaseModel,
  { name = "", params = [] }: ContractEntry,
): string[] {
  const fits = (functions.get(name) ?? []).some(
    (args) =>
      params.every((param) => args.some((arg) => arg.name === param)) &&
      args.every((arg) => arg.hasDefault || params.includes(arg.name)),
  );
  return fits ? [] : [`${name}(${params.join(",")})`];
}

/** What the contract asks of tables and functions that this model does not have. */
function missingFrom(model: DatabaseModel): string[] {
  const missing = contract.flatMap((entry) => {
    if (entry.kind === "table") return missingOfTable(model, entry);
    return entry.kind === "rpc" ? missingOfRpc(model, entry) : [];
  });
  return [...new Set(missing)].toSorted();
}

function columnsOf(sql: string, table = "t") {
  return [...(modelFromSql([sql]).tables.get(table)?.values() ?? [])];
}

describe("the file database.types.ts", () => {
  it("is up to date with the migrations", () => {
    expect(readFileSync(OUTPUT_FILE, "utf8")).toBe(renderDatabaseTypes(databaseModel()));
  });

  it("has every table, column and parameter of the network contract", () => {
    expect(missingFrom(databaseModel())).toEqual([]);
  });

  it("the migrations alone lack only the two tables created by hand before them", () => {
    expect(missingFrom(migrationsModel())).toEqual([
      "flyer_logs",
      "flyer_logs.bulk_count",
      "flyer_logs.config_name",
      "flyer_logs.created_at",
      "flyer_logs.empresa",
      "flyer_logs.flyer_type",
      "flyer_logs.format",
      "flyer_logs.id",
      "flyer_logs.is_bulk",
      "flyer_logs.user_id",
      "profiles.celular_asesor",
      "profiles.email",
      "profiles.email_asesor",
      "profiles.full_name",
      "profiles.id",
      "profiles.last_login",
      "profiles.nombre_asesor",
      "profiles.role",
      "profiles.status",
    ]);
    expect(Object.keys(TABLES_WITHOUT_MIGRATION).toSorted()).toEqual(["flyer_logs", "profiles"]);
  });

  it("every SQL type has a type of its own, but the one that is a whole row", () => {
    const { tables, functions } = databaseModel();
    const unknown = [
      ...[...tables].flatMap(([table, columns]) =>
        [...columns.values()]
          .filter(({ sqlType }) => !isKnownSqlType(sqlType))
          .map(({ name, sqlType }) => `${table}.${name}: ${sqlType}`),
      ),
      ...[...functions].flatMap(([name, overloads]) =>
        overloads.flatMap((args) =>
          args
            .filter(({ sqlType }) => !isKnownSqlType(sqlType))
            .map((arg) => `${name}(${arg.name}: ${arg.sqlType})`),
        ),
      ),
    ];
    expect(unknown).toEqual(["gestion_participa(p_g: gestiones)"]);
  });

  it("keeps both versions of gestiones_tablero, as the database does", () => {
    const overloads = databaseModel().functions.get("gestiones_tablero") ?? [];

    expect(overloads.map((args) => args.some(({ name }) => name === "p_meses"))).toEqual([
      false,
      true,
    ]);
    expect(overloads[1]?.[0]).toEqual({ name: "p_meses", sqlType: "text[]", hasDefault: false });
  });
});

describe("modelFromSql", () => {
  it("reads a table: types, nullability, defaults and what is not a column", () => {
    const columns = columnsOf(`
      create table if not exists public.t (
        id        bigint primary key,            -- with a comment, comma, and all
        nombre    text not null default 'a,b',
        fecha     timestamp with time zone,
        monto     numeric(10,2) not null,
        listas    text[] default '{}',
        owner_id  uuid references auth.users(id) on delete cascade,
        constraint t_ok check (monto > 0),
        unique (nombre)
      );`);

    expect(columns).toEqual([
      { name: "id", sqlType: "bigint", nullable: false, hasDefault: false },
      { name: "nombre", sqlType: "text", nullable: false, hasDefault: true },
      { name: "fecha", sqlType: "timestamptz", nullable: true, hasDefault: false },
      { name: "monto", sqlType: "numeric", nullable: false, hasDefault: false },
      { name: "listas", sqlType: "text[]", nullable: true, hasDefault: true },
      { name: "owner_id", sqlType: "uuid", nullable: true, hasDefault: false },
    ]);
  });

  it("a primary key at the end of the table makes its columns not null", () => {
    const columns = columnsOf("create table t (a int, b int, c int, primary key (a, b));");

    expect(columns.map(({ nullable }) => nullable)).toEqual([false, false, true]);
  });

  it("follows the alterations of a table", () => {
    const columns = columnsOf(`
      create table t (a int, b int, c int not null, d int);
      alter table public.t add column if not exists e text, add column f boolean not null default false;
      alter table t drop column if exists a;
      alter table t rename column b to b2;
      alter table t alter column c drop not null;
      alter table t alter column d set not null;
      alter table t alter column d set default 1;
      alter table t alter column d type text using d::text;
      alter table t add constraint x check (true);
      alter table t drop constraint if exists x;
      alter table t enable row level security;`);

    expect(columns.map(({ name }) => name)).toEqual(["c", "d", "e", "f", "b2"]);
    expect(columns.find(({ name }) => name === "c")?.nullable).toBe(true);
    expect(columns.find(({ name }) => name === "d")).toMatchObject({
      nullable: false,
      hasDefault: true,
      sqlType: "text",
    });
  });

  it("drops a default, renames and drops a table", () => {
    const { tables } = modelFromSql([
      `create table a (x int default 1);
       alter table a alter column x drop default;
       alter table a rename to b;
       create table c (y int);
       drop table if exists c;
       drop table auth.c;`,
    ]);

    expect([...tables.keys()]).toEqual(["b"]);
    expect(tables.get("b")?.get("x")?.hasDefault).toBe(false);
  });

  it("finds an alteration inside a do block, and not the code inside a function", () => {
    const columns = columnsOf(`
      create table t (a int);
      do $$ begin
        if not exists (select 1) then
          alter table public.t add column b int;
        end if;
      end $$;
      create or replace function public.f() returns void language plpgsql as $body$
      begin
        alter table public.t add column c int;
      end $body$;`);

    expect(columns.map(({ name }) => name)).toEqual(["a", "b"]);
  });

  it("only reads the public schema", () => {
    const { tables, functions } = modelFromSql([
      `create table auth.x (a int);
       alter table auth.users add column b int;
       create function private.g() returns int as $$ select 1 $$ language sql;
       drop function auth.g();`,
    ]);

    expect([...tables.keys()]).toEqual([]);
    expect([...functions.keys()]).toEqual([]);
  });

  it("a table is created only once", () => {
    const columns = columnsOf("create table t (a int); create table if not exists t (b int);");

    expect(columns.map(({ name }) => name)).toEqual(["a"]);
  });

  it("reads a function: arguments, defaults and overloads; a trigger is not one", () => {
    const { functions } = modelFromSql([
      `create or replace function public.f(p_a text, p_b int default 1, in p_c uuid = null)
         returns table(id uuid, nombre text) as $$ select 1 $$ language sql;
       create or replace function public.f(p_a text) returns void as $$ $$ language sql;
       create function g() returns trigger as $$ $$ language plpgsql;
       create function h(out x int) returns int as $$ $$ language sql;`,
    ]);

    expect(functions.get("f")).toEqual([
      [
        { name: "p_a", sqlType: "text", hasDefault: false },
        { name: "p_b", sqlType: "int", hasDefault: true },
        { name: "p_c", sqlType: "uuid", hasDefault: true },
      ],
      [{ name: "p_a", sqlType: "text", hasDefault: false }],
    ]);
    expect(functions.has("g")).toBe(false);
    expect(functions.get("h")).toEqual([[]]);
  });

  it("replacing a function with the same types does not make another one", () => {
    const { functions } = modelFromSql([
      `create function f(p_a text) returns int as $$ $$ language sql;
       create or replace function f(p_b text) returns int as $$ $$ language sql;`,
    ]);

    expect(functions.get("f")).toEqual([[{ name: "p_b", sqlType: "text", hasDefault: false }]]);
  });

  it("drops the function with those types, or all of them without types", () => {
    const { functions } = modelFromSql([
      `create function f(a text) returns int as $$ $$ language sql;
       create function f(a text, b integer) returns int as $$ $$ language sql;
       drop function if exists public.f(text, integer);
       create function g(a text) returns int as $$ $$ language sql;
       drop function public.g(text);
       create function h(a text) returns int as $$ $$ language sql;
       drop function h;`,
    ]);

    expect(functions.get("f")).toEqual([[{ name: "a", sqlType: "text", hasDefault: false }]]);
    expect(functions.has("g")).toBe(false);
    expect(functions.has("h")).toBe(false);
  });
});

describe("splitStatements", () => {
  it("does not split on what is inside a string or a body", () => {
    expect(
      splitStatements(`select 'a;b', "c;d";
        /* a block; comment */
        select $tag$ x; y $tag$; select 'it''s'`),
    ).toEqual([`select 'a;b', "c;d"`, "select $tag$ x; y $tag$", "select 'it''s'"]);
  });

  it("copes with text that ends early", () => {
    expect(splitStatements("select 'open")).toEqual(["select 'open"]);
    expect(splitStatements("select $$ open")).toEqual(["select $$ open"]);
    expect(splitStatements("-- only a comment")).toEqual([]);
    expect(splitStatements("/* open")).toEqual([]);
    expect(splitStatements("select 1 -- end")).toEqual(["select 1"]);
  });
});

describe("tsType", () => {
  it("maps what the migrations use", () => {
    expect(tsType("uuid")).toBe("string");
    expect(tsType("timestamptz")).toBe("string");
    expect(tsType("smallint")).toBe("number");
    expect(tsType("boolean")).toBe("boolean");
    expect(tsType("jsonb")).toBe("Json");
    expect(tsType("text[]")).toBe("string[]");
    expect(tsType("gestiones")).toBe("Json");
    expect(isKnownSqlType("text[]")).toBe(true);
    expect(isKnownSqlType("gestiones")).toBe(false);
  });
});

describe("renderDatabaseTypes", () => {
  it("writes the shape supabase-js expects", () => {
    const text = renderDatabaseTypes(
      modelFromSql([
        `create table t (id uuid primary key, nombre text not null default '', nota text, cuenta int not null);
         create function f() returns int as $$ $$ language sql;
         create function g(p_a text, p_b int default 1) returns int as $$ $$ language sql;
         create function h(p_a text) returns int as $$ $$ language sql;
         create function h(p_b int) returns int as $$ $$ language sql;`,
      ]),
    );

    expect(text).toContain(
      "      t: {\n        Row: {\n          cuenta: number;\n          id: string;",
    );
    expect(text).toContain("nombre: string;\n          nota: string | null;");
    expect(text).toContain("Insert: {\n          cuenta: number;\n          id: string;");
    expect(text).toContain("nombre?: string;\n          nota?: string | null;");
    expect(text).toContain("Update: {\n          cuenta?: number;");
    expect(text).toContain(
      "f: {\n        Args: Record<PropertyKey, never>;\n        Returns: unknown;",
    );
    expect(text).toContain("p_a: string | null;\n          p_b?: number | null;");
    expect(text).toContain(
      "Args:\n          | {\n              p_a: string | null;\n            }\n          | {\n              p_b: number | null;\n            };",
    );
    expect(text).toContain("Views: Record<string, never>;");
  });
});
