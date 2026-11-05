// What the screens of Gestiones read. Saving leaves the list old: it is read again when it is needed,
// and a late answer never steps on a newer one (each read has its key).
import { type QueryClient, useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { useBackend } from "@/shared/supabase/index.ts";
import { COMMERCIAL_NOTICES_QUERY_KEY } from "@/shared/lib/commercial-actions/commercial-notices-query.ts";
import {
  readAction,
  readActionList,
  readEventsOf,
  readMessagesOf,
  readMyCompanies,
  readPeopleOf,
  readUnreadMessages,
} from "../api/actions.ts";
import type { ActionRow, ListedAction } from "../api/rows.ts";
import type { UnreadByAction } from "./action-list.ts";

const LIST_KEY = ["commercial-actions", "list"] as const;
const UNREAD_KEY = ["commercial-actions", "unread"] as const;
const COMPANIES_KEY = ["commercial-actions", "my-companies"] as const;
const DETAIL_KEY = ["commercial-actions", "detail"] as const;
const THREAD_KEY = ["commercial-actions", "thread"] as const;
export const AGENDA_KEY = ["commercial-actions", "agenda"] as const;

const NO_ACTIONS: readonly ListedAction[] = [];
const NO_UNREAD: UnreadByAction = new Map();

export function useActionList(onlyMine: boolean) {
  const backend = useBackend();
  const { data, error, isPending, refetch } = useQuery({
    queryKey: [...LIST_KEY, onlyMine],
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: () => readActionList(backend, onlyMine),
  });
  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);
  return { actions: data ?? NO_ACTIONS, loaded: Boolean(data), error, isPending, retry };
}

export function useUnreadMessages(): UnreadByAction {
  const backend = useBackend();
  const { data } = useQuery({
    queryKey: UNREAD_KEY,
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: () => readUnreadMessages(backend),
  });
  return data ?? NO_UNREAD;
}

export function useMyCompanies(me: string) {
  const backend = useBackend();
  const { data, error, refetch } = useQuery({
    queryKey: [...COMPANIES_KEY, me],
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: () => readMyCompanies(backend, me),
  });
  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);
  return { companies: data ?? null, error, retry };
}

/** The action and its people: without them there is nothing to show. */
export function useActionDetailData(id: string) {
  const backend = useBackend();
  return useQuery({
    queryKey: [...DETAIL_KEY, id],
    gcTime: 0,
    staleTime: 0,
    queryFn: async () => {
      const [action, people] = await Promise.all([
        readAction(backend, id),
        readPeopleOf(backend, id),
      ]);
      return { action, people };
    },
  });
}

/** The conversation and the history. They fail apart: the action can still be worked on. */
export function useActionThread(id: string) {
  const backend = useBackend();
  return useQuery({
    queryKey: [...THREAD_KEY, id],
    gcTime: 0,
    staleTime: 0,
    queryFn: async () => {
      const [messages, events] = await Promise.all([
        readMessagesOf(backend, id),
        readEventsOf(backend, id),
      ]);
      return { messages, events };
    },
  });
}

export function detailKey(id: string) {
  return [...DETAIL_KEY, id] as const;
}

export function threadKey(id: string) {
  return [...THREAD_KEY, id] as const;
}

export function invalidateAgenda(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: AGENDA_KEY });
}

/** After saving: the list, the agenda and the numbers are old. */
export function invalidateActionList(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: LIST_KEY });
  void queryClient.invalidateQueries({ queryKey: UNREAD_KEY });
  invalidateAgenda(queryClient);
}

export function invalidateUnread(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: UNREAD_KEY });
}

export function refreshNotices(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: COMMERCIAL_NOTICES_QUERY_KEY });
}

type ListChange = (action: ListedAction) => ListedAction;

function changeListed(queryClient: QueryClient, change: ListChange): void {
  queryClient.setQueriesData<readonly ListedAction[]>({ queryKey: LIST_KEY }, (actions) =>
    actions?.map((action) => change(action)),
  );
}

function seenBy(action: ListedAction, me: string): ListedAction {
  return {
    ...action,
    visto_hunter: action.visto_hunter || action.hunter_id === me,
    visto_dueno: action.visto_dueno || action.dueno_id === me,
  };
}

/** Opening it takes the whole series out of what is new, for whoever opens it. */
export function noteSeriesSeen(queryClient: QueryClient, seen: ActionRow, me: string): void {
  changeListed(queryClient, (action) =>
    action.serie_id === seen.serie_id ? seenBy(action, me) : action,
  );
}

export function noteMessagesRead(queryClient: QueryClient, id: string): void {
  queryClient.setQueryData<UnreadByAction>(
    UNREAD_KEY,
    (unread) => unread && new Map([...unread].filter(([action]) => action !== id)),
  );
}

/** "Marcar todas como leídas": nothing is left marked. */
export function noteAllRead(queryClient: QueryClient, me: string): void {
  changeListed(queryClient, (action) => seenBy(action, me));
  queryClient.setQueryData<UnreadByAction>(UNREAD_KEY, new Map());
}
