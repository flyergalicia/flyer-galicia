// The questions of Gestiones, as promises: an action reads from top to bottom, and what it asks is
// drawn here. One at a time: a new question takes the place of the one on screen.
import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "@/shared/ui/index.ts";
import { ChoiceWindow } from "../ui/ChoiceWindow.tsx";

export interface YesNoQuestion {
  readonly title: string;
  readonly text?: string;
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  readonly isSafe?: boolean;
}

export interface ChoiceQuestion {
  readonly title: string;
  readonly text: string;
  readonly choices: Readonly<Record<string, string>>;
}

type Asking =
  | { readonly kind: "yes"; readonly question: YesNoQuestion }
  | { readonly kind: "choice"; readonly question: ChoiceQuestion };

export interface Questions {
  readonly askYes: (question: YesNoQuestion) => Promise<boolean>;
  /** The key of what was chosen; null if it was cancelled. */
  readonly askChoice: (question: ChoiceQuestion) => Promise<string | null>;
}

export function useQuestions(): Questions & { readonly dialogs: ReactNode } {
  const [asking, setAsking] = useState<Asking | null>(null);
  const answer = useRef<(value: string | boolean | null) => void>(() => undefined);
  const ask = useCallback(
    (next: Asking) =>
      new Promise<string | boolean | null>((resolve) => {
        answer.current = (value) => {
          setAsking(null);
          resolve(value);
        };
        setAsking(next);
      }),
    [],
  );
  const askers = useMemo<Questions>(
    () => ({
      askYes: async (question) => (await ask({ kind: "yes", question })) === true,
      askChoice: async (question) => {
        const reply = await ask({ kind: "choice", question });
        return typeof reply === "string" ? reply : null;
      },
    }),
    [ask],
  );
  let dialogs: ReactNode = null;
  if (asking?.kind === "choice") {
    dialogs = <ChoiceWindow {...asking.question} onAnswer={(value) => answer.current(value)} />;
  } else if (asking?.kind === "yes") {
    const { title, text, confirmLabel, cancelLabel, isSafe = false } = asking.question;
    dialogs = (
      <ConfirmDialog
        title={title}
        confirmLabel={confirmLabel}
        {...(cancelLabel ? { cancelLabel } : {})}
        danger={!isSafe}
        onConfirm={() => {
          answer.current(true);
        }}
        onCancel={() => {
          answer.current(false);
        }}
      >
        {text}
      </ConfirmDialog>
    );
  }
  return { ...askers, dialogs };
}
