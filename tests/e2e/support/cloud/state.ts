import {
  type ActiveFlyerFile,
  activeFlyerNine,
  bucketUrl,
  promotionCatalog,
  type PromotionRow,
} from "./seed-data.ts";
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
 * createCloudState.
 */
export interface CloudState {
  users: Record<string, CloudUser>;
  bucketJson: BucketJsonFiles;
  bucketBinaries: Record<string, Buffer>;
  /** What listing the files of the bucket answers. */
  bucketFileList: Row[];
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
  /** What each download asked to write in flyer_logs. */
  flyerLogWrites: Row[];
  isTestAccount: boolean;
  /** profiles.status of whoever signs in. */
  ownProfileStatus: string;
  /** profiles.facultades by user: the column "Vos" of the administrator. */
  ownFaculties: Record<string, unknown>;
  /** What Supabase answers to a password; null signs in. */
  signInRefusal: { status: number; message: string } | "offline" | null;
  /** Sessions the browser closed. */
  signOuts: number;
  testAccounts: Row[];
  adminCalls: Row[];
  /** What auth-admin answers to that action instead of doing it. */
  adminRefusal: { action: string; status: number; message: string } | null;
  /** New passwords the browser asked for its own account. */
  passwordChanges: string[];
  passwordChangeRefusal: { status: number; message: string } | null;
  /** One-use sign-in permissions the browser tried to redeem. */
  signInRedemptions: Row[];
  locationCalls: number;
  /** Bodies of the manual or automatic update of the catalog. */
  promotionSyncCalls: Row[];
  promotionSyncRefusal: { status: number; message: string } | null;
  /** What Galicia brings when the catalog is updated; null leaves it as it is. */
  promotionCatalogAfterSync: readonly PromotionRow[] | null;
  /** Assign a new list to change it for this test; the shared snapshot stays intact. */
  promotionCatalog: readonly PromotionRow[];
  /** Promos Galicia also answers for a locality, on top of the recorded ones. */
  extraLocalityPromotionIds: number[];
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
  /** Rows of padron_empresas; null leaves the table empty. */
  companies: Row[] | null;
  companiesUnreachable: boolean;
  companyReplaceFails: boolean;
  companyReplaceCalls: number;
  /** What each padron_replace asked to keep, in order. */
  companyReplaceRows: Row[][];
  substituteCompanies: Row[];
  substituteRequests: Row[];
  companyProposals: Row[] | null;
  /** Rows of padron_propuesta_mensajes. */
  proposalMessages: Row[];
  /** What each padron_propuesta_responder asked. */
  proposalAnswers: Row[];
  proposalAnswerFails: boolean;
  /** Rows of audit_log. */
  auditRows: Row[];
  /** Rows of padron_log. */
  companyLog: Row[];
  /** Rows of asesores_guardados. */
  savedAdvisors: Row[];
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
    bucketFileList: [],
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
    flyerLogWrites: [],
    isTestAccount: false,
    ownProfileStatus: "active",
    ownFaculties: {},
    signInRefusal: null,
    signOuts: 0,
    testAccounts: [],
    adminCalls: [],
    adminRefusal: null,
    passwordChanges: [],
    passwordChangeRefusal: null,
    signInRedemptions: [],
    locationCalls: 0,
    promotionSyncCalls: [],
    promotionSyncRefusal: null,
    promotionCatalogAfterSync: null,
    promotionCatalog,
    extraLocalityPromotionIds: [],
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
    companies: null,
    companiesUnreachable: false,
    companyReplaceFails: false,
    companyReplaceCalls: 0,
    companyReplaceRows: [],
    substituteCompanies: [],
    substituteRequests: [],
    companyProposals: null,
    proposalMessages: [],
    proposalAnswers: [],
    proposalAnswerFails: false,
    auditRows: [],
    companyLog: [],
    savedAdvisors: [],
  };
}

export interface NewFlyerOption {
  option: number;
  name: string;
  /** Bucket file and query of its artwork; null means the option has no flyer yet. */
  image: string | null;
  legal: string;
  calibration?: Record<string, unknown>;
  /** Tab of the option bar it belongs to; by default the main one. */
  tab?: string;
  /** Option it is the version without cashback of. */
  noCashbackOf?: number;
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
  // Option 1 is the original flyer: its files have no number.
  const suffix = option.option === 1 ? "" : String(option.option);
  state.bucketJson[`_active${suffix}.json`] = active;
  state.bucketJson[`_legal${suffix}.json`] = { text: option.legal };
  state.bucketJson["_opciones.json"].opts.push({
    n: option.option,
    nombre: option.name,
    solapa: option.tab ?? "flyer",
    ...(option.noCashbackOf === undefined ? {} : { sinCB: option.noCashbackOf }),
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
