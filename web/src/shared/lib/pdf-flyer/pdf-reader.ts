// pdf.js, for turning a PDF into a flyer. It weighs too much for the first load: it comes down the
// first time somebody chooses a PDF, from the site itself. The worker and the two WASM files are asked
// for with their hash, because a Worker and the fetch of a worker verify nothing by themselves: if a
// file is not what it should be, it does not run.
import jbig2Address from "pdfjs-dist/wasm/jbig2.wasm?url";
import openjpegAddress from "pdfjs-dist/wasm/openjpeg.wasm?url";
import { createLibraryLoader, type LibraryLoader } from "../library-loader.ts";
import { registerProbe } from "../test-probe.ts";

/** The same hashes of the package of this version: when the version changes, these change. */
export const PDF_READER_FILES = {
  worker: {
    file: "legacy/build/pdf.worker.min.mjs",
    integrity: "sha384-h2OX4gf3I6e1sZFfB/7wpAKzqaygzUba1e7GWT5x1gZqWrNDRIrSERQHlEFPSfu+",
  },
  "openjpeg.wasm": {
    file: "wasm/openjpeg.wasm",
    integrity: "sha384-zUaz4HmvfKEHP9lus9TOMat1FFL0UcpbPw5V11mhoW2ma/L1IDw03o1QQqv7AkF2",
  },
  "jbig2.wasm": {
    file: "wasm/jbig2.wasm",
    integrity: "sha384-iaCfit7ahDwR6i0sUBtQtjqoUs/cixFPu1hRkl4j14vBZ9WWoGkJhy0wQ9N9P5ED",
  },
} as const;

type PdfLibrary = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

type PdfDocument = Awaited<ReturnType<PdfLibrary["getDocument"]>["promise"]>;
export type PdfPage = Awaited<ReturnType<PdfDocument["getPage"]>>;

export interface VerifiedBinaryRequest {
  readonly kind?: string;
  readonly filename?: string;
}

const WASM_ADDRESSES: Readonly<Record<string, string>> = {
  "openjpeg.wasm": openjpegAddress,
  "jbig2.wasm": jbig2Address,
};

function wasmFile(name: string | undefined) {
  if (name === "openjpeg.wasm" || name === "jbig2.wasm") return PDF_READER_FILES[name];
  return null;
}

/** In development the server may touch a file on its way: the hash is for what is published. */
function verified(integrity: string): RequestInit {
  return import.meta.env.PROD ? { integrity, mode: "cors" } : { mode: "cors" };
}

/**
 * What pdf.js asks for its images in JPEG 2000 and fax. There is no other way: a file that does not
 * arrive leaves that image undrawn, and the rest of the PDF comes out anyway.
 */
export class VerifiedBinaries {
  async fetch({ kind, filename }: VerifiedBinaryRequest): Promise<Uint8Array> {
    const wanted = kind === "wasmUrl" ? wasmFile(filename) : null;
    const address = filename ? WASM_ADDRESSES[filename] : undefined;
    if (!wanted || !address) throw new Error(`pdf.js pidió ${String(filename)}`);
    const answer = await fetch(address, verified(wanted.integrity));
    if (!answer.ok) throw new Error(`HTTP ${String(answer.status)}`);
    return new Uint8Array(await answer.arrayBuffer());
  }
}

/** A file of its own, as it comes in the package: a script of ours would be another worker. */
const WORKER_ADDRESS = new URL(
  "../../../../../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs",
  import.meta.url,
).href;

async function bringWorker(library: PdfLibrary): Promise<void> {
  const answer = await fetch(WORKER_ADDRESS, verified(PDF_READER_FILES.worker.integrity));
  if (!answer.ok) throw new Error(`HTTP ${String(answer.status)}`);
  library.GlobalWorkerOptions.workerSrc = URL.createObjectURL(
    new Blob([await answer.text()], { type: "text/javascript" }),
  );
}

export const PDF_READER: LibraryLoader<PdfLibrary> = createLibraryLoader(async () => {
  const library = await import("pdfjs-dist/legacy/build/pdf.mjs");
  await bringWorker(library);
  registerProbe("pdfReader", () => ({ version: library.version }));
  return library;
});
