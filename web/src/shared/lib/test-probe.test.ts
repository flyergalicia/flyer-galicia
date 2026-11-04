import { describe, expect, it } from "vitest";
import { registerProbe, registerProbeIfMissing } from "./test-probe.ts";

const PROBES = "__flyerProbe";

function hostOf(webdriver: boolean): NonNullable<Parameters<typeof registerProbe>[2]> {
  return { navigator: { webdriver } };
}

describe("the probe", () => {
  it("is not there unless tests drive the browser", () => {
    const host = hostOf(false);

    const stop = registerProbe("session", () => 1, host);

    expect(host[PROBES]).toBeUndefined();
    expect(stop).not.toThrow();
  });

  it("answers what it was given, under its name", () => {
    const host = hostOf(true);

    registerProbe("session", () => "dentro", host);
    registerProbe("otra", () => 2, host);

    expect(host[PROBES]?.session?.()).toBe("dentro");
    expect(host[PROBES]?.otra?.()).toBe(2);
  });

  it("goes away when asked, unless another one took its name", () => {
    const host = hostOf(true);
    const stopFirst = registerProbe("session", () => 1, host);
    registerProbe("session", () => 2, host);

    stopFirst();
    expect(host[PROBES]?.session?.()).toBe(2);

    const stopSecond = registerProbe("session", () => 3, host);
    stopSecond();
    expect(host[PROBES]?.session).toBeUndefined();
  });
});

function firstReader(): string {
  return "first";
}

function secondReader(): string {
  return "second";
}

describe("a reader that gives way", () => {
  it("does not take the place of one that is there, and takes it if there is none", () => {
    const host = { navigator: { webdriver: true } };
    registerProbeIfMissing("name", firstReader, host);
    const stop = registerProbeIfMissing("name", secondReader, host);
    expect(Reflect.get(host, "__flyerProbe")).toEqual({ name: firstReader });
    stop();
    expect(Reflect.get(host, "__flyerProbe")).toEqual({ name: firstReader });
  });
});
