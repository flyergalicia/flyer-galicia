import { describe, expect, it } from "vitest";
import { type Backend, failure, type Result, success } from "@/shared/supabase/index.ts";
import type { BucketReadFailure, BucketWriteFailure } from "@/shared/supabase/bucket.ts";
import { changeWatchedBrands } from "./watched-brands-store.ts";

type Written = Result<void, BucketWriteFailure>;

function textOf(body: Blob | ArrayBuffer | string): Promise<string> {
  return new Response(body).text();
}

function bucketWith(
  read: () => Result<unknown, BucketReadFailure>,
  write: (content: unknown) => Written = () => success(undefined),
): Backend["bucket"] {
  return {
    readJson: () => Promise.resolve(read()),
    publicUrl: (file) => file,
    upload: async (_file, body) => write(JSON.parse(await textOf(body))),
    list: () => Promise.resolve(success([])),
    remove: () => Promise.resolve(success(undefined)),
  };
}

describe("changing the watched brands", () => {
  it("reads the file, saves what comes out and says when", async () => {
    const uploads: unknown[] = [];
    const bucket = bucketWith(
      () => success({ opciones: { 9: [{ m: "A" }] } }),
      (content) => {
        uploads.push(content);
        return success(undefined);
      },
    );
    const saved = await changeWatchedBrands(bucket, (file) => ({
      ...file,
      opciones: { ...file.opciones, 3: [{ m: "B" }] },
    }));
    expect(saved.opciones[3]).toEqual([{ m: "B" }]);
    expect(saved.opciones[9]).toEqual([{ m: "A" }]);
    expect(uploads[0]).toMatchObject({ opciones: { 9: [{ m: "A" }], 3: [{ m: "B" }] } });
    expect(saved.updated_at).toBeTruthy();
  });

  it("a file that does not exist has no lists", async () => {
    const uploads: unknown[] = [];
    const bucket = bucketWith(
      () => failure({ kind: "not-found", status: 404 }),
      (content) => {
        uploads.push(content);
        return success(undefined);
      },
    );
    const saved = await changeWatchedBrands(bucket, (file) => file);
    expect(saved.opciones).toEqual({});
    expect(uploads).toHaveLength(1);
  });

  it("nothing to save, nothing is written", async () => {
    const uploads: unknown[] = [];
    const bucket = bucketWith(
      () => success({ opciones: { 1: [] } }),
      (content) => {
        uploads.push(content);
        return success(undefined);
      },
    );
    const kept = await changeWatchedBrands(bucket, () => null);
    expect(kept.opciones[1]).toEqual([]);
    expect(uploads).toEqual([]);
  });

  it("a file that cannot be read is not written over (invariant 24)", async () => {
    const uploads: unknown[] = [];
    const bucket = bucketWith(
      () => failure({ kind: "unreachable", status: null }),
      (content) => {
        uploads.push(content);
        return success(undefined);
      },
    );
    await expect(changeWatchedBrands(bucket, (file) => file)).rejects.toThrow(/No se pudo leer/);
    expect(uploads).toEqual([]);
  });

  it("a write that fails says so", async () => {
    const bucket = bucketWith(
      () => success({ opciones: {} }),
      () => failure({ kind: "rejected", status: 403, message: "No tenés permiso" }),
    );
    await expect(changeWatchedBrands(bucket, (file) => file)).rejects.toThrow("No tenés permiso");
  });

  it("changes go in line, each one reading what the other left", async () => {
    let content: unknown = { opciones: {} };
    const bucket = bucketWith(
      () => success(content),
      (written) => {
        content = written;
        return success(undefined);
      },
    );
    await Promise.all([
      changeWatchedBrands(bucket, (file) => ({ ...file, opciones: { ...file.opciones, 1: [] } })),
      changeWatchedBrands(bucket, (file) => ({ ...file, opciones: { ...file.opciones, 2: [] } })),
    ]);
    expect(content).toMatchObject({ opciones: { 1: [], 2: [] } });
  });
});
