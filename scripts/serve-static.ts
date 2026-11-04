// Serves the repository root as it is, for the browser tests of the current app.
import { createServer, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { argv, cwd, exit } from "node:process";

const HOST = "127.0.0.1";
const ROOT = resolve(cwd());
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
};
const FALLBACK_TYPE = "application/octet-stream";

function portFromArguments(): number {
  const index = argv.indexOf("--port");
  const port = Number(argv[index + 1]);
  if (index < 0 || !Number.isInteger(port)) {
    console.error("Usage: node scripts/serve-static.ts --port <number>");
    exit(1);
  }
  return port;
}

function fileFor(url: string): string | null {
  const path = decodeURIComponent(new URL(url, `http://${HOST}`).pathname);
  const file = resolve(ROOT, `.${path.endsWith("/") ? `${path}index.html` : path}`);
  return file.startsWith(ROOT + sep) ? file : null;
}

function respond(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, { "Cache-Control": "no-store" });
  response.end(body);
}

async function serveFile(file: string, isHead: boolean, response: ServerResponse): Promise<void> {
  try {
    const content = await readFile(file);
    response.writeHead(200, {
      "Content-Type": CONTENT_TYPES[extname(file).toLowerCase()] ?? FALLBACK_TYPE,
      "Cache-Control": "no-store",
    });
    response.end(isHead ? undefined : content);
  } catch {
    respond(response, 404, "Not found");
  }
}

const port = portFromArguments();
const server = createServer((request, response) => {
  const file = fileFor(request.url ?? "/");
  if (request.method !== "GET" && request.method !== "HEAD") {
    respond(response, 405, "Method not allowed");
  } else if (file === null) {
    respond(response, 403, "Forbidden");
  } else {
    void serveFile(file, request.method === "HEAD", response);
  }
});

server.on("error", (error: NodeJS.ErrnoException) => {
  const reason =
    error.code === "EADDRINUSE"
      ? `Port ${String(port)} is taken by another process. Stop it and run the tests again:` +
        " these tests must serve this checkout, never what another server has."
      : error.message;
  console.error(reason);
  exit(1);
});
server.listen(port, HOST, () => {
  console.log(`Serving ${ROOT} at http://${HOST}:${String(port)}/`);
});
