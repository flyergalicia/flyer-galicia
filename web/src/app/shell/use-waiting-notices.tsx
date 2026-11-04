import { type ComponentType, type ReactNode, useCallback, useMemo, useState } from "react";
import type { NoticeSourceProps, WaitingNotice } from "@/shared/lib/view-props.ts";

export interface HeaderNotice {
  readonly count: number;
  readonly hint: string;
  readonly tabBadges: Readonly<Record<string, number>>;
}

/** Everything that is waiting, on the name of the person and on the tabs. */
export function headerNoticeOf(notices: readonly WaitingNotice[]): HeaderNotice {
  const waiting = notices.filter(({ count }) => count > 0);
  const tabBadges: Record<string, number> = {};
  for (const { count, tabId } of waiting) {
    if (tabId !== undefined) tabBadges[tabId] = count;
  }
  return {
    count: waiting.reduce((total, { count }) => total + count, 0),
    hint: waiting.length > 0 ? `Tenés ${waiting.map(({ hint }) => hint).join(" y ")}` : "",
    tabBadges,
  };
}

type Sources = Readonly<Record<string, ComponentType<NoticeSourceProps>>>;

/** Keeps what each source says. Its reporters stay mounted wherever the header is. */
export function useWaitingNotices(sources: Sources): {
  readonly notice: HeaderNotice;
  readonly reporters: ReactNode;
  /** What one of them says, for the number of the menu. */
  readonly waiting: (source: string) => number;
} {
  const [reported, setReported] = useState<Readonly<Record<string, WaitingNotice>>>({});
  const reporters = useMemo(
    () =>
      Object.entries(sources).map(([name, Source]) => (
        <Source
          key={name}
          report={(notice) => {
            setReported((before) => ({ ...before, [name]: notice }));
          }}
        />
      )),
    [sources],
  );
  const notice = useMemo(() => headerNoticeOf(Object.values(reported)), [reported]);
  const waiting = useCallback((source: string) => reported[source]?.count ?? 0, [reported]);
  return { notice, reporters, waiting };
}
