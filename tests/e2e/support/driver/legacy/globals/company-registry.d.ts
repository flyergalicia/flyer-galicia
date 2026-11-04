// Globals of the current app about Mis empresas, for its legacy driver.

interface LegacyCompanyOfficer {
  nombre: string;
  celular?: string;
  email?: string;
}

interface LegacyCompanyCategory {
  opcion?: number;
  txt?: string;
  importe?: string;
  importe2?: string;
}

interface LegacyCompany {
  empresa: string;
  cuits?: string[];
  config: string;
  asesores: LegacyCompanyOfficer[];
  rubro?: LegacyCompanyCategory;
}

interface LegacySheetValidation {
  rows: { rubro: LegacyCompanyCategory }[];
  problemas: { txt: string }[];
}

declare var _padron: LegacyCompany[] | null;
declare var _padLoadErr: boolean;
declare var _padCargando: unknown;
declare var _padSupAt: number;
declare var _padReintentoAt: number;
declare var _padSug: unknown[];
declare var _padSuplencia: LegacyCompany[];
declare var _padEdit: LegacyCompany[] | null;
declare var _padEditAsOpen: Record<number, boolean>;
declare var _padEditQ: string;
declare var _padPending: unknown;
declare var _pgOpen: boolean;
declare var _pgSel: Record<number, boolean>;
declare var _pgBusy: boolean;
declare var _PAD_HEAD: string[];
declare var _OPC: Record<number, Record<string, unknown>>;
declare var _FG_OPTS: number[];
declare var _padRubroOpts: () => number[];
declare var _optVigente: (option: number) => number;
declare var _hunMeta: Record<number, boolean>;
declare var _hunMetaOk: boolean;
declare var _hunMetaFalla: boolean;
declare var _hunRows: unknown[] | null;
declare var _hunErr: boolean;
declare var _hunCargando: boolean;

declare function loadPadron(force: boolean, done?: () => void): void;
declare function openPadronPop(): void;
declare function closePadronPop(): void;
declare function openMiPadron(pane?: string): void;
declare function _padReintentar(): void;
declare function _padCloseSug(): void;
declare function _padApply(company: LegacyCompany): void;
declare function _padAfterFlyer(): void;
declare function _padCloseUpdate(dismiss: number): void;
declare function _padDoUpdate(): void;
declare function _padSupCargar(force: boolean, done: () => void): void;
declare function _padSane(rows: LegacyCompany[]): LegacyCompany[];
declare function _padCloneRow(row: LegacyCompany): LegacyCompany;
declare function _padEditRenderShell(): void;
declare function _padEditRenderList(): void;
declare function _padEditFilter(text: string): void;
declare function _padEditOpciones(): { rub: number[] };
declare function _padEditRubro(row: number, field: string, value?: string): void;
declare function _padEditRemoveRow(row: number): void;
declare function _padToAoa(rows: LegacyCompany[]): string[][];
declare function _padRow(cells: Record<string, unknown>): LegacyCompany;
declare function _padRubroSane(category?: LegacyCompanyCategory): LegacyCompanyCategory;
declare function _padValidate(rows: object[]): LegacySheetValidation;
declare function _pgToggle(): void;
declare function _pgRender(): void;
declare function _pgSet(row: number, ticked: boolean): void;
declare function _pgFiltrar(text: string): void;
declare function _pgFiltrados(): number[];
declare function _pgOptDe(company: LegacyCompany): number;
declare function _pgGenerarRows(
  rows: LegacyCompany[],
  format: string,
  ui: { prog: string; fill: string; txt: string; btn: string },
  zipName: string,
): void;
declare function _propCargarPendientes(done: () => void): void;
declare function _propRenderPendientes(): void;
declare function _hunCargar(force: boolean): void;
declare function _hunReintentar(): void;
declare function _hunMetasCargar(done: () => void): void;
declare function _optN(option: unknown): number;
