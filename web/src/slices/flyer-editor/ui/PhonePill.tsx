import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/shared/ui/index.ts";
import styles from "./FlyerForm.module.css";

const OVER_THE_PREVIEW = 70;
const PREVIEW_AT = 0.45;

type Place = "edit" | "preview";

function previewTop(): number | null {
  const preview = document.querySelector('[data-testid="flyer-preview"]');
  return preview ? preview.getBoundingClientRect().top : null;
}

/**
 * On a phone: it only goes up or down the page, up to the form or up to the flyer, and hides nothing.
 * Descargar is here too: looking at the finished flyer, the button of the form stays out of sight.
 */
export function PhonePill({ onDownload }: { readonly onDownload: () => void }) {
  const [place, setPlace] = useState<Place>("edit");
  useEffect(() => {
    const onScroll = () => {
      const top = previewTop();
      if (top !== null) setPlace(top < window.innerHeight * PREVIEW_AT ? "preview" : "edit");
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
    };
  }, []);
  const goTo = (next: Place) => {
    setPlace(next);
    const top = next === "preview" ? previewTop() : null;
    window.scrollTo({
      top: top === null ? 0 : top + window.scrollY - OVER_THE_PREVIEW,
      behavior: "smooth",
    });
  };
  return createPortal(
    <fieldset className={styles.pill} aria-label="Ir a" data-testid="phone-pill">
      <button
        type="button"
        aria-pressed={place === "edit"}
        onClick={() => {
          goTo("edit");
        }}
      >
        Editar
      </button>
      <button
        type="button"
        aria-pressed={place === "preview"}
        onClick={() => {
          goTo("preview");
        }}
      >
        Vista previa
      </button>
      <button
        type="button"
        className={styles.pillDownload}
        aria-label="Descargar PDF"
        data-pill="download"
        onClick={onDownload}
      >
        <Icon name="download" className={styles.pillIcon} />
        Descargar
      </button>
    </fieldset>,
    document.body,
  );
}
