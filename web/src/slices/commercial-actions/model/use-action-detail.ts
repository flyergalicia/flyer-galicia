// The action open on screen: what is read, what opening it takes out of the novelties, and each thing
// that can be changed on it. What comes back from the database goes straight to what is on screen.
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useBackend } from "@/shared/supabase/index.ts";
import { markActionRead, markSeriesSeen } from "../api/actions.ts";
import type { ActionRow, PersonRow } from "../api/rows.ts";
import {
  detailKey,
  invalidateActionList,
  noteMessagesRead,
  noteSeriesSeen,
  refreshNotices,
  threadKey,
  useActionDetailData,
  useActionThread,
} from "./use-actions-data.ts";
import type { Who } from "./who.ts";

interface DetailData {
  readonly action: ActionRow | null;
  readonly people: readonly PersonRow[];
}

function isNewFor(me: string, action: ActionRow): boolean {
  return (
    (action.hunter_id === me && !action.visto_hunter) ||
    (action.dueno_id === me && !action.visto_dueno)
  );
}

export function useActionDetail(id: string, who: Who, isActive: boolean) {
  const backend = useBackend();
  const queryClient = useQueryClient();
  const detail = useActionDetailData(id);
  const thread = useActionThread(id);
  const { me } = who;

  const markAsRead = useCallback(
    async (action: ActionRow, hasMessages: boolean) => {
      if (isNewFor(me, action)) {
        await markSeriesSeen(backend, action.serie_id ?? "");
        noteSeriesSeen(queryClient, action, me);
        refreshNotices(queryClient);
      }
      if (hasMessages) {
        await markActionRead(backend, action.id);
        noteMessagesRead(queryClient, action.id);
        refreshNotices(queryClient);
      }
    },
    [backend, me, queryClient],
  );

  // Opening it is what reads it, and it is done once for each time it is opened: not on each read.
  const { data: read } = detail;
  const { data: conversation } = thread;
  const opened = useRef<string | null>(null);
  const action = read?.action ?? null;
  const hasOthersMessages = conversation?.messages.some(({ autor }) => autor !== me) ?? false;
  useEffect(() => {
    if (!action || !conversation || opened.current === id) return;
    opened.current = id;
    markAsRead(action, hasOthersMessages).catch(() => undefined);
  }, [action, conversation, hasOthersMessages, id, markAsRead]);

  // Coming back to the screen reads it again.
  const wasActive = useRef(isActive);
  const { refetch: refetchDetail } = detail;
  const { refetch: refetchThread } = thread;
  useEffect(() => {
    if (isActive && !wasActive.current) {
      opened.current = null;
      void refetchDetail();
      void refetchThread();
    }
    wasActive.current = isActive;
  }, [isActive, refetchDetail, refetchThread]);

  const setAction = useCallback(
    (next: ActionRow) => {
      queryClient.setQueryData<DetailData>(detailKey(id), (before) =>
        before ? { ...before, action: next } : before,
      );
      invalidateActionList(queryClient);
    },
    [id, queryClient],
  );
  const setPeople = useCallback(
    (change: (people: readonly PersonRow[]) => readonly PersonRow[]) => {
      queryClient.setQueryData<DetailData>(detailKey(id), (before) =>
        before ? { ...before, people: change(before.people) } : before,
      );
      invalidateActionList(queryClient);
    },
    [id, queryClient],
  );
  const reloadThread = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: threadKey(id) });
  }, [id, queryClient]);
  const reload = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: detailKey(id) });
    await reloadThread();
  }, [id, queryClient, reloadThread]);

  return useMemo(
    () => ({
      action,
      people: read?.people ?? [],
      isReading: detail.isPending,
      problem: read ? null : detail.error,
      retry: () => void refetchDetail(),
      messages: conversation?.messages ?? [],
      events: conversation?.events ?? [],
      threadFailed: !conversation && thread.isError,
      retryThread: () => void refetchThread(),
      setAction,
      setPeople,
      reloadThread,
      reload,
    }),
    [
      action,
      conversation,
      detail.error,
      detail.isPending,
      read,
      refetchDetail,
      refetchThread,
      reload,
      reloadThread,
      setAction,
      setPeople,
      thread.isError,
    ],
  );
}

export type ActionDetailValue = ReturnType<typeof useActionDetail>;
