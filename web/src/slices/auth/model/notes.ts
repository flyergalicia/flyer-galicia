// The notes of a person: in this browser only, under a key of their own.

export interface Note {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly updated: number;
}

export interface NotesState {
  readonly notes: readonly Note[];
  readonly activeId: string;
}

export function notesKey(userId: string): string {
  return `fg_notes_${userId}`;
}

function field(row: object, key: string): unknown {
  return Reflect.get(row, key);
}

function isNote(row: unknown): row is Note {
  return (
    typeof row === "object" &&
    row !== null &&
    typeof field(row, "id") === "string" &&
    typeof field(row, "title") === "string" &&
    typeof field(row, "body") === "string"
  );
}

/** What is saved can be anything, and the browser can refuse to read it. */
export function readNotes(storage: Pick<Storage, "getItem">, userId: string): readonly Note[] {
  try {
    const saved: unknown = JSON.parse(storage.getItem(notesKey(userId)) ?? "[]");
    return Array.isArray(saved) ? saved.filter(isNote) : [];
  } catch {
    return [];
  }
}

export function saveNotes(
  storage: Pick<Storage, "setItem">,
  userId: string,
  notes: readonly Note[],
): void {
  try {
    storage.setItem(notesKey(userId), JSON.stringify(notes));
  } catch {
    // Without storage the notes last until the window closes.
  }
}

export function newNoteId(now: number, random: number = Math.random()): string {
  return `n${String(now)}${random.toString(36).slice(2, 6)}`;
}

function blankNote(id: string, position: number, now: number): Note {
  return { id, title: `Nota ${String(position)}`, body: "", updated: now };
}

/** There is always one to write on. */
export function openNotes(saved: readonly Note[], id: string, now: number): NotesState {
  const notes = saved.length > 0 ? saved : [blankNote(id, 1, now)];
  return { notes, activeId: notes[0]?.id ?? id };
}

export function addNote({ notes }: NotesState, id: string, now: number): NotesState {
  return { notes: [blankNote(id, notes.length + 1, now), ...notes], activeId: id };
}

export function editNote(
  state: NotesState,
  change: Pick<Note, "title" | "body">,
  now: number,
): NotesState {
  return {
    ...state,
    notes: state.notes.map((note) =>
      note.id === state.activeId ? { ...note, ...change, updated: now } : note,
    ),
  };
}

export function removeNote(state: NotesState, id: string, now: number): NotesState {
  return openNotes(
    state.notes.filter((note) => note.id !== state.activeId),
    id,
    now,
  );
}

export function moveNote(state: NotesState, direction: -1 | 1): NotesState {
  const { notes, activeId } = state;
  const from = notes.findIndex((note) => note.id === activeId);
  const to = from + direction;
  const moving = notes[from];
  const other = notes[to];
  if (!moving || !other) return state;
  return {
    ...state,
    notes: notes.map((note, index) => {
      if (index === from) return other;
      return index === to ? moving : note;
    }),
  };
}

const NO_NOTE: Note = { id: "", title: "", body: "", updated: 0 };

export function activeNote({ notes, activeId }: NotesState): Note {
  return notes.find((note) => note.id === activeId) ?? NO_NOTE;
}
