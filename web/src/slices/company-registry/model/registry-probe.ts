// What a test can read of Mis empresas that cannot be seen on the screen, and what the rules of its
// sheets say about a row: they answer without changing anything. See shared/lib/test-probe.ts.
import type { QueryClient } from "@tanstack/react-query";
import {
  companyOfSheetRow,
  type DestinationRules,
  destinationOf,
  sanitizeCategory,
  sanitizeCompanies,
  SHEET_COLUMNS,
  sheetLines,
  validateSheet,
} from "@/shared/domain/company-registry/index.ts";
import { richTextOf } from "@/shared/domain/rich-text.ts";
import { COMPANIES_QUERY_KEY, type CompanyList } from "../api/companies.ts";
import type { EditorState } from "./company-editor.ts";
import type { RegistryContext } from "./registry-rules.ts";

export interface ProbeSources {
  readonly editor: EditorState;
  readonly rules: DestinationRules;
  readonly context: RegistryContext;
}

interface ProbeSheetRow {
  readonly cells: Readonly<Record<string, string>>;
  readonly readerRow?: number;
}

const CAP_COLUMNS = ["rubro", "tope_combustible", "tope_supermercado"];

function asReaderRow({ cells, readerRow }: ProbeSheetRow): Readonly<Record<string, string>> {
  const row = { ...cells };
  if (readerRow !== undefined) {
    Object.defineProperty(row, "__rowNum__", { value: readerRow, enumerable: false });
  }
  return row;
}

export function registryProbe(
  queryClient: QueryClient,
  userId: string | null,
  read: () => ProbeSources,
) {
  const listState = () => queryClient.getQueryState<CompanyList>([...COMPANIES_QUERY_KEY, userId]);
  return {
    ownCompanyCount: () => listState()?.data?.rows.length ?? 0,
    companiesFailed: () => listState()?.status === "error",
    editorCategory: (row: number) => sanitizeCategory(read().editor.rows?.[row]?.rubro),
    destinationOption: (company: unknown) => {
      const [clean] = sanitizeCompanies([company]);
      return clean ? destinationOf(clean, read().rules) : 0;
    },
    sheetColumns: () => SHEET_COLUMNS,
    exportAndReadBack: (companies: unknown) => {
      const { options } = read().context;
      const clean = sanitizeCompanies(companies);
      const [head = [], ...body] = sheetLines(clean, options);
      return {
        cells: body.map((line) => CAP_COLUMNS.map((column) => line[head.indexOf(column)] ?? "")),
        unchanged: body.map((line, position) => {
          const row = Object.fromEntries(head.map((key, at) => [key, line[at]]));
          const after = companyOfSheetRow(row, options)?.rubro;
          const before = sanitizeCategory(clean[position]?.rubro);
          return (
            before.importe === after?.importe &&
            before.importe2 === after?.importe2 &&
            before.txt === after?.txt
          );
        }),
      };
    },
    capsOfSheetRow: (cells: Readonly<Record<string, string>>) =>
      companyOfSheetRow(cells, read().context.options)?.rubro ?? sanitizeCategory(null),
    validateSheet: (rows: readonly ProbeSheetRow[]) => {
      const report = validateSheet(rows.map(asReaderRow), read().context);
      return {
        firstCompanyCap: report.rows[0]?.rubro.importe ?? "",
        problems: report.problems.map(({ text }) => richTextOf(text)),
      };
    },
  };
}
