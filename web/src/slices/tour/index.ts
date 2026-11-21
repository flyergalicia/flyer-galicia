// The tutorial: "Ver tutorial" in the name menu, by chapters and by profile, and its start by itself
// the first time for the profiles that have that faculty. What decides the start goes in the first
// load; the tutorial itself comes down when it opens.
export { useTourAutoStart } from "./model/use-tour-auto-start.ts";

export function loadTourWindow() {
  return import("./ui/TourWindow.tsx").then(({ TourWindow }) => ({ default: TourWindow }));
}
