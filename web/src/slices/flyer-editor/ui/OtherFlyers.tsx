import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { normalizeText } from "@/shared/domain/promotions/index.ts";
import { type FlyerOption, optionColor, optionLabel } from "@/shared/domain/flyer-options.ts";
import { useWorkspaceValue } from "@/shared/lib/flyer-workspace/index.ts";
import { type BarParts, otherFlyersList } from "../model/option-bar.ts";
import styles from "./FlyerEditorView.module.css";

const SEARCH_FROM = 6;
const GAP = 6;
const MARGIN = 8;
const WIDEST = 320;

interface OtherFlyersProps {
  /** What it hangs from. */
  readonly bar: RefObject<HTMLDivElement | null>;
  readonly allowed: readonly number[];
  readonly parts: BarParts;
  readonly options: readonly FlyerOption[];
  readonly onChoose: (option: number) => void;
  readonly onStar: (option: number) => void;
  readonly onClose: () => void;
}

export function StarIcon({ className }: { readonly className?: string | undefined }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
    </svg>
  );
}

/** Under the bar, on its right, where "Otros" is. */
function placeUnderBar(list: HTMLElement, bar: HTMLElement | null): void {
  if (!bar) return;
  const box = bar.getBoundingClientRect();
  const width = Math.min(WIDEST, box.width);
  list.style.width = `${String(width)}px`;
  list.style.left = `${String(Math.max(MARGIN, box.right - width))}px`;
  list.style.top = `${String(box.bottom + GAP)}px`;
}

interface FlyerRowProps {
  readonly option: number;
  readonly isFavorite: boolean;
  readonly options: readonly FlyerOption[];
  readonly onChoose: () => void;
  readonly onStar: () => void;
}

function FlyerRow({ option, isFavorite, options, onChoose, onStar }: FlyerRowProps) {
  const isOnScreen = useWorkspaceValue((state) => state.slot.option === option);
  return (
    <div className={styles.otherRow} data-on={isOnScreen || undefined}>
      <button
        type="button"
        className={styles.otherChoose}
        data-option-row={option}
        onClick={onChoose}
      >
        <span className={styles.otherDot} style={{ background: optionColor(options, option) }} />
        <span className={styles.otherName} data-testid="other-flyer">
          {optionLabel(options, option)}
        </span>
      </button>
      <button
        type="button"
        className={styles.star}
        aria-pressed={isFavorite}
        aria-label={isFavorite ? "Sacar de favorito" : "Fijar como favorito"}
        title={isFavorite ? "Es tu favorito (tocá para sacarlo)" : "Fijar como tu favorito"}
        data-star={option}
        onClick={onStar}
      >
        <StarIcon />
      </button>
    </div>
  );
}

/** The flyers that do not fit on the bar, with a search box if there are many and their stars. */
export function OtherFlyers({
  bar,
  allowed,
  parts,
  options,
  onChoose,
  onStar,
  onClose,
}: OtherFlyersProps) {
  const [query, setQuery] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const flyers = otherFlyersList(allowed, parts);
  const hasSearch = flyers.length > SEARCH_FROM;
  const wanted = normalizeText(query);
  const shown = flyers.filter(
    (option) => !wanted || normalizeText(optionLabel(options, option)).includes(wanted),
  );

  useLayoutEffect(() => {
    if (box.current) placeUnderBar(box.current, bar.current);
  });

  useEffect(() => {
    field.current?.focus();
  }, []);

  useEffect(() => {
    const onPress = ({ target }: PointerEvent) => {
      const isOurs = target instanceof Element && target.closest("[data-keeps-others-open]");
      if (!isOurs && target instanceof Node && !box.current?.contains(target)) onClose();
    };
    /** Even with the focus elsewhere: pressing a star draws the list again. */
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    };
    /** It goes along with the bar: closing here would close it on opening it. */
    const onScroll = ({ target }: Event) => {
      if (box.current && !(target instanceof Node && box.current.contains(target))) {
        placeUnderBar(box.current, bar.current);
      }
    };
    document.addEventListener("pointerdown", onPress);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onPress);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [bar, onClose]);

  const choose = (option: number) => {
    onClose();
    onChoose(option);
  };

  return createPortal(
    <section
      ref={box}
      className={styles.otherList}
      aria-label="Otros flyers"
      data-testid="other-flyers-list"
    >
      {hasSearch && (
        <input
          ref={field}
          type="search"
          className={styles.otherSearch}
          placeholder="Buscar flyer"
          aria-label="Buscar flyer"
          autoComplete="off"
          value={query}
          onChange={({ target }) => {
            setQuery(target.value);
          }}
          onKeyDown={(event) => {
            const [first] = shown;
            if (event.key !== "Enter" || first === undefined) return;
            event.preventDefault();
            choose(first);
          }}
        />
      )}
      <div className={styles.otherHelp}>
        Tocá la <StarIcon /> para dejar uno siempre a la vista como tu favorito.
      </div>
      <div>
        {shown.length === 0 && (
          <div className={styles.otherNone}>No hay flyers con ese nombre.</div>
        )}
        {shown.map((option) => (
          <FlyerRow
            key={option}
            option={option}
            isFavorite={option === parts.favorite}
            options={options}
            onChoose={() => {
              choose(option);
            }}
            onStar={() => {
              onStar(option);
            }}
          />
        ))}
      </div>
    </section>,
    document.body,
  );
}
