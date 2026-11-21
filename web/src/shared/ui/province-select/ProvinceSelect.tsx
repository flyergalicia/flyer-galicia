// The control of Provincia. In general one is chosen, but sometimes a flyer goes for two: Shift +
// click (or the + of the row) adds another. It keeps looking like a <select>, and touching it opens
// a list of its own, because the one of the browser does not let Shift + click.
import { type KeyboardEvent, type SyntheticEvent, useCallback, useRef, useState } from "react";
import {
  hasSeveralProvinces,
  provincesName,
  titleCase,
  validProvinces,
} from "@/shared/domain/promotions/index.ts";
import { Select } from "../field/controls.tsx";
import { ProvinceMenu } from "./ProvinceMenu.tsx";

const OPENING_KEYS = new Set([" ", "Enter", "ArrowDown", "ArrowUp"]);

type ProvinceSelectProps = {
  /** The provinces of the list, with the names of the catalog. */
  readonly provinces: readonly string[];
  /** What is chosen: several go joined by ";". Empty: all of them. */
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** What the first row says. */
  readonly allLabel: string;
  readonly disabled?: boolean;
  /** Without a list to choose from, what it says instead. */
  readonly disabledLabel?: string;
  readonly className?: string;
  /** "native" leaves the arrow of the browser. */
  readonly appearance?: "custom" | "native";
  readonly "data-testid"?: string;
  readonly "aria-label"?: string;
};

export function ProvinceSelect({
  provinces,
  value,
  onChange,
  allLabel,
  disabled = false,
  disabledLabel,
  ...rest
}: ProvinceSelectProps) {
  const select = useRef<HTMLSelectElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const chosen = validProvinces(value, provinces);
  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggle = (event: SyntheticEvent) => {
    if (disabled) return;
    event.preventDefault();
    select.current?.focus();
    setIsOpen((open) => !open);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLSelectElement>) => {
    // With the list open, the keyboard is of the list.
    if (!isOpen && OPENING_KEYS.has(event.key)) toggle(event);
  };

  return (
    <>
      <Select
        {...rest}
        ref={select}
        disabled={disabled}
        value={disabled ? "" : chosen}
        title="Shift + clic para sumar otra provincia"
        onChange={(event) => {
          onChange(event.target.value);
        }}
        onMouseDown={(event) => {
          if (event.button === 0) toggle(event);
        }}
        onTouchEnd={toggle}
        onKeyDown={onKeyDown}
      >
        <option value="">{disabled && disabledLabel ? disabledLabel : allLabel}</option>
        {provinces.map((province) => (
          <option key={province} value={province}>
            {titleCase(province)}
          </option>
        ))}
        {hasSeveralProvinces(chosen) && <option value={chosen}>{provincesName(chosen)}</option>}
      </Select>
      {isOpen && (
        <ProvinceMenu
          anchor={select}
          provinces={provinces}
          chosen={chosen}
          allLabel={allLabel}
          onChange={onChange}
          onClose={close}
        />
      )}
    </>
  );
}
