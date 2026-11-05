// The questions of Estudio, as promises: an action reads from top to bottom, and what it asks is drawn
// here. One at a time: a new question takes the place of the one on screen.
import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "@/shared/ui/index.ts";
import { type TextQuestion, TextWindow } from "../ui/TextWindow.tsx";

export interface YesNoQuestion {
  readonly title: string;
  readonly text: string;
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  readonly isSafe?: boolean;
}

type Asking =
  | { readonly kind: "text"; readonly question: TextQuestion }
  | { readonly kind: "yes"; readonly question: YesNoQuestion };

export interface StudioDialogs {
  readonly askText: (question: TextQuestion) => Promise<string | null>;
  readonly askYes: (question: YesNoQuestion) => Promise<boolean>;
}

export function useStudioDialogs(): StudioDialogs & { readonly dialogs: ReactNode } {
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
  const askers = useMemo<StudioDialogs>(
    () => ({
      askText: async (question) => {
        const reply = await ask({ kind: "text", question });
        return typeof reply === "string" ? reply : null;
      },
      askYes: async (question) => (await ask({ kind: "yes", question })) === true,
    }),
    [ask],
  );
  let dialogs: ReactNode = null;
  if (asking?.kind === "text") {
    dialogs = <TextWindow {...asking.question} onAnswer={(value) => answer.current(value)} />;
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
