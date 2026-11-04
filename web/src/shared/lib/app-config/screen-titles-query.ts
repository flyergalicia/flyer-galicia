import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  NO_TITLES,
  readScreenTitles,
  type ScreenTitles,
  screenTitlesFile,
} from "@/shared/domain/screen-titles.ts";
import {
  type Backend,
  type BucketWriteFailure,
  failure,
  type Result,
  success,
  useBackend,
} from "@/shared/supabase/index.ts";

export const SCREEN_TITLES_QUERY_KEY = ["app-config", "screen-titles"] as const;

async function readTitles(bucket: Backend["bucket"]): Promise<ScreenTitles> {
  const file = await bucket.readJson("_titulos.json");
  if (file.ok) return readScreenTitles(file.value);
  if (file.error.kind === "not-found") return NO_TITLES;
  throw new Error(`_titulos.json: ${file.error.kind}`);
}

export interface ScreenTitlesValue {
  readonly titles: ScreenTitles;
  readonly settled: boolean;
}

export function useScreenTitles(enabled = true): ScreenTitlesValue {
  const { bucket } = useBackend();
  const { data, isError, isSuccess } = useQuery({
    queryKey: SCREEN_TITLES_QUERY_KEY,
    queryFn: () => readTitles(bucket),
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
  });
  return { titles: data ?? NO_TITLES, settled: isSuccess || isError };
}

type SaveResult = Result<void, BucketWriteFailure>;

/** Everybody gets the new names and the new order the next time they enter. */
export function useSaveScreenTitles(): (titles: ScreenTitles) => Promise<SaveResult> {
  const { bucket } = useBackend();
  const queryClient = useQueryClient();
  const { mutateAsync } = useMutation<SaveResult, never, ScreenTitles>({
    mutationFn: async (titles) => {
      // It stays on screen even if it could not be saved, as it does today: the notice says so.
      queryClient.setQueryData(SCREEN_TITLES_QUERY_KEY, titles);
      const saved = await bucket.upload(
        "_titulos.json",
        new Blob([screenTitlesFile(titles, new Date())], { type: "application/json" }),
        { contentType: "application/json", upsert: true },
      );
      return saved.ok ? success(undefined) : failure(saved.error);
    },
  });
  return mutateAsync;
}
