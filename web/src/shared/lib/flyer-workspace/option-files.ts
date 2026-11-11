// The files of an option in the bucket: option 1 has no number in their names.
import type { BucketJsonFile } from "@/shared/supabase/index.ts";

export function activeFile(option: number): BucketJsonFile {
  return option === 1 ? "_active.json" : `_active${option}.json`;
}

export function legalFile(option: number): BucketJsonFile {
  return option === 1 ? "_legal.json" : `_legal${option}.json`;
}
