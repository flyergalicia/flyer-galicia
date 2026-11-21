// Rows of the commercial-actions tables. Their column names are contracts with the database.
/** Row of gestiones. */
export interface ActionRow {
  id: string;
  empresa: string;
  empresa_key: string;
  cuit: string | null;
  origen: string;
  tipo: string;
  modalidad: string;
  frecuencia: string;
  estado: string;
  fecha: string;
  hora_desde: string | null;
  hora_hasta: string | null;
  lugar: string | null;
  nota: string | null;
  dotacion: number | null;
  asistentes: number | null;
  cada_dias: number | null;
  veces: number | null;
  vez: number | null;
  serie_id: string | null;
  vence: string | null;
  lider_id: string | null;
  hunter_id: string | null;
  dueno_id: string | null;
  creada_por: string;
  no_puede_at: string | null;
  no_puede_motivo: string | null;
  prueba: boolean;
  visto_hunter: boolean;
  visto_dueno: boolean;
  created_at: string;
  updated_at: string;
}

/** Row of gestion_prospectos. */
export interface ProspectRow {
  id: string;
  gestion_id: string;
  nombre: string;
  estado: string;
  cuil: string | null;
  paquete: string | null;
  contacto: string | null;
  referencia: string | null;
  motivo: string | null;
  proximo: string | null;
  fecha_alta: string | null;
  renta: string | null;
  creado_por: string;
  created_at: string;
  updated_at: string;
}

/** Row of gestion_mensajes. */
export interface MessageRow {
  id: string;
  gestion_id: string;
  autor: string;
  tipo: string;
  texto: string;
  created_at: string;
}

/** Row of gestion_leido. */
export interface ReadMarkRow {
  gestion_id: string;
  user_id: string;
  at: string;
}

/** Row of gestion_eventos. */
export interface EventRow {
  id: string;
  gestion_id: string;
  quien: string;
  que: string;
  detalle: Record<string, unknown>;
  at: string;
}

/** Row of padron_empresas. */
export interface CompanyRow {
  id: number;
  user_id: string;
  empresa: string;
  cuits: string[];
  config: string;
  asesores: { nombre: string; celular: string; email: string }[];
  rubro: string | null;
  created_at: string;
}

export interface CommercialDb {
  actions: ActionRow[];
  prospects: ProspectRow[];
  messages: MessageRow[];
  readMarks: ReadMarkRow[];
  events: EventRow[];
  companies: CompanyRow[];
  /** Value of the app_flags row that turns commercial actions on. */
  flag: string;
  sequence: number;
}
