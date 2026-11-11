// Config → Legales: the legal text of every option, read together; what is typed in each tab stays
// in that tab, and saving one tells the editor that option changed.
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useFlyerChanges } from "@/shared/lib/flyer-changes/flyer-changes.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { LEGAL_SHEET_KEY, readLegalFile, saveLegalFile } from "../api/config-files.ts";
import { legalSavedText } from "./legal-sheet.ts";

export interface LegalOfOption {
  /** Null while it is read, or if it could not be. */
  readonly text: string | null;
  readonly failure: string;
  readonly saving: boolean;
  readonly error: string;
  readonly ok: string;
}

export interface LegalSheet {
  readonly of: (option: number) => LegalOfOption;
  readonly write: (option: number, text: string) => void;
  readonly save: (option: number, label: string) => Promise<void>;
  readonly reload: (option: number) => void;
}

interface Said {
  readonly error: string;
  readonly ok: string;
}

const NOTHING_SAID: Said = { error: "", ok: "" };

function legalKey(option: number) {
  return [...LEGAL_SHEET_KEY, option] as const;
}

export function useLegalSheet(options: readonly number[]): LegalSheet {
  const { bucket } = useBackend();
  const queryClient = useQueryClient();
  const { announce } = useFlyerChanges();
  const { show } = useToast();
  const reads = useQueries({
    queries: options.map((option) => ({
      queryKey: legalKey(option),
      queryFn: () => readLegalFile(bucket, option),
      staleTime: 0,
    })),
  });
  const [edits, setEdits] = useState<ReadonlyMap<number, string>>(new Map());
  const [said, setSaid] = useState<ReadonlyMap<number, Said>>(new Map());
  const [saving, setSaving] = useState<ReadonlySet<number>>(new Set());

  const readOf = (option: number) => reads[options.indexOf(option)];
  const textOf = (option: number): string | null => {
    const read = readOf(option);
    if (!read || read.isError) return null;
    return edits.get(option) ?? read.data ?? null;
  };
  const forget = (option: number) => {
    setEdits((current) => {
      const next = new Map(current);
      next.delete(option);
      return next;
    });
  };
  const say = (option: number, words: Said) => {
    setSaid((current) => new Map(current).set(option, words));
  };
  const setBusy = (option: number, busy: boolean) => {
    setSaving((current) => {
      const next = new Set(current);
      if (busy) next.add(option);
      else next.delete(option);
      return next;
    });
  };

  const save = async (option: number, label: string) => {
    const text = textOf(option);
    if (text === null || saving.has(option)) return;
    say(option, NOTHING_SAID);
    setBusy(option, true);
    const saved = await saveLegalFile(bucket, option, text, new Date());
    setBusy(option, false);
    if (!saved.ok) {
      say(option, { error: `Error: ${saved.error}`, ok: "" });
      return;
    }
    queryClient.setQueryData(legalKey(option), text);
    forget(option);
    say(option, { error: "", ok: legalSavedText(label) });
    // The editor forgets that option and brings it again, with this legal text.
    announce(option);
    show(`Legal de ${label} actualizado`);
  };

  return {
    of: (option) => {
      const read = readOf(option);
      return {
        text: textOf(option),
        failure: read?.isError ? read.error.message : "",
        saving: saving.has(option),
        ...(said.get(option) ?? NOTHING_SAID),
      };
    },
    write: (option, text) => {
      setEdits((current) => new Map(current).set(option, text));
    },
    save,
    reload: (option) => {
      forget(option);
      void readOf(option)?.refetch();
    },
  };
}
