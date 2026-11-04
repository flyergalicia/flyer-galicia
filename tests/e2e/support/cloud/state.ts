import { type ActiveFlyerFile, activeFlyerNine, bucketUrl } from "./seed-data.ts";
import { type CommercialDb } from "./commercial-actions/rows.ts";
import { baseUsers, type CloudUser } from "./users.ts";

export type Row = Record<string, unknown>;

export interface FlyerOptionEntry {
  n: number;
  nombre: string;
  solapa: string;
  [key: string]: unknown;
}

export interface PermissionsFile {
  roles: Record<string, Record<string, boolean>>;
}

/** Bucket JSON files, by their real file name: the keys and contents are contracts. */
export interface BucketJsonFiles {
  "_opciones.json": { opts: FlyerOptionEntry[]; [key: string]: unknown };
  "_facultades.json": PermissionsFile;
  [file: string]: unknown;
}

/** Row of flyer_disenos. */
export interface DesignRow extends Row {
  id: string;
  user_id: string;
  autor: string;
  nombre: unknown;
  estado: string;
  tipo: string;
  datos: unknown;
  compartido_de: string | null;
  updated_at: string;
}

export interface DesignMessageRow extends Row {
  diseno_id: string;
}

export interface UploadRecord {
  name: string;
  bytes: number;
}

export interface BenchmarkCardWrite {
  method: string;
  body: Row;
  idFilter: string | null;
}

/** A network failure a test turned on; see Cloud.dropBucketFile. */
export interface NetworkFault {
  bucketFile: string;
}

/**
 * Everything the simulated cloud remembers. Each test gets its own through
 * createCloudState: this is what legacy tests reached as `nube.*`.
 */
export interface CloudState {
  users: Record<string, CloudUser>;
  bucketJson: BucketJsonFiles;
  bucketBinaries: Record<string, Buffer>;
  uploads: UploadRecord[];
  uploadConflicts: number;
  deletedFiles: string[];
  lastJsonUpload: string | null;
  failUploadEndingWith: string | null;
  designs: DesignRow[];
  designMessages: DesignMessageRow[];
  sequence: number;
  favorites: Record<string, unknown>;
  profiles: Row[] | null;
  flyerLogs: Row[] | null;
  isTestAccount: boolean;
  testAccounts: Row[];
  adminCalls: Row[];
  locationCalls: number;
  modoPromotions: Row[];
  modoTableMissing: boolean;
  benchmarkPromotions: Row[];
  benchmarkBrands: Row[];
  benchmarkMeta: Row[];
  benchmarkHistory: Row[];
  benchmarkTablesMissing: boolean;
  benchmarkRequests: string[];
  benchmarkCalls: Row[];
  benchmarkCards: Row[];
  benchmarkCardsMissing: boolean;
  benchmarkManual: Row[];
  benchmarkManualMissing: boolean;
  benchmarkCardWrites: BenchmarkCardWrite[];
  faults: Set<NetworkFault>;
  commercialActions: CommercialDb | null;
}

export function createCloudState(): CloudState {
  return {
    users: baseUsers(),
    bucketJson: {
      "_opciones.json": { opts: [{ n: 9, nombre: "Combustible", solapa: "flyer" }] },
      "_facultades.json": {
        roles: { asesor: { opcion_1: false, opcion_9: true, promos_buscar: true, estudio: true } },
      },
      "_titulos.json": {},
      "_cashback.json": {
        configs: [{ nombre: "BAU", m1: "$250.000", m2: "$180.000", m3: "$80.000", m4: "$30.000" }],
      },
      "_active.json": { name: "", imageUrl: null },
      "_legal.json": { text: "Legal 1" },
      "_active9.json": activeFlyerNine(),
      "_legal9.json": { text: "Legal de prueba para la opción 9." },
    },
    bucketBinaries: {},
    uploads: [],
    uploadConflicts: 0,
    deletedFiles: [],
    lastJsonUpload: null,
    failUploadEndingWith: null,
    designs: [],
    designMessages: [],
    sequence: 0,
    favorites: {},
    profiles: null,
    flyerLogs: null,
    isTestAccount: false,
    testAccounts: [],
    adminCalls: [],
    locationCalls: 0,
    modoPromotions: [],
    modoTableMissing: false,
    benchmarkPromotions: [],
    benchmarkBrands: [],
    benchmarkMeta: [],
    benchmarkHistory: [],
    benchmarkTablesMissing: false,
    benchmarkRequests: [],
    benchmarkCalls: [],
    benchmarkCards: [],
    benchmarkCardsMissing: false,
    benchmarkManual: [],
    benchmarkManualMissing: false,
    benchmarkCardWrites: [],
    faults: new Set(),
    commercialActions: null,
  };
}

export interface NewFlyerOption {
  option: number;
  name: string;
  /** Bucket file and query of its artwork; null means the option has no flyer yet. */
  image: string | null;
  legal: string;
  calibration?: Record<string, unknown>;
}

/** Registers a flyer option in the bucket the way an administrator publishes one. */
export function addFlyerOption(state: CloudState, option: NewFlyerOption): void {
  const active: ActiveFlyerFile =
    option.image === null
      ? { name: "", imageUrl: null }
      : {
          ...activeFlyerNine(),
          name: option.name,
          imageUrl: bucketUrl(option.image),
          cfg: { ...activeFlyerNine().cfg, ...option.calibration },
        };
  state.bucketJson[`_active${String(option.option)}.json`] = active;
  state.bucketJson[`_legal${String(option.option)}.json`] = { text: option.legal };
  state.bucketJson["_opciones.json"].opts.push({
    n: option.option,
    nombre: option.name,
    solapa: "flyer",
  });
}

/** Sets faculties (`opcion_9`, `estudio`...) of a role; the names are contracts. */
export function setPermissions(
  state: CloudState,
  role: string,
  permissions: Record<string, boolean>,
): void {
  const roles = state.bucketJson["_facultades.json"].roles;
  roles[role] = { ...roles[role], ...permissions };
}
