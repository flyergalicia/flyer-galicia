// What a test may read of the app when it cannot see it on screen. It only reads: an action of a
// test goes with mouse and keyboard, as a person does.

type ProbeReader = () => unknown;
type Probes = Record<string, ProbeReader>;

const PROBES = "__flyerProbe";

declare global {
  interface Window {
    [PROBES]?: Probes;
  }
}

interface ProbeHost {
  [PROBES]?: Probes;
  readonly navigator: { readonly webdriver: boolean };
}

/** Nothing is registered unless a browser driven by tests opened the page. */
export function registerProbe(
  name: string,
  read: ProbeReader,
  host: ProbeHost = window,
): () => void {
  if (!host.navigator.webdriver) return () => undefined;
  const probes = host[PROBES] ?? {};
  host[PROBES] = probes;
  probes[name] = read;
  return () => {
    if (probes[name] === read) Reflect.deleteProperty(probes, name);
  };
}

/** The same for a reader that gives way to one that is already there, and knows more. */
export function registerProbeIfMissing(
  name: string,
  read: ProbeReader,
  host: ProbeHost = window,
): () => void {
  return host[PROBES]?.[name] ? () => undefined : registerProbe(name, read, host);
}
