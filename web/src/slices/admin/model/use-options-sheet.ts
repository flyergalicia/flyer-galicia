// Config → Opciones: the list read fresh on opening, the copy being edited, what each one has active,
// and saving the whole list for everybody.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { FlyerOption } from "@/shared/domain/flyer-options.ts";
import { saveFlyerList } from "@/shared/lib/app-config/flyer-list-store.ts";
import { FLYER_OPTIONS_QUERY_KEY } from "@/shared/lib/app-config/flyer-options-query.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { OPTIONS_SHEET_KEY, readOptionsFile } from "../api/config-files.ts";
import { readActiveFlyers } from "../api/flyer-files.ts";
import {
  type ActiveNames,
  activeNameOf,
  type DraftField,
  draftsOf,
  listToSave,
  type OptionDraft,
  savedOptionsText,
  withDraftField,
  withNewOption,
  withoutOption,
} from "./options-sheet.ts";

export interface OptionsSheet {
  /** What is saved, which decides which one is current for its category. */
  readonly saved: readonly FlyerOption[] | null;
  /** Null while it is read, or if it could not be. */
  readonly drafts: readonly OptionDraft[] | null;
  readonly active: ActiveNames | undefined;
  readonly failure: string;
  readonly saving: boolean;
  /** The number of the last one added: its name takes the cursor. */
  readonly added: number | null;
  readonly set: (index: number, field: DraftField, value: string) => void;
  readonly add: () => void;
  readonly remove: (index: number) => void;
  readonly save: () => Promise<void>;
  readonly reload: () => void;
}

const ACTIVE_KEY = ["admin", "options", "active"] as const;

function useActiveNames(numbers: readonly number[]): ActiveNames | undefined {
  const { bucket } = useBackend();
  const read = useQuery({
    queryKey: [...ACTIVE_KEY, numbers.join(",")],
    queryFn: async (): Promise<ActiveNames> => {
      const active = await readActiveFlyers(bucket, numbers);
      return new Map([...active].map(([option, flyer]) => [option, activeNameOf(flyer)]));
    },
    enabled: numbers.length > 0,
    staleTime: 0,
  });
  return read.data;
}

export function useOptionsSheet(): OptionsSheet {
  const { bucket } = useBackend();
  const queryClient = useQueryClient();
  const { show } = useToast();
  const read = useQuery({
    queryKey: OPTIONS_SHEET_KEY,
    queryFn: () => readOptionsFile(bucket),
    staleTime: 0,
  });
  const [edits, setEdits] = useState<readonly OptionDraft[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [added, setAdded] = useState<number | null>(null);
  const saved = read.isError ? null : (read.data ?? null);
  const drafts = useMemo(() => edits ?? (saved ? draftsOf(saved) : null), [edits, saved]);
  const numbers = useMemo(() => (saved ?? []).map(({ n }) => n), [saved]);
  const active = useActiveNames(numbers);
  const change = (next: (current: readonly OptionDraft[]) => readonly OptionDraft[]) => {
    if (drafts) setEdits(next(drafts));
  };

  const save = async () => {
    if (!drafts || !saved || saving) return;
    setSaving(true);
    const written = await saveFlyerList(bucket, listToSave(drafts));
    setSaving(false);
    if (!written.ok) {
      show(`Error al guardar las opciones: ${written.error}`);
      return;
    }
    queryClient.setQueryData(OPTIONS_SHEET_KEY, written.value);
    // Everything that comes from the list is rebuilt: Facultades, Legales, Config → Flyer, the bar.
    queryClient.setQueryData(FLYER_OPTIONS_QUERY_KEY, written.value);
    void queryClient.invalidateQueries({ queryKey: FLYER_OPTIONS_QUERY_KEY });
    setEdits(null);
    setAdded(null);
    show(savedOptionsText(numbers, written.value));
  };

  return {
    saved,
    drafts,
    active,
    failure: read.isError ? read.error.message : "",
    saving,
    added,
    set: (index, field, value) => {
      change((current) => withDraftField(current, index, field, value));
    },
    add: () => {
      if (!drafts) return;
      const next = withNewOption(drafts);
      setEdits(next);
      setAdded(next.at(-1)?.n ?? null);
    },
    remove: (index) => {
      change((current) => withoutOption(current, index));
    },
    save,
    reload: () => {
      setEdits(null);
      setAdded(null);
      void read.refetch();
    },
  };
}
