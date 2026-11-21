// The number of Gestiones on its tab and on the envelope, and the notice of what is new: on entering,
// everything; after that, only what arrived.
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import {
  useMyProposals,
  usePendingProposals,
} from "@/shared/lib/company-registry/proposals-query.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import type { NoticeSourceProps } from "@/shared/lib/view-props.ts";
import { usePermissions } from "@/shared/session/index.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { type CommercialNotice, noticeText } from "./commercial-notices.ts";
import { useCommercialNotices } from "./commercial-notices-query.ts";
import {
  COMMERCIAL_PEOPLE_QUERY_KEY,
  type CommercialPeople,
  readCommercialPeople,
} from "./people-query.ts";

const LONG_NOTICE_MS = 6000;
/** If the notice of the proposals came out on entering, this one waits for its turn. */
const AFTER_PROPOSALS_MS = 6500;
const NOBODY: CommercialPeople = {};

function hintOf(count: number): string {
  return count === 1 ? "1 novedad en Gestiones" : `${String(count)} novedades en Gestiones`;
}

function useProposalsOnEntering(): number {
  const { isHunter } = usePermissions();
  const { count } = usePendingProposals();
  const { news } = useMyProposals();
  return count + (isHunter ? news : 0);
}

/** What was not told yet. The first time it is everything. */
function freshNotices(notices: readonly CommercialNotice[], told: Set<string>) {
  const fresh = notices.filter(({ kind, key }) => !told.has(kind + key));
  for (const { kind, key } of fresh) told.add(kind + key);
  return fresh;
}

export function CommercialNoticeSource({ report }: NoticeSourceProps) {
  const { notices, read } = useCommercialNotices();
  const backend = useBackend();
  const queryClient = useQueryClient();
  const { show } = useToast();
  const proposals = useProposalsOnEntering();
  const told = useRef<Set<string> | null>(null);
  const count = notices.length;
  const latestProposals = useRef(proposals);
  useEffect(() => {
    latestProposals.current = proposals;
  }, [proposals]);
  useEffect(() => {
    report({ count, hint: hintOf(count), tabId: "gestiones" });
  }, [count, report]);
  useEffect(() => {
    if (!read) return undefined;
    const isFirst = told.current === null;
    told.current ??= new Set<string>();
    const fresh = freshNotices(notices, told.current);
    if (fresh.length === 0) return undefined;
    const say = async () => {
      const people = await queryClient
        .fetchQuery({
          queryKey: COMMERCIAL_PEOPLE_QUERY_KEY,
          staleTime: Number.POSITIVE_INFINITY,
          queryFn: () => readCommercialPeople(backend),
        })
        .catch(() => NOBODY);
      const text = noticeText(fresh, people);
      if (text) show(text, LONG_NOTICE_MS);
    };
    const wait = isFirst && latestProposals.current > 0 ? AFTER_PROPOSALS_MS : 0;
    const timer = setTimeout(() => void say(), wait);
    return () => {
      clearTimeout(timer);
    };
  }, [backend, notices, queryClient, read, show]);
  return null;
}
