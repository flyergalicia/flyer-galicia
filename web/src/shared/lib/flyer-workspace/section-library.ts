// The pictures of the flyers sections are copied from. Drawing a flyer with an inserted section
// cannot wait for one (invariant 27): whatever opens something stored brings them first.
import { type Cut, loadPicture } from "@/shared/flyer-engine/index.ts";

export interface SectionLibrary {
  /** Only pictures of our bucket are brought. */
  readonly isOurs: (address: string) => boolean;
  /** What is in memory, for drawing. */
  readonly images: () => ReadonlyMap<string, HTMLImageElement>;
  /** Null if it does not arrive, or if it is not a picture of our bucket. */
  readonly fetch: (address: string) => Promise<HTMLImageElement | null>;
  /** Brings every section of those cuts. */
  readonly bring: (cuts: readonly Cut[]) => Promise<void>;
  /** How many of those cuts have no picture in memory. */
  readonly missing: (cuts: readonly Cut[]) => number;
}

export interface SectionLibraryOptions {
  readonly isOurs: (address: string) => boolean;
  readonly load?: (address: string) => Promise<HTMLImageElement | null>;
}

export function createSectionLibrary({
  isOurs,
  load = loadPicture,
}: SectionLibraryOptions): SectionLibrary {
  const images = new Map<string, HTMLImageElement>();
  const inFlight = new Map<string, Promise<HTMLImageElement | null>>();

  const fetchOne = (address: string): Promise<HTMLImageElement | null> => {
    const known = images.get(address);
    if (known) return Promise.resolve(known);
    if (!isOurs(address)) return Promise.resolve(null);
    const running = inFlight.get(address);
    if (running) return running;
    const request = load(address).then((image) => {
      inFlight.delete(address);
      if (image) images.set(address, image);
      return image;
    });
    inFlight.set(address, request);
    return request;
  };

  return {
    isOurs,
    images: () => images,
    fetch: fetchOne,
    bring: async (cuts) => {
      const addresses = new Set(cuts.flatMap(({ ins }) => (ins?.u ? [ins.u] : [])));
      await Promise.all([...addresses].map(fetchOne));
    },
    missing: (cuts) => cuts.filter(({ ins }) => ins && !images.has(ins.u)).length,
  };
}
