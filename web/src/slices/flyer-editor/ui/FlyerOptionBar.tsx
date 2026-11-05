import { type CSSProperties, useEffect, useRef, useState } from "react";
import {
  type FlyerOption,
  isFlyerTabId,
  optionColor,
  optionLabel,
  optionTab,
} from "@/shared/domain/flyer-options.ts";
import { allowedOptions, useWorkspaceValue } from "@/shared/lib/flyer-workspace/index.ts";
import { registerProbe } from "@/shared/lib/test-probe.ts";
import { usePermissions } from "@/shared/session/index.ts";
import { OpenWorksRow, useLogoEditorValue } from "@/slices/logo-editor/index.ts";
import { barParts, favoritesAfterStar } from "../model/option-bar.ts";
import { useFavoriteFlyers } from "../model/use-favorite-flyers.ts";
import { useOptionBarGestures } from "../model/use-option-bar-gestures.ts";
import { OtherFlyers, StarIcon } from "./OtherFlyers.tsx";
import styles from "./FlyerEditorView.module.css";

interface FlyerOptionBarProps {
  readonly options: readonly FlyerOption[];
  readonly allowed: readonly number[];
  /** The flyers whose drafts and designs show here: also that of a shared copy. */
  readonly worksOf: readonly number[];
  readonly onChoose: (option: number) => void;
}

function optionStyle(color: string): CSSProperties {
  const style: CSSProperties & { readonly "--option-color": string } = { "--option-color": color };
  return style;
}

function classesOf(...names: readonly (string | false | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}

function RenameField({
  initial,
  onDone,
}: {
  readonly initial: string;
  readonly onDone: (typed: string | null) => void;
}) {
  const [text, setText] = useState(initial);
  return (
    <input
      ref={(input) => {
        if (input && document.activeElement !== input) {
          input.focus();
          input.select();
        }
      }}
      className={styles.renameField}
      aria-label="Nombre del flyer"
      maxLength={40}
      value={text}
      onChange={({ target }) => {
        setText(target.value);
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          onDone(text);
        } else if (event.key === "Escape") onDone(null);
      }}
      onBlur={() => {
        onDone(text);
      }}
      onClick={(event) => {
        event.stopPropagation();
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
    />
  );
}

interface OptionButtonProps {
  readonly option: number;
  readonly options: readonly FlyerOption[];
  readonly isFavorite: boolean;
  readonly hasTitle: boolean;
  readonly isHolding: boolean;
  readonly isLifted: boolean;
  readonly isRenaming: boolean;
  readonly onPress: (option: number) => void;
  readonly onRenamed: (typed: string | null) => void;
}

function OptionButton({
  option,
  options,
  isFavorite,
  hasTitle,
  isHolding,
  isLifted,
  isRenaming,
  onPress,
  onRenamed,
}: OptionButtonProps) {
  const onScreen = useWorkspaceValue((state) => state.slot.option);
  const activeWork = useLogoEditorValue((state) => state.activeWork);
  const isOn = option === onScreen && !activeWork;
  const label = optionLabel(options, option);
  const color = isOn ? optionColor(options, option) : "";
  const titleOf = () => {
    if (isFavorite) {
      return `${label} · tu favorito. Para cambiarlo, tocá la estrellita de otro en «Otros».`;
    }
    return hasTitle ? label : undefined;
  };
  if (isRenaming) {
    return (
      <div className={classesOf(styles.option, styles.renaming)} data-option={option}>
        <RenameField initial={label} onDone={onRenamed} />
      </div>
    );
  }
  return (
    <button
      type="button"
      className={classesOf(
        styles.option,
        isFavorite && styles.favorite,
        isHolding && styles.holding,
        isLifted && styles.lifted,
      )}
      aria-pressed={isOn}
      title={titleOf()}
      data-option={option}
      data-favorite={isFavorite || undefined}
      style={color ? optionStyle(color) : undefined}
      onClick={() => {
        onPress(option);
      }}
    >
      {label}
    </button>
  );
}

interface OthersButtonProps {
  readonly options: readonly FlyerOption[];
  readonly others: readonly number[];
  readonly onToggle: () => void;
}

/** If the flyer of now is in there, the button takes its name: which one is on is always seen. */
function OthersButton({ options, others, onToggle }: OthersButtonProps) {
  const onScreen = useWorkspaceValue((state) => state.slot.option);
  const activeWork = useLogoEditorValue((state) => state.activeWork);
  const isInside = !activeWork && onScreen !== null && others.includes(onScreen);
  const label = isInside ? optionLabel(options, onScreen) : "Otros";
  return (
    <button
      type="button"
      className={styles.others}
      aria-haspopup="true"
      aria-pressed={isInside}
      title={isInside ? `${label} (de «Otros»)` : "Los demás flyers"}
      data-testid="other-flyers"
      data-keeps-others-open=""
      data-others={others.join(",")}
      style={isInside ? optionStyle(optionColor(options, onScreen)) : undefined}
      onClick={onToggle}
    >
      <span className={styles.othersLabel} data-testid="other-flyers-label">
        {label}
      </span>
      <svg className={styles.chevron} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>
  );
}

/** The rules of the bar with any list, for what a person cannot make happen on a whim. */
function useBarProbe(options: readonly FlyerOption[]): void {
  const { can } = usePermissions();
  useEffect(
    () =>
      registerProbe("flyerBar", () => ({
        split: (favorites: readonly number[], enabled: readonly number[]) => {
          const parts = barParts(enabled, favorites);
          return parts && { favorite: parts.favorite, others: parts.others.length };
        },
        optionsOfTab: (tab: string) => (isFlyerTabId(tab) ? allowedOptions(options, tab, can) : []),
        afterStar: (favorites: readonly number[], option: number) =>
          favoritesAfterStar(favorites, option, (other) => optionTab(options, other)),
      })),
    [can, options],
  );
}

/** The flyers of this tab. It shows only with more than one to choose from. */
export function FlyerOptionBar({ options, allowed, worksOf, onChoose }: FlyerOptionBarProps) {
  const { favorites, toggle } = useFavoriteFlyers();
  useBarProbe(options);
  const works = useLogoEditorValue((state) => state.works);
  const [isListOpen, setIsListOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const parts = barParts(allowed, favorites);
  const inSight = parts
    ? [...parts.fixed, ...(parts.favorite === null ? [] : [parts.favorite])]
    : allowed;
  const { container, reorder, order, renaming, countPress, finishRenaming } = useOptionBarGestures(
    options,
    inSight,
  );
  // With a draft or a design open it shows even with one flyer: it is the way back to the original.
  const hasWorks = works.some(({ option }) => worksOf.includes(option));
  if (allowed.length < 2 && !hasWorks) return null;
  const toggleList = () => {
    setIsListOpen((isOpen) => !isOpen);
  };
  return (
    <div
      ref={root}
      className={parts ? `${styles.optionBar} ${styles.manyFlyers}` : styles.optionBar}
      data-testid="flyer-options"
    >
      <div
        ref={container}
        className={styles.optionRow}
        data-reordering={reorder.liftedId !== null || undefined}
        {...reorder.handlers}
      >
        {order.map((option) => (
          <OptionButton
            key={option}
            option={option}
            options={options}
            isFavorite={option === parts?.favorite}
            hasTitle={parts !== null}
            isHolding={reorder.holdingId === String(option)}
            isLifted={reorder.liftedId === String(option)}
            isRenaming={renaming === option}
            onPress={(pressed) => {
              countPress(pressed);
              onChoose(pressed);
            }}
            onRenamed={(typed) => {
              finishRenaming(option, typed);
            }}
          />
        ))}
        {parts?.favorite === null && (
          <button
            type="button"
            className={styles.favoritePlace}
            title="Elegí tu flyer favorito: abrí «Otros» y tocá la estrellita"
            data-testid="favorite-place"
            data-keeps-others-open=""
            onClick={toggleList}
          >
            <StarIcon className={styles.chevron} />
            <span className={styles.othersLabel}>Tu favorito</span>
          </button>
        )}
        {parts && <OthersButton options={options} others={parts.others} onToggle={toggleList} />}
      </div>
      <OpenWorksRow allowed={worksOf} />
      {parts && isListOpen && (
        <OtherFlyers
          bar={root}
          allowed={allowed}
          parts={parts}
          options={options}
          onChoose={onChoose}
          onStar={(option) => {
            void toggle(option);
          }}
          onClose={() => {
            setIsListOpen(false);
          }}
        />
      )}
    </div>
  );
}
