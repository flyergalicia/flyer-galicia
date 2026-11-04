import {
  createContext,
  type ReactNode,
  useContext,
  useId,
  useMemo,
  useRef,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "../icon/Icon.tsx";
import { useDialog } from "./use-dialog.ts";
import styles from "./Modal.module.css";

export type ModalSize = "narrow" | "regular" | "medium" | "wide";
/** "account": the windows of one's own account and of the users of the panel. */
export type ModalLook = "window" | "account";

type ModalContextValue = {
  readonly titleId: string;
  readonly close: () => void;
};

const ModalContext = createContext<ModalContextValue | null>(null);

function useModal(part: string): ModalContextValue {
  const modal = useContext(ModalContext);
  if (!modal) throw new Error(`Modal.${part} must be inside a Modal`);
  return modal;
}

type ModalProps = {
  readonly onClose: () => void;
  readonly size?: ModalSize;
  readonly look?: ModalLook;
  /** A window with work in progress only closes with its X or with Escape. */
  readonly closeOnBackdrop?: boolean;
  readonly children: ReactNode;
};

export function ModalRoot({
  onClose,
  size = "regular",
  look = "window",
  closeOnBackdrop = true,
  children,
}: ModalProps) {
  const titleId = useId();
  const panel = useRef<HTMLDialogElement>(null);
  useDialog(panel, onClose);
  const context = useMemo(() => ({ titleId, close: onClose }), [titleId, onClose]);
  // Only a press that starts and ends on the backdrop closes: dragging out of a field does not.
  const pressedBackdrop = useRef(false);
  const onMouseDown = (event: MouseEvent) => {
    pressedBackdrop.current = event.target === event.currentTarget;
  };
  const onClick = (event: MouseEvent) => {
    if (closeOnBackdrop && pressedBackdrop.current && event.target === event.currentTarget) {
      onClose();
    }
  };
  return createPortal(
    <ModalContext.Provider value={context}>
      {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- the mouse way of closing what Escape closes */}
      <div
        className={look === "account" ? `${styles.overlay} ${styles.account}` : styles.overlay}
        onMouseDown={onMouseDown}
        onClick={onClick}
      >
        <dialog
          ref={panel}
          open
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className={`${styles.panel} ${styles[size]}`}
        >
          {children}
        </dialog>
      </div>
    </ModalContext.Provider>,
    document.body,
  );
}

type ModalHeaderProps = {
  readonly icon?: IconName;
  readonly children: ReactNode;
};

export function ModalHeader({ icon, children }: ModalHeaderProps) {
  const { titleId, close } = useModal("Header");
  return (
    <div className={styles.header}>
      <h2 id={titleId} className={styles.title}>
        {icon && <Icon name={icon} size={17} className={styles.titleIcon} />}
        {children}
      </h2>
      <button type="button" className={styles.close} aria-label="Cerrar" onClick={close}>
        {"\u2715"}
      </button>
    </div>
  );
}

export function ModalBody({ children }: { readonly children: ReactNode }) {
  useModal("Body");
  return <div className={styles.body}>{children}</div>;
}

export function ModalFooter({ children }: { readonly children: ReactNode }) {
  useModal("Footer");
  return <div className={styles.footer}>{children}</div>;
}
