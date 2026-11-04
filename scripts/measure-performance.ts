// Measures the current app on the simulated cloud and keeps the numbers the React rewrite has to
// beat: `npm run perf:baseline`. It is not part of `npm run ci`.
import { writeFileSync } from "node:fs";
import { arch, cpus, platform } from "node:os";
import { chromium, type Browser } from "@playwright/test";
import { createCloud } from "../tests/e2e/support/cloud/index.ts";
import { restartClock } from "../tests/e2e/support/clock.ts";
import { launchApp } from "../tests/e2e/support/open-app.ts";
import { type StartupWeight, watchStartupWeight } from "../tests/e2e/support/startup-weight.ts";
import { startStaticServer } from "./static-server.ts";

const BASELINE_FILE = "tests/fixtures/performance-baseline.json";
const RUNS = 5;
const NOTE =
  "Peso: bytes de JavaScript y CSS que el navegador baja o lee al arrancar, también de CDN y lo " +
  "incrustado en la página. Tiempo: desde navegar hasta que el flyer está listo, con la nube " +
  "simulada y sin caché. El tiempo depende de la máquina y de la red: sólo vale para comparar " +
  "en esta misma máquina.";

interface Run {
  readyMs: number;
  weight: StartupWeight;
}

function median(values: readonly number[]): number {
  const sorted = values.toSorted((first, second) => first - second);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

async function measureRun(browser: Browser, url: string, clockOffset: number): Promise<Run> {
  const watching: { startedAt: number; read?: () => Promise<StartupWeight> } = { startedAt: 0 };
  const { context } = await launchApp({
    browser,
    cloud: createCloud(),
    target: "legacy",
    baseURL: url,
    clockOffset,
    options: {
      beforeNavigation: (page) => {
        watching.read = watchStartupWeight(page, url);
        watching.startedAt = performance.now();
        return Promise.resolve();
      },
    },
  });
  const readyMs = Math.round(performance.now() - watching.startedAt);
  const weight = await watching.read?.();
  if (!weight) throw new Error("The page was never watched");
  await context.close();
  return { readyMs, weight };
}

async function measureRuns(browser: Browser, url: string, clockOffset: number): Promise<Run[]> {
  const runs: Run[] = [];
  for (let run = 0; run < RUNS; run += 1) {
    // oxlint-disable-next-line no-await-in-loop -- measured one at a time, or they would compete
    const measured = await measureRun(browser, url, clockOffset);
    runs.push(measured);
    console.log(`Corrida ${String(run + 1)}: flyer listo en ${String(measured.readyMs)} ms`);
  }
  return runs;
}

async function main(): Promise<void> {
  const measuredOn = new Date().toISOString().slice(0, 10);
  const clockOffset = restartClock();
  const server = await startStaticServer();
  const browser = await chromium.launch();
  try {
    const runs = await measureRuns(browser, server.url, clockOffset);
    const [first] = runs;
    if (!first) throw new Error("No runs");
    const flyerReadyMs = runs.map(({ readyMs }) => readyMs);
    const baseline = {
      measuredOn,
      note: NOTE,
      machine: { system: `${platform()} ${arch()}`, cpu: cpus()[0]?.model ?? "" },
      browser: browser.version(),
      startup: first.weight,
      flyerReady: { medianMs: median(flyerReadyMs), runsMs: flyerReadyMs },
    };
    writeFileSync(BASELINE_FILE, `${JSON.stringify(baseline, null, 2)}\n`);
    const { javascript, css } = first.weight;
    console.log(`JavaScript: ${String(javascript.raw)} bytes, ${String(javascript.gzip)} gzip`);
    console.log(`CSS: ${String(css.raw)} bytes, ${String(css.gzip)} gzip`);
    console.log(`Flyer listo (mediana): ${String(baseline.flyerReady.medianMs)} ms`);
    console.log(`Guardado en ${BASELINE_FILE}`);
  } finally {
    await browser.close();
    server.stop();
  }
}

await main();
