// Globals of the current app that its drivers read inside the page. Only driver/legacy may
// use them: the lint policy forbids them in specs and the React app will not have them.

interface LegacyOptionCache {
  img?: HTMLImageElement | null;
  cfg?: Record<string, unknown>;
  loaded?: boolean;
}

interface LegacyLogoChange {
  tipo?: string;
  img?: string;
  t?: string;
  tx?: number;
  ty?: number;
  tw?: number;
  th?: number;
}

interface LegacyFlyerValues {
  logos?: unknown[];
}

declare var baseImg: HTMLImageElement | null;
declare var cv: HTMLCanvasElement;
declare var SC: number;
declare var ZOOM: number;
declare var FLYER_CFG: Record<string, unknown>;
declare var _fgOpt: number;
// These three do not exist yet while the app's scripts load.
declare var _fgPrevGate: boolean | undefined;
declare var _facLoaded: boolean | undefined;
declare var _opcLoaded: boolean | undefined;
declare var _me: object | null;
declare var _fgOptCache: Record<number, LegacyOptionCache | undefined>;
declare var _fgLg: { list: LegacyLogoChange[] };
declare var _fgLgV: { q?: string };

declare function calcSC(): void;
declare function redrawNow(): void;
declare function resetVals(): void;
declare function getVals(): LegacyFlyerValues;
declare function fullRes(values: LegacyFlyerValues): HTMLCanvasElement;
declare function switchFlyerOption(option: number): void;
declare function _optN(option: unknown): number;
declare function _optTieneImg(option: number): boolean | undefined;
declare function _fgOptLista(option: number): boolean;
declare function _fgDescargaBloqueo(): string;
