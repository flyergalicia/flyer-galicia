// What the window of a logo does on the flyer. A logo may take long to arrive: if meanwhile the
// window closed or the flyer changed, it does not fall on the new one with the places of the old one.
import { useEffect, useRef, useState } from "react";
import { isSupermarket, type Promotion } from "@/shared/domain/promotions/index.ts";
import { useFlyerWorkspace } from "@/shared/lib/flyer-workspace/index.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import type { BrandPicker } from "./brand-picker.ts";
import type { FlyerPlace } from "./change.ts";
import type { LogoEditor } from "./editor-store.ts";
import {
  readLogoFile,
  type UploadedLogo,
  uploadFailureText,
  WHITE_LOGO_TEXT,
} from "./uploaded-logo.ts";

export interface PickerActionsInput {
  readonly editor: LogoEditor;
  readonly place: FlyerPlace;
  readonly close: () => void;
}

function useStillOpen() {
  const isOpen = useRef(true);
  useEffect(() => {
    isOpen.current = true;
    return () => {
      isOpen.current = false;
    };
  }, []);
  return isOpen;
}

export function useLogoUpload({ editor, place, close }: PickerActionsInput) {
  const toast = useToast();
  const isOpen = useStillOpen();
  const [isBusy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const put = ({ key, name, logo, isWhite }: UploadedLogo) => {
    close();
    editor.uploadedLogo(place, key, name, logo);
    // One notice at a time: the warning has to be read, and "Listo" would step on it.
    toast.show(
      isWhite
        ? WHITE_LOGO_TEXT
        : "Listo: tu logo quedó en este flyer. Tocalo para agrandarlo o moverlo.",
    );
  };
  return {
    fileInput,
    isBusy,
    askForFile: () => {
      const input = fileInput.current;
      if (!input) return;
      input.value = "";
      input.click();
    },
    readFile: async (file: File) => {
      setBusy(true);
      const art = editor.currentArt();
      const read = await readLogoFile(file);
      if (typeof read === "string") {
        setBusy(false);
        toast.show(uploadFailureText(read));
      } else if (isOpen.current && editor.currentArt() === art) {
        put(read);
      }
    },
  };
}

function logoOf({ imagen }: Promotion): string {
  return imagen ?? "";
}

function noticeOf(picker: BrandPicker, promotion: Promotion, result: string): string {
  if (result === "dias") {
    const days = picker.supermarkets.flyerDays(promotion, picker.zone);
    return `Listo: ${promotion.titulo} con sus días de descuento (${days}).`;
  }
  if (result === "sinDias") {
    return `Listo: ${promotion.titulo}. No tiene días con % de descuento: saqué los días que había abajo.`;
  }
  return `Listo: ${promotion.titulo} en este flyer.`;
}

export function useBrandPlacing(picker: BrandPicker, { editor, place, close }: PickerActionsInput) {
  const toast = useToast();
  const workspace = useFlyerWorkspace();
  const isOpen = useStillOpen();
  const [loadingLogo, setLoadingLogo] = useState<string | null>(null);

  const putBrand = (target: FlyerPlace, promotion: Promotion, logo: HTMLCanvasElement) => {
    const image = logoOf(promotion);
    if (!picker.withDays || !isSupermarket(promotion)) {
      editor.placeLogo(target, image, promotion.titulo, logo);
      return "";
    }
    const days = picker.supermarkets.flyerDays(promotion, picker.zone);
    return editor.placeSupermarket(target, image, promotion.titulo, logo, days);
  };

  const chooseBrand = async (promotion: Promotion) => {
    const image = logoOf(promotion);
    setLoadingLogo(image);
    const art = editor.currentArt();
    try {
      const logo = await workspace.logos.fetch(image);
      if (!isOpen.current || editor.currentArt() !== art) return;
      close();
      toast.show(noticeOf(picker, promotion, putBrand(place, promotion, logo)));
    } catch {
      if (!isOpen.current) return;
      setLoadingLogo(null);
      toast.show(
        `No se pudo bajar el logo de ${promotion.titulo}. Probá con otro o revisá la conexión.`,
      );
    }
  };

  const putSeveral = async (
    picks: readonly Promotion[],
    places: readonly FlyerPlace[],
    onFailure: () => void,
  ) => {
    const art = editor.currentArt();
    try {
      const logos = await Promise.all(
        picks.map((promotion) => workspace.logos.fetch(logoOf(promotion))),
      );
      if (!isOpen.current || editor.currentArt() !== art) return;
      close();
      for (const [index, promotion] of picks.entries()) {
        const [target, logo] = [places[index], logos[index]];
        if (target && logo) putBrand(target, promotion, logo);
      }
      editor.finishSeveral();
      const left = places.length - picks.length;
      const stayed = left > 0 ? ` (${left} lugares quedaron como estaban)` : "";
      const marks = picks.length === 1 ? " marca puesta" : " marcas puestas";
      toast.show(`Listo: ${picks.length}${marks}${stayed}. Con Ctrl+Z se deshace.`);
    } catch {
      if (!isOpen.current) return;
      onFailure();
      toast.show("No se pudo bajar algún logo. Probá de nuevo o elegí otra marca.");
    }
  };

  return { loadingLogo, chooseBrand, putSeveral };
}
