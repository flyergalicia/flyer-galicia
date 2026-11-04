// Starts scripts/serve-static.ts on a free port, for scripts that open the current app.
import { type ChildProcess, spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { execPath } from "node:process";

const WAIT_ATTEMPTS = 50;
const WAIT_STEP_MS = 100;

export interface StaticServer {
  url: string;
  stop(): void;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => {
        resolve(port);
      });
    });
  });
}

async function isServing(url: string): Promise<boolean> {
  try {
    return (await fetch(`${url}index.html`, { method: "HEAD" })).ok;
  } catch {
    return false;
  }
}

async function waitUntilServing(url: string, server: ChildProcess): Promise<void> {
  for (let attempt = 0; attempt < WAIT_ATTEMPTS; attempt += 1) {
    if (server.exitCode !== null) break;
    // oxlint-disable-next-line no-await-in-loop -- one try after the other, until it answers
    if (await isServing(url)) return;
    // oxlint-disable-next-line no-await-in-loop -- one try after the other, until it answers
    await sleep(WAIT_STEP_MS);
  }
  server.kill();
  throw new Error("The local server did not start");
}

export async function startStaticServer(): Promise<StaticServer> {
  const port = await freePort();
  const url = `http://127.0.0.1:${String(port)}/`;
  const server = spawn(execPath, ["scripts/serve-static.ts", "--port", String(port)], {
    stdio: "ignore",
  });
  await waitUntilServing(url, server);
  return {
    url,
    stop: () => {
      server.kill();
    },
  };
}
