import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./ShortcutTip.module.css";

const WAIT_MS = 400;
const GAP = 9;
const MARGIN = 8;
const REAL_MOUSE = "(hover:hover) and (pointer:fine)";

function modifierKey(): string {
  return /Mac|iPhone|iPad|iPod/.test(`${navigator.platform} ${navigator.userAgent}`) ? "⌘" : "Ctrl";
}

function place(tip: HTMLElement, button: DOMRect): void {
  const { width, height } = tip.getBoundingClientRect();
  const center = button.left + button.width / 2;
  const left = Math.max(
    MARGIN,
    Math.min(Math.round(center - width / 2), window.innerWidth - width - MARGIN),
  );
  const above = button.top - height - GAP;
  const fitsAbove = above >= MARGIN;
  tip.dataset.below = String(!fitsAbove);
  tip.style.left = `${String(left)}px`;
  tip.style.top = `${String(Math.round(fitsAbove ? above : button.bottom + GAP))}px`;
  // The arrow points at the middle of the button, even if the tip moved to stay on the screen.
  tip.style.setProperty("--tip-arrow", `${String(Math.round(center - left))}px`);
}

export interface ShortcutTip {
  /** Goes on the button, whichever it is: a wrapper around it would change its layout. */
  readonly target: {
    readonly onMouseEnter: (event: { readonly currentTarget: HTMLElement }) => void;
    readonly onMouseLeave: () => void;
    readonly onPointerDown: () => void;
  };
  readonly element: ReactNode;
}

/**
 * The tip of a button that has a key: Ctrl + Enter, and ⌘ on a Mac. Its own, because the one of the
 * browser takes a second and comes in the letter of the system. Only with a real mouse: on a phone
 * there is no keyboard. The button does not change size: the tip goes over it.
 */
export function useShortcutTip(key: string): ShortcutTip {
  const [button, setButton] = useState<DOMRect | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tip = useRef<HTMLDivElement>(null);

  const hide = useCallback(() => {
    clearTimeout(timer.current);
    setButton(null);
  }, []);

  useEffect(() => hide, [hide]);

  useLayoutEffect(() => {
    if (button && tip.current) place(tip.current, button);
  }, [button]);

  useEffect(() => {
    if (!button) return undefined;
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    window.addEventListener("blur", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
      window.removeEventListener("blur", hide);
    };
  }, [button, hide]);

  return {
    target: {
      onMouseEnter: ({ currentTarget }) => {
        if (!window.matchMedia(REAL_MOUSE).matches) return;
        hide();
        timer.current = setTimeout(() => {
          setButton(currentTarget.getBoundingClientRect());
        }, WAIT_MS);
      },
      onMouseLeave: hide,
      // On pressing it, it gets in the way of what comes next.
      onPointerDown: hide,
    },
    element:
      button &&
      createPortal(
        <div ref={tip} role="tooltip" className={styles.tip}>
          <kbd>{modifierKey()}</kbd> + <kbd>{key}</kbd>
        </div>,
        document.body,
      ),
  };
}
