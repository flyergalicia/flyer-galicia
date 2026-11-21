import { describe, expect, it } from "vitest";
import {
  activeNote,
  addNote,
  editNote,
  moveNote,
  newNoteId,
  type Note,
  type NotesState,
  notesKey,
  openNotes,
  readNotes,
  removeNote,
  saveNotes,
} from "./notes.ts";

const NOW = 1000;

function note(id: string): Note {
  return { id, title: id, body: "", updated: 0 };
}

function state(...ids: readonly string[]): NotesState {
  return { notes: ids.map(note), activeId: ids[0] ?? "" };
}

function storageWith(text: string | null) {
  return { getItem: () => text };
}

describe("reading what is saved", () => {
  it("each person has their own key", () => {
    expect(notesKey("u1")).toBe("fg_notes_u1");
  });

  it("keeps only what looks like a note", () => {
    const saved = JSON.stringify([note("a"), { id: "b" }, "texto", null]);

    expect(readNotes(storageWith(saved), "u1").map(({ id }) => id)).toEqual(["a"]);
  });

  it("does not break with what is not a list", () => {
    expect(readNotes(storageWith(null), "u1")).toEqual([]);
    expect(readNotes(storageWith("{}"), "u1")).toEqual([]);
    expect(readNotes(storageWith("no es json"), "u1")).toEqual([]);
  });

  it("does not break if the browser refuses", () => {
    const refusing = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };

    expect(readNotes(refusing, "u1")).toEqual([]);
    expect(() => {
      saveNotes(refusing, "u1", []);
    }).not.toThrow();
  });

  it("saves under that key", () => {
    const saved: [string, string][] = [];
    const storage = {
      setItem: (key: string, value: string) => {
        saved.push([key, value]);
      },
    };

    saveNotes(storage, "u1", [note("a")]);

    expect(saved).toEqual([["fg_notes_u1", JSON.stringify([note("a")])]]);
  });
});

describe("the notes", () => {
  it("have ids that do not repeat", () => {
    expect(newNoteId(NOW, 0.123_456)).toMatch(/^n1000[a-z0-9]+$/);
    expect(newNoteId(NOW)).not.toBe(newNoteId(NOW));
  });

  it("always have one to write on", () => {
    const opened = openNotes([], "x", NOW);

    expect(opened.notes).toEqual([{ id: "x", title: "Nota 1", body: "", updated: NOW }]);
    expect(opened.activeId).toBe("x");
    expect(openNotes([note("a"), note("b")], "x", NOW).activeId).toBe("a");
  });

  it("a new one goes first and takes the next number", () => {
    const added = addNote(state("a", "b"), "c", NOW);

    expect(added.notes.map(({ id }) => id)).toEqual(["c", "a", "b"]);
    expect(activeNote(added)?.title).toBe("Nota 3");
  });

  it("editing touches only the active one", () => {
    const edited = editNote(state("a", "b"), { title: "T", body: "B" }, NOW);

    expect(edited.notes[0]).toEqual({ id: "a", title: "T", body: "B", updated: NOW });
    expect(edited.notes[1]).toEqual(note("b"));
  });

  it("removing the last one leaves a blank one", () => {
    expect(removeNote(state("a", "b"), "x", NOW).notes.map(({ id }) => id)).toEqual(["b"]);
    expect(removeNote(state("a"), "x", NOW).notes[0]?.title).toBe("Nota 1");
  });

  it("without an active one there is nothing to show", () => {
    expect(activeNote({ notes: [], activeId: "x" }).title).toBe("");
  });

  it("move up and down, and stop at the ends", () => {
    const three = { ...state("a", "b", "c"), activeId: "b" };

    expect(moveNote(three, -1).notes.map(({ id }) => id)).toEqual(["b", "a", "c"]);
    expect(moveNote(three, 1).notes.map(({ id }) => id)).toEqual(["a", "c", "b"]);
    expect(moveNote(state("a", "b"), -1).notes.map(({ id }) => id)).toEqual(["a", "b"]);
    expect(moveNote({ ...state("a"), activeId: "x" }, 1).notes.map(({ id }) => id)).toEqual(["a"]);
  });
});
