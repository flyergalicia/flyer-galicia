import { optionLabel, type FlyerOption } from "@/shared/domain/flyer-options.ts";
import { useWorkspaceValue } from "@/shared/lib/flyer-workspace/index.ts";
import { OpenWorksRow, useLogoEditorValue } from "@/slices/logo-editor/index.ts";
import styles from "./FlyerEditorView.module.css";

interface FlyerOptionBarProps {
  readonly options: readonly FlyerOption[];
  readonly allowed: readonly number[];
  readonly onChoose: (option: number) => void;
}

function colorOf(options: readonly FlyerOption[], option: number): string {
  return options.find(({ n }) => n === option)?.color ?? "";
}

/** The flyers of this tab. It shows only with more than one to choose from. */
export function FlyerOptionBar({ options, allowed, onChoose }: FlyerOptionBarProps) {
  const onScreen = useWorkspaceValue((state) => state.slot.option);
  const works = useLogoEditorValue((state) => state.works);
  const activeWork = useLogoEditorValue((state) => state.activeWork);
  // With a draft or a design open it shows even with one flyer: it is the way back to the original.
  const hasWorks = works.some(({ option }) => allowed.includes(option));
  if (allowed.length < 2 && !hasWorks) return null;
  return (
    <div className={styles.optionBar} data-testid="flyer-options">
      <div className={styles.optionRow}>
        {allowed.map((option) => {
          const isOn = option === onScreen && !activeWork;
          const color = isOn ? colorOf(options, option) : "";
          return (
            <button
              key={option}
              type="button"
              className={styles.option}
              aria-pressed={isOn}
              data-option={option}
              style={color ? { color, borderBottomColor: color } : undefined}
              onClick={() => {
                onChoose(option);
              }}
            >
              {optionLabel(options, option)}
            </button>
          );
        })}
      </div>
      <OpenWorksRow allowed={allowed} />
    </div>
  );
}
