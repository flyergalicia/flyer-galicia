import { Button } from "@/shared/ui/index.ts";
import { whenOf } from "../model/flyer-history.ts";
import type { SessionDraft } from "../model/session-draft.ts";
import styles from "./FlyerForm.module.css";

interface DraftOfferProps {
  readonly draft: SessionDraft;
  readonly onCarryOn: () => void;
  readonly onDiscard: () => void;
}

function hourOf(ts: number): string {
  const date = new Date(ts || Date.now());
  return `${String(date.getHours())}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** A flyer half made, found on entering. */
export function DraftOffer({ draft, onCarryOn, onDiscard }: DraftOfferProps) {
  const company = (draft.v.empresa || "").trim();
  return (
    <div className={styles.draftOffer} data-draft-offer="" data-testid="draft-offer">
      <span>
        Tenés un flyer a medio armar:{" "}
        {company ? <strong>{company}</strong> : "un flyer sin empresa"} ·{" "}
        {whenOf({ ts: draft.ts, hora: hourOf(draft.ts) })}
      </span>
      <div className={styles.draftOfferActions}>
        <Button onClick={onCarryOn}>Seguir con ese</Button>
        <Button variant="ghost" onClick={onDiscard}>
          Descartar
        </Button>
      </div>
    </div>
  );
}
