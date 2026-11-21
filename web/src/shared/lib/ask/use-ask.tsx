import { type ReactNode, useCallback, useMemo, useState } from "react";
import { ConfirmDialog } from "@/shared/ui/index.ts";

export interface Question {
  /** The first line is the title, and what follows goes under it. */
  readonly message: string;
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  readonly onYes: () => void;
}

export type Ask = (question: Question) => void;

/** One question at a time, with the window of the app. */
export function useAsk(): { readonly ask: Ask; readonly question: ReactNode } {
  const [current, setCurrent] = useState<Question | null>(null);
  const ask = useCallback<Ask>((question) => {
    setCurrent(question);
  }, []);
  const question = useMemo(() => {
    if (!current) return null;
    const [title = "", ...rest] = current.message.split(/\n+/);
    return (
      <ConfirmDialog
        title={title}
        danger
        confirmLabel={current.confirmLabel}
        {...(current.cancelLabel === undefined ? {} : { cancelLabel: current.cancelLabel })}
        onCancel={() => {
          setCurrent(null);
        }}
        onConfirm={() => {
          setCurrent(null);
          current.onYes();
        }}
      >
        {rest.join("\n")}
      </ConfirmDialog>
    );
  }, [current]);
  return { ask, question };
}
