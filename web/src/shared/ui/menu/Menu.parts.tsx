import {
  createContext,
  type KeyboardEvent,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Icon, type IconName } from "../icon/Icon.tsx";
import styles from "./Menu.module.css";

type MenuContextValue = {
  readonly menuId: string;
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
};

const MenuContext = createContext<MenuContextValue | null>(null);

function useMenu(part: string): MenuContextValue {
  const menu = useContext(MenuContext);
  if (!menu) throw new Error(`Menu.${part} must be inside a Menu`);
  return menu;
}

type MenuProps = {
  /** Starts open. It is for showing a state; people open it with the trigger. */
  readonly defaultOpen?: boolean;
  readonly children: ReactNode;
};

export function MenuRoot({ defaultOpen = false, children }: MenuProps) {
  const menuId = useId();
  const [open, setOpen] = useState(defaultOpen);
  const root = useRef<HTMLDivElement>(null);
  const context = useMemo(() => ({ menuId, open, setOpen }), [menuId, open]);

  useEffect(() => {
    if (!open) return undefined;
    const onPress = (event: Event) => {
      const { target } = event;
      if (!(target instanceof Node && root.current?.contains(target))) setOpen(false);
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPress);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPress);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <MenuContext.Provider value={context}>
      <div ref={root} className={styles.root}>
        {children}
      </div>
    </MenuContext.Provider>
  );
}

type TriggerProps = {
  readonly label: string;
  readonly className?: string;
  readonly children: ReactNode;
};

export function MenuTrigger({ label, className, children }: TriggerProps) {
  const { menuId, open, setOpen } = useMenu("Trigger");
  return (
    <button
      type="button"
      aria-label={label}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={menuId}
      className={className}
      onClick={() => {
        setOpen(!open);
      }}
    >
      {children}
    </button>
  );
}

function moveFocus(event: KeyboardEvent<HTMLDivElement>): void {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')];
  const { target } = event;
  const index = target instanceof HTMLElement ? items.indexOf(target) : -1;
  const step = event.key === "ArrowDown" ? 1 : -1;
  event.preventDefault();
  items[(index + step + items.length) % items.length]?.focus();
}

export function MenuList({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  const { menuId, open } = useMenu("List");
  if (!open) return null;
  return (
    <div
      id={menuId}
      role="menu"
      tabIndex={-1}
      aria-label={label}
      className={styles.list}
      onKeyDown={moveFocus}
    >
      {children}
    </div>
  );
}

type ItemProps = {
  readonly icon?: IconName;
  /** Leaving the app and the like: it only looks different under the mouse. */
  readonly danger?: boolean;
  /** Keep the menu open after pressing it, as when changing the look. */
  readonly keepOpen?: boolean;
  readonly onSelect: () => void;
  readonly children: ReactNode;
};

export function MenuItem({
  icon,
  danger = false,
  keepOpen = false,
  onSelect,
  children,
}: ItemProps) {
  const { setOpen } = useMenu("Item");
  return (
    <button
      type="button"
      role="menuitem"
      className={danger ? `${styles.item} ${styles.danger}` : styles.item}
      onClick={() => {
        onSelect();
        if (!keepOpen) setOpen(false);
      }}
    >
      {icon && <Icon name={icon} size={16} className={styles.itemIcon} />}
      <span className={styles.itemText}>{children}</span>
    </button>
  );
}

export function MenuSeparator() {
  useMenu("Separator");
  return <hr className={styles.separator} />;
}

export function MenuLabel({ children }: { readonly children: ReactNode }) {
  useMenu("Label");
  return <div className={styles.label}>{children}</div>;
}

/** Who the menu belongs to, on top. */
export function MenuHead({
  name,
  children,
}: {
  readonly name: string;
  readonly children?: ReactNode;
}) {
  useMenu("Head");
  return (
    <div className={styles.head}>
      <div className={styles.name}>{name}</div>
      {children}
    </div>
  );
}
