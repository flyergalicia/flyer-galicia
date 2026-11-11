import { describe, expect, it } from "vitest";
import {
  chapterIndex,
  nextChapterIndex,
  nextIndex,
  planOf,
  previousIndex,
  type TourChapter,
  withoutStep,
} from "./plan.ts";
import { TO_BULK, TO_INDIVIDUAL, TO_MENU } from "./prepare.ts";

const CHAPTERS: readonly TourChapter<string>[] = [
  {
    id: "flyer",
    title: "Armar un flyer",
    steps: [
      { target: "company", title: "Empresa", text: "a", prepare: TO_INDIVIDUAL },
      { target: "paste", title: "Pegar", text: "b", prepare: TO_INDIVIDUAL, applies: false },
      { target: "legal", title: "Legal", text: "c", prepare: TO_INDIVIDUAL },
    ],
  },
  {
    id: "masivo",
    title: "Masivo",
    applies: false,
    steps: [{ target: "excel", title: "Excel", text: "d", prepare: TO_BULK }],
  },
  {
    id: "historial",
    title: "Historial",
    steps: [{ target: "historyTab", title: "Nada", text: "e", prepare: TO_BULK, applies: false }],
  },
  {
    id: "menu",
    title: "Tu menú",
    steps: [{ target: "menuTheme", title: "Modo oscuro", text: "f", prepare: TO_MENU }],
  },
];

describe("the plan", () => {
  it("has only what applies to the profile, and a chip only for chapters with steps", () => {
    const plan = planOf(CHAPTERS);

    expect(plan.steps.map(({ title, chapter }) => `${chapter}:${title}`)).toEqual([
      "flyer:Empresa",
      "flyer:Legal",
      "menu:Modo oscuro",
    ]);
    expect(plan.chapters).toEqual([
      { id: "flyer", title: "Armar un flyer" },
      { id: "menu", title: "Tu menú" },
    ]);
  });
});

describe("moving along", () => {
  const { steps } = planOf(CHAPTERS);

  it("goes forward until the last, which ends it, and back until the first", () => {
    expect(nextIndex(0, 3)).toBe(1);
    expect(nextIndex(2, 3)).toBeNull();
    expect(previousIndex(1)).toBe(0);
    expect(previousIndex(0)).toBeNull();
  });

  it("skips to the next chapter, and ends after the last one", () => {
    expect(nextChapterIndex(steps, 0)).toBe(2);
    expect(nextChapterIndex(steps, 1)).toBe(2);
    expect(nextChapterIndex(steps, 2)).toBeNull();
  });

  it("goes to the first step of a chapter, if it still has one", () => {
    expect(chapterIndex(steps, "menu")).toBe(2);
    expect(chapterIndex(steps, "flyer")).toBe(0);
    expect(chapterIndex(steps, "promos")).toBeNull();
  });

  it("takes off a step that is not seen, and shows the one that took its place", () => {
    expect(withoutStep(steps, 1)).toEqual({ steps: [steps[0], steps[2]], index: 1 });
    expect(withoutStep(steps, 2)).toEqual({ steps: [steps[0], steps[1]], index: 1 });
    expect(
      withoutStep(
        [steps[0]].filter((step) => step !== undefined),
        0,
      ),
    ).toBeNull();
  });
});
