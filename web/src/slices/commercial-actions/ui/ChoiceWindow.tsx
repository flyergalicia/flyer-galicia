// The little window that asks to choose: the package of a signup, the reason of a discard.
import { Button } from "@/shared/ui/index.ts";
import { ActionWindow } from "./ActionWindow.tsx";
import styles from "./CommercialActions.module.css";

interface ChoiceWindowProps {
  readonly title: string;
  readonly text: string;
  readonly choices: Readonly<Record<string, string>>;
  readonly onAnswer: (key: string | null) => void;
}

export function ChoiceWindow({ title, text, choices, onAnswer }: ChoiceWindowProps) {
  return (
    <ActionWindow
      title={title}
      subtitle={text}
      onClose={() => {
        onAnswer(null);
      }}
    >
      <div className={styles.choices} data-testid="window-choices">
        {Object.entries(choices).map(([key, label]) => (
          <Button
            key={key}
            variant="ghost"
            onClick={() => {
              onAnswer(key);
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className={styles.windowFoot}>
        <Button
          variant="ghost"
          data-testid="window-dismiss"
          onClick={() => {
            onAnswer(null);
          }}
        >
          Cancelar
        </Button>
      </div>
    </ActionWindow>
  );
}
