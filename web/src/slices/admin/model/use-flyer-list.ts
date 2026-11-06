// The list of Config → Flyer: what each option has active and the versions uploaded, read together.
// What could not be read is said; it is never "there are no flyers" (invariant 24).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { type FlyerOption } from "@/shared/domain/flyer-options.ts";
import {
  FLYER_OPTIONS_QUERY_KEY,
  useFlyerOptions,
} from "@/shared/lib/app-config/flyer-options-query.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { readActiveFlyers, readUploads } from "../api/flyer-files.ts";
import type { ActiveFlyers, UploadedFlyer } from "./flyer-config.ts";

export const FLYER_LIST_QUERY_KEY = ["admin", "flyer-list"] as const;

export interface FlyerList {
  readonly active: ActiveFlyers;
  readonly uploads: readonly UploadedFlyer[];
}

export interface FlyerListValue {
  readonly options: readonly FlyerOption[];
  readonly numbers: readonly number[];
  readonly list: FlyerList | undefined;
  readonly loading: boolean;
  /** What could not be read, in words; empty if nothing failed. */
  readonly failure: string;
  readonly retry: () => void;
}

export function useFlyerList(): FlyerListValue {
  const { bucket } = useBackend();
  const queryClient = useQueryClient();
  const { options, settled, failed } = useFlyerOptions();
  const numbers = useMemo(() => options.map(({ n }) => n), [options]);
  const list = useQuery({
    queryKey: [...FLYER_LIST_QUERY_KEY, numbers.join(",")],
    queryFn: async (): Promise<FlyerList> => {
      const active = await readActiveFlyers(bucket, numbers);
      return { active, uploads: await readUploads(bucket) };
    },
    enabled: settled && !failed,
    staleTime: 0,
    retry: false,
  });
  const { refetch } = list;
  return {
    options,
    numbers,
    list: list.data,
    loading: !settled || list.isPending,
    failure: failed
      ? "no se pudo leer la lista de opciones"
      : list.isError
        ? list.error.message || "sin conexión"
        : "",
    retry: () => {
      if (failed) void queryClient.invalidateQueries({ queryKey: FLYER_OPTIONS_QUERY_KEY });
      else void refetch();
    },
  };
}
