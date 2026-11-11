import {
  type CloudHandler,
  type CloudReply,
  type CloudRequest,
  bytesReply,
  jsonBody,
  jsonReply,
} from "../http.ts";
import { flyerImageBytes } from "../seed-data.ts";

const PUBLIC_PREFIX = "/storage/v1/object/public/flyers/";
const UPLOAD_PREFIX = "/storage/v1/object/flyers/";
const CRLF_CRLF = Buffer.from([13, 10, 13, 10]);

export const servePublicFile: CloudHandler = ({ path, file, state }) => {
  if (!path.startsWith(PUBLIC_PREFIX)) return undefined;
  const binary = state.bucketBinaries[file];
  if (binary) return bytesReply(binary, "image/jpeg");
  if (/^flyer_t\d\.jpg$/.test(file)) return bytesReply(flyerImageBytes, "image/jpeg");
  const json = state.bucketJson[file];
  return json ? jsonReply(json) : jsonReply({}, 404);
};

export const failSimulatedUpload: CloudHandler = ({ path, state }) => {
  const ending = state.failUploadEndingWith;
  if (!ending || !path.startsWith(UPLOAD_PREFIX) || !path.endsWith(ending)) return undefined;
  return jsonReply({ statusCode: "500", error: "x", message: "falla simulada" }, 500);
};

function partOffsets(raw: Buffer, separator: Buffer): number[] {
  const offsets: number[] = [];
  let from = raw.indexOf(separator);
  while (from >= 0) {
    offsets.push(from);
    from = raw.indexOf(separator, from + separator.length);
  }
  return offsets;
}

/** supabase-js uploads multipart; the file is the part with a filename (or the last one). */
function uploadedBytes(raw: Buffer, contentType: string): Buffer {
  const boundary = /boundary=(.+)$/.exec(contentType)?.[1];
  if (!boundary) return raw;
  const separator = Buffer.from(`--${boundary}`);
  const offsets = partOffsets(raw, separator);
  let chosen: Buffer = Buffer.alloc(0);
  for (let index = 0; index < offsets.length - 1; index += 1) {
    const part = raw.subarray((offsets[index] ?? 0) + separator.length, offsets[index + 1]);
    const hasFilename = part.subarray(0, 300).toString("latin1").includes("filename");
    if (hasFilename || index === offsets.length - 2) chosen = part;
  }
  return chosen.subarray(chosen.indexOf(CRLF_CRLF) + 4, chosen.length - 2);
}

function storeUpload({ state }: CloudRequest, name: string, bytes: Buffer): void {
  if (name.endsWith(".json")) {
    const text = bytes.toString("utf8");
    state.lastJsonUpload = text.slice(0, 300);
    try {
      state.bucketJson[name] = JSON.parse(text) as unknown;
    } catch {
      state.bucketJson[name] = { __mal: true };
    }
  } else {
    state.bucketBinaries[name] = bytes;
  }
  state.uploads.push({ name, bytes: bytes.length });
}

export const receiveUpload: CloudHandler = (request) => {
  const { path, headers, state, playwrightRequest } = request;
  if (!path.startsWith(UPLOAD_PREFIX)) return undefined;
  const name = decodeURIComponent(path.slice(UPLOAD_PREFIX.length));
  const exists = name in state.bucketJson || name in state.bucketBinaries;
  if (headers["x-upsert"] !== "true" && exists) {
    state.uploadConflicts += 1;
    return jsonReply(
      { statusCode: "409", error: "Duplicate", message: "The resource already exists" },
      400,
    );
  }
  const raw = playwrightRequest.postDataBuffer() ?? Buffer.alloc(0);
  storeUpload(request, name, uploadedBytes(raw, headers["content-type"] ?? ""));
  return jsonReply({ Key: `flyers/${name}`, Id: "x" });
};

export const deleteFiles: CloudHandler = (request): CloudReply => {
  const { state } = request;
  const { prefixes = [] } = jsonBody<{ prefixes?: string[] }>(request);
  for (const name of prefixes) {
    Reflect.deleteProperty(state.bucketJson, name);
    Reflect.deleteProperty(state.bucketBinaries, name);
  }
  state.deletedFiles.push(...prefixes);
  return jsonReply(prefixes.map((name) => ({ name })));
};
