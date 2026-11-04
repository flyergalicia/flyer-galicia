// Globals of gestiones.js and of what it uses from auth.js. Only driver/legacy may use them.

interface LegacyCommercialPerson {
  id: string;
  nombre: string;
  estado: string;
  paquete?: string | null;
  motivo?: string | null;
}

interface LegacyCommercialDashboard {
  kpis?: { visitas?: number; sin_asignar?: number };
  por_hunter?: { id: string | null }[];
  por_dueno?: { id: string }[];
}

interface LegacyCommercialState {
  detG: { id: string } | null;
  detPros: LegacyCommercialPerson[];
  msgN: Record<string, unknown> | null;
  ag: { mes?: string; dia?: string | null };
  f: { meses: string[]; qAb: number[] };
  tablero: LegacyCommercialDashboard | null;
}

interface LegacyCommercialWrite extends PromiseLike<{ error: { message: string } | null }> {
  select(): LegacyCommercialWrite;
  single(): LegacyCommercialWrite;
  maybeSingle(): LegacyCommercialWrite;
  eq(column: string, value: unknown): LegacyCommercialWrite;
}

interface LegacyTutorialStep {
  cap: string;
  target: string | (() => Element | null);
}

declare var GES: LegacyCommercialState;
declare var _tour: { pasos: LegacyTutorialStep[]; i: number } | null;
declare var _sb: {
  from(table: string): {
    insert(row: object): LegacyCommercialWrite;
    update(row: object): LegacyCommercialWrite;
  };
};

declare function gesAbrirDet(id: string): void;
declare function gesContactarTodas(): void;
declare function gesListaLimpiar(): void;
declare function gesMsgNuevos(force: boolean): Promise<unknown>;
declare function _tourStart(chapter: string): void;
declare function _tourNext(): void;
declare function _tourEnd(): void;

declare var _myName: string;
declare function _gesAvisoCargar(): void;
