// A library that weighs and only a few use comes down the first time it is needed.

export interface LibraryLoader<T> {
  /** Whether asking for it is going to take a while. */
  readonly isReady: () => boolean;
  /** One download, however many ask. A failure can be tried again. */
  readonly load: () => Promise<T>;
}

export function createLibraryLoader<T>(bring: () => Promise<T>): LibraryLoader<T> {
  let loading: Promise<T> | null = null;
  let ready = false;
  const load = async (): Promise<T> => {
    try {
      const library = await bring();
      ready = true;
      return library;
    } catch (cause) {
      loading = null;
      throw cause;
    }
  };
  return {
    isReady: () => ready,
    load: () => {
      loading ??= load();
      return loading;
    },
  };
}
