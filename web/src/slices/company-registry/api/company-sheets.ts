// What goes down and up in the sheets of Base de datos. The cells of a sheet are always text.
import {
  activeOptionOfKind,
  asText,
  type Company,
  type Options,
  SHEET_WIDTHS,
  sheetLines,
  templateCompanies,
} from "@/shared/domain/company-registry/index.ts";
import { downloadSheet, type ReadSheetRow, type SheetApi } from "@/shared/lib/sheet-library.ts";
import { newAdvisorId, type SavedAdvisor } from "./saved-advisors.ts";

const ADVISOR_COLUMNS = ["guardar_como", "nombre", "celular", "email"];
const ADVISOR_WIDTHS = [26, 26, 16, 38];

export function downloadCompanies(
  api: SheetApi,
  rows: readonly Company[],
  options: Options,
  fileName: string,
): void {
  downloadSheet(api, {
    lines: sheetLines(rows, options),
    widths: SHEET_WIDTHS,
    sheetName: "Empresas",
    fileName,
  });
}

export function downloadCompanyTemplate(api: SheetApi, options: Options): void {
  const rows = templateCompanies((kind) => activeOptionOfKind(kind, options));
  downloadCompanies(api, rows, options, "Plantilla_Empresas_Galicia.xlsx");
}

function downloadAdvisorSheet(api: SheetApi, rows: readonly SavedAdvisor[], fileName: string) {
  downloadSheet(api, {
    lines: [
      ADVISOR_COLUMNS,
      ...rows.map(({ name, nombre, celular, email }) => [name, nombre, celular, email]),
    ],
    widths: ADVISOR_WIDTHS,
    sheetName: "Asesores",
    fileName,
  });
}

export function downloadAdvisors(api: SheetApi, rows: readonly SavedAdvisor[]): void {
  downloadAdvisorSheet(api, rows, "Mis_Asesores_Galicia.xlsx");
}

const ADVISOR_EXAMPLES: readonly SavedAdvisor[] = [
  {
    id: "1",
    name: "Juan — Sucursal Centro",
    nombre: "Juan Perez",
    celular: "11 1234 5678",
    email: "juan.perez@bancogalicia.com.ar",
  },
  {
    id: "2",
    name: "",
    nombre: "Ana Gomez",
    celular: "11 5555 6666",
    email: "ana.gomez@bancogalicia.com.ar",
  },
];

export function downloadAdvisorTemplate(api: SheetApi): void {
  downloadAdvisorSheet(api, ADVISOR_EXAMPLES, "Plantilla_Asesores_Galicia.xlsx");
}

function cell(row: ReadSheetRow, keys: readonly string[]): string {
  for (const key of keys) {
    const value = asText(row[key]).trim();
    if (value) return value;
  }
  return "";
}

function advisorsOfRow(row: ReadSheetRow): SavedAdvisor[] {
  const found: SavedAdvisor[] = [];
  const second = cell(row, ["asesor2_nombre"]);
  if (second) {
    found.push({
      id: `${newAdvisorId()}b`,
      name: second,
      nombre: second,
      celular: cell(row, ["asesor2_celular"]),
      email: cell(row, ["asesor2_email"]),
    });
  }
  const first = cell(row, ["asesor1_nombre", "nombre", "Nombre"]);
  if (first) {
    found.push({
      id: newAdvisorId(),
      // How it reads on the list; a sheet without that column shows the real name.
      name: cell(row, ["guardar_como", "nombre_visible", "etiqueta"]) || first,
      nombre: first,
      celular: cell(row, ["asesor1_celular", "celular", "Celular"]),
      email: cell(row, ["asesor1_email", "email", "Email"]),
    });
  }
  return found;
}

/** The advisors of a sheet, each new one on top of the ones before, as they arrive. */
export function advisorsOfSheet(rows: readonly ReadSheetRow[]): readonly SavedAdvisor[] {
  return rows.flatMap(advisorsOfRow).toReversed();
}
