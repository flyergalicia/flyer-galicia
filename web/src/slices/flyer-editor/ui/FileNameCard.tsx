import { useRef } from "react";
import { buildFileName } from "@/shared/flyer-engine/index.ts";
import { Card, Input } from "@/shared/ui/index.ts";
import { useFlyerForm, useFormValue } from "../model/form-context.ts";
import { withFileName } from "../model/form-state.ts";
import { insertAtCursor, valuesForFileName } from "../model/file-name.ts";
import styles from "./FlyerForm.module.css";

const TAGS = ["{empresa}", "{asesor}", "{config}", "{fecha}"] as const;

function NamePreview() {
  const form = useFlyerForm();
  const preview = useFormValue((state) =>
    buildFileName(state.fileName, valuesForFileName(state, form.getContext()), {
      now: new Date(),
      configuration: "",
    }),
  );
  return (
    <div className={styles.fileNamePreview} data-testid="file-name-preview">
      → {preview}.pdf
    </div>
  );
}

export function FileNameCard() {
  const form = useFlyerForm();
  const fileName = useFormValue((state) => state.fileName);
  const field = useRef<HTMLInputElement>(null);
  return (
    <Card>
      <Card.Title>Nombre del archivo</Card.Title>
      <div className={styles.fileNameRow}>
        <Input
          ref={field}
          value={fileName}
          aria-label="Nombre del archivo"
          data-testid="file-name"
          onChange={({ target }) => {
            form.update((state) => withFileName(state, target.value));
          }}
        />
        <span>.pdf</span>
      </div>
      <div className={styles.fileNameTags}>
        {TAGS.map((tag) => (
          <button
            key={tag}
            type="button"
            className={styles.fileNameTag}
            onClick={() => {
              insertAtCursor(field.current, tag, (next) => {
                form.update((state) => withFileName(state, next));
              });
            }}
          >
            {tag}
          </button>
        ))}
      </div>
      <NamePreview />
    </Card>
  );
}
