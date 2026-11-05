// Saves the flyer half made a moment after each change and on leaving, and offers it back once on
// entering. Only with the faculty; nothing goes up to the cloud.
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFlyerWorkspace } from "@/shared/lib/flyer-workspace/index.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { usePermissions, useSession } from "@/shared/session/index.ts";
import { useFlyerForm } from "./form-context.ts";
import { withAllFieldsChecked } from "./form-state.ts";
import {
  draftKey,
  draftSignature,
  draftValues,
  forgetDraft,
  readDraft,
  type SessionDraft,
  writeDraft,
} from "./session-draft.ts";
import type { useStoredFlyers } from "./use-stored-flyers.ts";

const SAVE_WAIT_MS = 700;

interface SessionDraftOptions {
  /** Where a person works: what happens inside it is what gets saved. */
  readonly panel: RefObject<HTMLElement | null>;
  readonly stored: Pick<ReturnType<typeof useStoredFlyers>, "goToOption" | "toForm">;
}

export function useSessionDraft({ panel, stored }: SessionDraftOptions) {
  const form = useFlyerForm();
  const workspace = useFlyerWorkspace();
  const session = useSession();
  const { show } = useToast();
  const { can, loadStatus } = usePermissions();
  const personId = session.status === "signed-in" ? session.user.id : null;
  const isOn = can("guardar_trabajo") && loadStatus === "ready" && personId !== null;
  const key = draftKey(personId ?? "anon");
  /** Read once when it can be known: it is on the table until it is answered. */
  const found = useMemo(() => (isOn ? readDraft(key) : null), [isOn, key]);
  const [isAnswered, setIsAnswered] = useState(false);
  const offer = isAnswered ? null : found;
  /** An empty form does not step on what is on the table, nor on what is on its way back. */
  const isWaiting = useRef(false);
  const isBringingBack = useRef(false);
  const lastSaved = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    isWaiting.current = offer !== null;
  }, [offer]);

  const saveNow = useCallback(() => {
    clearTimeout(timer.current);
    const { option } = workspace.getState().slot;
    if (!isOn || isWaiting.current || isBringingBack.current || option === null) return;
    const state = form.getState();
    const draft: SessionDraft = {
      v: draftValues(workspace.currentValues(), workspace.savedLegal()),
      ac: state.cashback,
      opt: option,
      filename: state.fileName,
      filenameManual: state.fileNameByHand,
      ts: Date.now(),
    };
    const signature = draftSignature(draft);
    if (signature === lastSaved.current) return;
    lastSaved.current = signature;
    writeDraft(key, draft);
  }, [form, isOn, key, workspace]);

  useEffect(() => {
    if (!isOn) return undefined;
    const isInside = (target: EventTarget | null) =>
      target instanceof Node && panel.current?.contains(target) === true;
    const saveSoon = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(saveNow, SAVE_WAIT_MS);
    };
    /** Writing in a field means another flyer was started: the offer no longer applies. */
    const onWriting = ({ target }: Event) => {
      if (!isInside(target)) return;
      const isOffer = target instanceof Element && target.closest("[data-draft-offer]");
      if (!isOffer) setIsAnswered(true);
      saveSoon();
    };
    const onClick = ({ target }: Event) => {
      if (isInside(target)) saveSoon();
    };
    const onHidden = () => {
      if (document.visibilityState === "hidden") saveNow();
    };
    // On the document, so they run after React: a render in the middle of an event would put the old
    // value back in the field before its own handler reads it, and the letter would be lost.
    document.addEventListener("input", onWriting);
    document.addEventListener("change", onWriting);
    document.addEventListener("click", onClick);
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", saveNow);
    return () => {
      clearTimeout(timer.current);
      document.removeEventListener("input", onWriting);
      document.removeEventListener("change", onWriting);
      document.removeEventListener("click", onClick);
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", saveNow);
    };
  }, [isOn, panel, saveNow]);

  const carryOn = useCallback(async () => {
    if (!offer || isBringingBack.current) return;
    isBringingBack.current = true;
    setIsAnswered(true);
    await stored.goToOption(offer.opt);
    stored.toForm(offer);
    form.update((state) => ({
      ...withAllFieldsChecked(state),
      ...(offer.filename ? { fileName: offer.filename, fileNameByHand: offer.filenameManual } : {}),
    }));
    isBringingBack.current = false;
    isWaiting.current = false;
    lastSaved.current = "";
    saveNow();
  }, [form, offer, saveNow, stored]);

  const discard = useCallback(() => {
    setIsAnswered(true);
    lastSaved.current = "";
    forgetDraft(key);
    show("Borrador descartado");
  }, [key, show]);

  /** Restaurar starts from nothing: the draft goes too. */
  const clear = useCallback(() => {
    lastSaved.current = "";
    forgetDraft(key);
  }, [key]);

  return { offer, carryOn, discard, clear };
}
