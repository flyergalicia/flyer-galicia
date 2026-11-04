/** Nothing is missing at run time that the proxy below does not answer for. */
function isComplete<T extends object>(_ready: Partial<T>): _ready is T {
  return true;
}

/**
 * The part of a domain that exists so far. Anything else fails when it is used, saying so: a spec
 * that needs it is not marked @react yet, and the slice that brings it fills it in.
 */
export function partialDriver<T extends object>(domain: string, ready: Partial<T> = {}): T {
  if (!isComplete<T>(ready)) throw new Error("Unreachable");
  return new Proxy(ready, {
    get: (target, key, receiver) => {
      if (key in target) return Reflect.get(target, key, receiver) as unknown;
      // Whoever awaits a driver asks for this: it is not a method that is missing.
      if (key === "then") return undefined;
      return () => {
        throw new Error(
          `The React driver of "${domain}" has no "${String(key)}" yet: it arrives with its slice (see driver/react).`,
        );
      };
    },
  });
}
