// What is being written in the window of a logo, which is the one that puts it on the flyer.
import { useMemo, useState } from "react";
import type { FlyerArt } from "@/shared/flyer-engine/index.ts";
import type { FlyerPlace, PlacedChange } from "./change.ts";
import { countLines, printedColor } from "./flyer-pixels.ts";

const USUAL_COLORS = [
  ["#1A1A1A", "Negro"],
  ["#6B6B6B", "Gris"],
  ["#FA6400", "Naranja"],
  ["#0B2C5F", "Azul"],
  ["#FFFFFF", "Blanco"],
] as const;

const BOLD = 700;
const NORMAL = 500;

export interface WrittenText {
  readonly texto: string;
  readonly color: string;
  readonly peso: number;
  readonly fs: number;
}

function colorsFor(art: FlyerArt, place: FlyerPlace): readonly (readonly [string, string])[] {
  const original = place.vacio ? null : printedColor(art, place);
  return [...(original ? [[original, "Como estaba"] as const] : []), ...USUAL_COLORS];
}

function suggestedSize(place: FlyerPlace, printedLines: number, text: string): number {
  const lines = Math.max(1, text.split("\n").length);
  const size = printedLines ? place.h / printedLines : (place.h / lines) * 0.8;
  return Math.max(12, Math.min(90, Math.round(size)));
}

export function useTextDraft(
  art: FlyerArt | null,
  place: FlyerPlace,
  previous: PlacedChange | null,
) {
  const colors = useMemo(() => (art ? colorsFor(art, place) : USUAL_COLORS), [art, place]);
  const printedLines = useMemo(
    () => (place.vacio || !art ? 0 : countLines(art, place)),
    [art, place],
  );
  const [text, setText] = useState(previous?.texto ?? "");
  const [color, setColor] = useState(previous?.color ?? colors[0]?.[0] ?? "#1A1A1A");
  const [isBold, setBold] = useState((Number(previous?.peso) || NORMAL) >= BOLD);
  const [touchedSize, setTouchedSize] = useState(Boolean(previous));
  const [size, setSize] = useState(
    previous ? Math.round(previous.fs ?? 0) : suggestedSize(place, printedLines, ""),
  );
  return {
    colors,
    text,
    color,
    isBold,
    size,
    setColor,
    setBold,
    write: (value: string) => {
      setText(value);
      if (!touchedSize) setSize(suggestedSize(place, printedLines, value));
    },
    resize: (value: number) => {
      setTouchedSize(true);
      setSize(value);
    },
    written: (): WrittenText => ({
      texto: text,
      color,
      peso: isBold ? BOLD : NORMAL,
      fs: size,
    }),
  };
}

export type TextDraft = ReturnType<typeof useTextDraft>;
