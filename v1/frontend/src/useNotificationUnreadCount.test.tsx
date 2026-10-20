import { StrictMode } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNotificationUnreadCount } from "./useNotificationUnreadCount";

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("shared notification unread-count polling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const flush = () =>
    act(async () => {
      await Promise.resolve();
    });
  const advance = (ms: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  const countResponse = (count: number) =>
    new Response(JSON.stringify({ unread_count: count }));
  const visibility = async (state: DocumentVisibilityState) => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue(state);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
  };

  it("uses one 60-second timer after StrictMode, rerenders, and visibility events; never fetches lists", async () => {
    const fetchMock = vi.fn(async () => countResponse(3));
    vi.stubGlobal("fetch", fetchMock);
    const { result, rerender, unmount } = renderHook(
      () => useNotificationUnreadCount("a", true),
      {
        wrapper: StrictMode,
      },
    );
    await flush();
    expect(vi.getTimerCount()).toBe(1);
    expect(result.current.unreadCount).toBe(3);
    const initial = fetchMock.mock.calls.length;
    rerender();
    await advance(59_999);
    expect(fetchMock).toHaveBeenCalledTimes(initial);
    await advance(1);
    expect(fetchMock).toHaveBeenCalledTimes(initial + 1);
    await visibility("visible");
    await visibility("visible");
    expect(vi.getTimerCount()).toBe(1);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/notifications/unread-count",
      expect.objectContaining({ credentials: "include" }),
    );
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not poll while hidden and refreshes once before resuming the normal interval", async () => {
    const fetchMock = vi.fn(async () => countResponse(2));
    vi.stubGlobal("fetch", fetchMock);
    const { unmount } = renderHook(() => useNotificationUnreadCount("a", true));
    await flush();
    await visibility("hidden");
    expect(vi.getTimerCount()).toBe(0);
    await advance(180_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await visibility("visible");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await advance(59_999);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await advance(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    unmount();
  });

  it("starts hidden without requests or timers", async () => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    const fetchMock = vi.fn(async () => countResponse(1));
    vi.stubGlobal("fetch", fetchMock);
    const { unmount } = renderHook(() => useNotificationUnreadCount("a", true));
    await advance(120_000);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    await visibility("visible");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("deduplicates slow requests and aborts on unmount", async () => {
    const pending = deferredResponse();
    const fetchMock = vi.fn((_input: unknown, _init?: RequestInit) => {
      void _input;
      void _init;
      return pending.promise;
    });
    vi.stubGlobal("fetch", fetchMock);
    const { unmount } = renderHook(() => useNotificationUnreadCount("a", true));
    await advance(180_000);
    await visibility("visible");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const signal = fetchMock.mock.calls[0][1]?.signal;
    unmount();
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => {
      pending.resolve(countResponse(99));
    });
  });

  it("only polls authenticated active accounts and stops on logout", async () => {
    const fetchMock = vi.fn(async () => countResponse(4));
    vi.stubGlobal("fetch", fetchMock);
    const { result, rerender, unmount } = renderHook(
      ({ enabled }) => useNotificationUnreadCount("a", enabled),
      {
        initialProps: { enabled: false },
      },
    );
    await advance(120_000);
    expect(fetchMock).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await flush();
    expect(result.current.unreadCount).toBe(4);
    rerender({ enabled: false });
    expect(vi.getTimerCount()).toBe(0);
    await advance(120_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.unreadCount).toBe(0);
    unmount();
  });

  it.each([401, 403, 419])(
    "stops permanently for the current session after HTTP %s",
    async (status) => {
      const fetchMock = vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "AUTHENTICATION_REQUIRED" }), {
            status,
          }),
      );
      vi.stubGlobal("fetch", fetchMock);
      const { result, unmount } = renderHook(() =>
        useNotificationUnreadCount("a", true),
      );
      await flush();
      expect(result.current.active).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
      await advance(180_000);
      await visibility("visible");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      unmount();
    },
  );

  it("retains the last count on transient errors and retries at 60 seconds", async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () =>
      ++calls === 2
        ? new Response(JSON.stringify({ error: "UNAVAILABLE" }), {
            status: 500,
          })
        : countResponse(calls === 1 ? 3 : 5),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() =>
      useNotificationUnreadCount("a", true),
    );
    await flush();
    await advance(60_000);
    expect(result.current.unreadCount).toBe(3);
    await advance(60_000);
    expect(result.current.unreadCount).toBe(5);
    unmount();
  });

  it("ignores a previous account's in-flight count", async () => {
    const pending = deferredResponse();
    let calls = 0;
    const fetchMock = vi.fn((input: unknown, _init?: RequestInit) => {
      void input;
      void _init;
      return ++calls === 1
        ? pending.promise
        : Promise.resolve(countResponse(2));
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result, rerender, unmount } = renderHook(
      ({ scope }) => useNotificationUnreadCount(scope, true),
      {
        initialProps: { scope: "a" },
      },
    );
    rerender({ scope: "b" });
    await flush();
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    await act(async () => {
      pending.resolve(countResponse(99));
    });
    expect(result.current.unreadCount).toBe(2);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
  });

  it("updates reads immediately, deduplicates successful reads, and ignores stale counts", async () => {
    const pending = deferredResponse();
    const fetchMock = vi.fn(() => pending.promise);
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() =>
      useNotificationUnreadCount("a", true),
    );
    act(() => {
      result.current.replaceUnreadCount(3);
      result.current.markRead(["one"]);
    });
    expect(result.current.unreadCount).toBe(2);
    act(() => {
      result.current.markRead(["one", "two"]);
    });
    expect(result.current.unreadCount).toBe(1);
    await act(async () => {
      pending.resolve(countResponse(99));
    });
    expect(result.current.unreadCount).toBe(1);
    unmount();
  });

  it("pauses count requests during read actions to avoid applying post-read counts twice", async () => {
    const fetchMock = vi.fn(async () => countResponse(3));
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() =>
      useNotificationUnreadCount("a", true),
    );
    await flush();
    let resume!: () => void;
    act(() => {
      resume = result.current.pauseCountRequests();
    });
    await advance(120_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    act(() => {
      result.current.markRead(["one"]);
      resume();
    });
    expect(result.current.unreadCount).toBe(2);
    await advance(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    unmount();
  });
});
