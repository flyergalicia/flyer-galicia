import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Toast } from "@/shared/ui/index.ts";
import { type ToastActions, ToastContext } from "./toast-context.ts";

export const TOAST_MS = 3000;

interface Notice {
  readonly text: string;
  readonly visible: boolean;
}

/**
 * The floating notice of the whole app. It stays in the page with its last text while it fades out.
 * Whoever only shows notices does not draw again: the actions live in a context that never changes.
 */
export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const [notice, setNotice] = useState<Notice>({ text: "", visible: false });
  const current = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  const actions = useMemo<ToastActions>(
    () => ({
      show: (text) => {
        current.current = text;
        setNotice({ text, visible: true });
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          setNotice({ text, visible: false });
        }, TOAST_MS);
      },
      hide: (text) => {
        if (current.current !== text) return;
        clearTimeout(timer.current);
        setNotice({ text, visible: false });
      },
    }),
    [],
  );

  return (
    <ToastContext.Provider value={actions}>
      {children}
      <Toast visible={notice.visible}>{notice.text}</Toast>
    </ToastContext.Provider>
  );
}
