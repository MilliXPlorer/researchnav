import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, getNotificationUnreadCount } from "./api";

export const NOTIFICATION_POLL_INTERVAL_MS = 60_000;

/** Owned once by Dashboard; the header, sidebar, and drawer share its count. */
export function useNotificationUnreadCount(scope: string, enabled: boolean) {
  const [state, setState] = useState({ scope, count: 0 });
  const [stoppedScope, setStoppedScope] = useState<string | null>(null);
  const currentScope = useRef<string | null>(scope);
  useEffect(() => {
    currentScope.current = scope;
    return () => {
      currentScope.current = null;
    };
  }, [scope]);
  const request = useRef<AbortController | null>(null);
  const readIds = useRef({ scope, ids: new Set<string>() });
  const pauses = useRef({ scope, tokens: new Set<symbol>() });
  const active = enabled && stoppedScope !== scope;

  const pauseCountRequests = useCallback(() => {
    if (currentScope.current !== scope) return () => undefined;
    if (pauses.current.scope !== scope)
      pauses.current = { scope, tokens: new Set() };
    const tokens = pauses.current.tokens;
    const token = Symbol();
    tokens.add(token);
    request.current?.abort();
    request.current = null;
    return () => {
      tokens.delete(token);
    };
  }, [scope]);

  const stopPolling = useCallback(() => {
    if (currentScope.current !== scope) return;
    request.current?.abort();
    request.current = null;
    setStoppedScope(scope);
    setState({ scope, count: 0 });
  }, [scope]);

  const replaceUnreadCount = useCallback(
    (count: number) => {
      if (currentScope.current !== scope) return;
      // A full-list snapshot or read action is newer than an in-flight count.
      request.current?.abort();
      request.current = null;
      readIds.current = { scope, ids: new Set() };
      setState({ scope, count });
    },
    [scope],
  );

  const markRead = useCallback(
    (ids: string[]) => {
      if (currentScope.current !== scope) return;
      if (readIds.current.scope !== scope)
        readIds.current = { scope, ids: new Set() };
      const newlyRead = new Set(
        ids.filter((id) => !readIds.current.ids.has(id)),
      );
      newlyRead.forEach((id) => readIds.current.ids.add(id));
      request.current?.abort();
      request.current = null;
      setState((previous) => ({
        scope,
        count: Math.max(
          0,
          (previous.scope === scope ? previous.count : 0) - newlyRead.size,
        ),
      }));
    },
    [scope],
  );

  useEffect(() => {
    if (!active) return;
    let disposed = false;
    let interval: number | undefined;

    const refresh = async () => {
      if (
        disposed ||
        document.visibilityState === "hidden" ||
        request.current ||
        (pauses.current.scope === scope && pauses.current.tokens.size > 0)
      )
        return;
      const controller = new AbortController();
      request.current = controller;
      try {
        const count = await getNotificationUnreadCount(controller.signal);
        if (!disposed && !controller.signal.aborted) setState({ scope, count });
      } catch (error) {
        if (
          !disposed &&
          !controller.signal.aborted &&
          error instanceof ApiError &&
          [401, 403, 419].includes(error.status)
        ) {
          stopPolling();
        }
        // Transient failures retain the badge and retry at the normal cadence.
      } finally {
        if (request.current === controller) request.current = null;
      }
    };

    const onVisibilityChange = () => {
      window.clearInterval(interval);
      interval = undefined;
      if (document.visibilityState === "hidden") {
        request.current?.abort();
        request.current = null;
        return;
      }
      void refresh();
      interval = window.setInterval(
        () => void refresh(),
        NOTIFICATION_POLL_INTERVAL_MS,
      );
    };

    onVisibilityChange();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      request.current?.abort();
      request.current = null;
    };
  }, [active, scope, stopPolling]);

  return {
    unreadCount: active && state.scope === scope ? state.count : 0,
    replaceUnreadCount,
    markRead,
    stopPolling,
    pauseCountRequests,
    active,
  };
}
