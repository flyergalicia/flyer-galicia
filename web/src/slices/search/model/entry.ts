// One thing the search of screens can take to: a screen, a flyer, a panel, a sheet, something of the
// account. Who decides what there is, and what each one does, is the app: here they are only searched.

export interface SearchEntry {
  /** It is what is remembered among the recent ones (`fg_cmdk_rec`): the same as today's. */
  readonly id: string;
  /** Where it is: Pantallas, Armador, Base de datos... */
  readonly group: string;
  readonly title: string;
  /** Other words it is also found with. */
  readonly keywords?: string | undefined;
  /** It is where the person is now: "Estás acá". */
  readonly current?: boolean | undefined;
  /** Leaving the session is not remembered. */
  readonly forgotten?: boolean | undefined;
}

/** Without capitals or accents: "Auditoría" is found with "auditoria". */
export function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
