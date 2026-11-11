import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInThisContext } from "node:vm";

/** A stretch of the function's source: from one marker up to, not including, another. */
export interface SourceSlice {
  from: string;
  to: string;
}

export interface EdgeFunctionSource<Api extends object> {
  /** Folder under supabase/functions. */
  name: string;
  /** Pure code only: an Edge Function's source does not load in Node as a whole. */
  slices: readonly SourceSlice[];
  /** Declarations the slices need and leave outside. */
  prelude?: string;
  functions: readonly (keyof Api & string)[];
}

function sliceOf(source: string, { from, to }: SourceSlice): string {
  const start = source.indexOf(from);
  const end = source.indexOf(to);
  if (start < 0 || end < start) {
    throw new Error(`The function's source no longer has "${from}" before "${to}"`);
  }
  return source.slice(start, end);
}

function hasFunctions<Api extends object>(
  value: unknown,
  functions: readonly (keyof Api & string)[],
): value is Api {
  return (
    typeof value === "object" &&
    value !== null &&
    functions.every((name) => name in value && typeof Reflect.get(value, name) === "function")
  );
}

/** Evaluates the real source of an Edge Function, so tests never carry a copy of its logic. */
export function loadEdgeFunctionApi<Api extends object>(spec: EdgeFunctionSource<Api>): Api {
  const path = new URL(`../../../supabase/functions/${spec.name}/index.ts`, import.meta.url);
  const source = readFileSync(path, "utf8");
  const pure = stripTypeScriptTypes(
    spec.slices.map((slice) => sliceOf(source, slice)).join("\n"),
  ).replaceAll("export function", "function");
  const code = `(() => {\n${spec.prelude ?? ""}\n${pure}\nreturn { ${spec.functions.join(", ")} };\n})()`;
  const api: unknown = runInThisContext(code, { filename: `${spec.name}/index.ts` });
  if (!hasFunctions<Api>(api, spec.functions)) {
    throw new Error(`${spec.name} does not expose ${spec.functions.join(", ")}`);
  }
  return api;
}
