import { StrictMode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Dashboard from "./Dashboard";
import { defaultUserSession } from "./data";

const session = {
  ...defaultUserSession,
  role: "adviser" as const,
  displayName: "ResearchNAV User",
  email: "adviser@example.test",
  accessStatus: "active" as const,
};
const notification = {
  id: "notification-one",
  type: "App\\Notifications\\ResearchActivityNotification",
  event: "RESEARCH_SUBMITTED",
  title: "Submitted research",
  message: "Ready for review",
  action_url: "/research/42",
  research_document_id: 42,
  read_at: null,
  created_at: null,
};

describe("Dashboard notification request ownership", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function mockApi() {
    const fetchMock = vi.fn(
      async (input: string | URL | Request, _init?: RequestInit) => {
        void _init;
        const path = String(input);
        if (path === "/api/notifications/unread-count")
          return new Response(JSON.stringify({ unread_count: 1 }));
        if (path === "/api/notifications")
          return new Response(
            JSON.stringify({ data: [notification], links: { next: null } }),
          );
        if (path === "/api/notifications/notification-one/read")
          return new Response(
            JSON.stringify({
              data: { ...notification, read_at: "2026-10-16T10:00:00Z" },
            }),
          );
        if (path === "/api/dashboard")
          return new Response(
            JSON.stringify({
              data: { schema_version: 1, role: "adviser", sections: [] },
            }),
          );
        return new Response(JSON.stringify({ error: "NOT_FOUND" }), {
          status: 404,
        });
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }
  const flush = () =>
    act(async () => {
      await Promise.resolve();
    });
  const advance = (ms: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });

  it("shares one timer across header/mobile controls and rerenders, fetching full lists only on open", async () => {
    const fetchMock = mockApi();
    const navigate = vi.fn();
    const { rerender, unmount } = render(
      <StrictMode>
        <Dashboard session={session} navigate={navigate} />
      </StrictMode>,
    );
    await flush();
    const countCalls = () =>
      fetchMock.mock.calls.filter(
        ([path]) => path === "/api/notifications/unread-count",
      ).length;
    const listCalls = () =>
      fetchMock.mock.calls.filter(([path]) => path === "/api/notifications")
        .length;
    expect(vi.getTimerCount()).toBe(1);
    const initialCountCalls = countCalls();
    expect(listCalls()).toBe(0);
    rerender(
      <StrictMode>
        <Dashboard session={{ ...session }} navigate={navigate} />
      </StrictMode>,
    );
    await advance(180_000);
    expect(countCalls()).toBe(initialCountCalls + 3);
    expect(listCalls()).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Open notifications" }));
    await flush();
    expect(screen.getByText(notification.title)).toBeInTheDocument();
    expect(listCalls()).toBe(1);
    await advance(120_000);
    expect(listCalls()).toBe(1);
    fireEvent.click(
      screen.getByRole("button", { name: "Close notifications" }),
    );
    await advance(120_000);
    expect(listCalls()).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Alerts 1" }));
    await flush();
    expect(listCalls()).toBe(2);
    await advance(0);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("updates the shared unread badge immediately after marking a notification read", async () => {
    const fetchMock = mockApi();
    const navigate = vi.fn();
    const { unmount } = render(
      <Dashboard session={session} navigate={navigate} />,
    );
    await flush();
    const bell = screen.getByRole("button", { name: "Open notifications" });
    expect(bell).toHaveTextContent("1");
    fireEvent.click(bell);
    await flush();
    fireEvent.click(screen.getByText(notification.title));
    await flush();
    expect(bell).not.toHaveTextContent("1");
    expect(navigate).toHaveBeenCalledWith("/research/42");
    expect(
      fetchMock.mock.calls.filter(
        ([path]) => path === "/api/notifications/unread-count",
      ),
    ).toHaveLength(1);
    unmount();
  });

  it("stops its timer immediately when signing out, before the logout request finishes", async () => {
    mockApi();
    const onLogout = vi.fn(() => new Promise<void>(() => undefined));
    const { unmount } = render(
      <Dashboard session={session} navigate={vi.fn()} onLogout={onLogout} />,
    );
    await flush();
    fireEvent.click(
      screen.getByRole("button", { name: "Open profile for ResearchNAV User" }),
    );
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /Sign out/i }));
    await flush();
    expect(onLogout).toHaveBeenCalledTimes(1);
    await advance(0);
    expect(vi.getTimerCount()).toBe(0);
    unmount();
  });

  it("aborts an on-demand list when the panel closes", async () => {
    const fetchMock = mockApi();
    fetchMock.mockImplementation(async (input) =>
      String(input) === "/api/notifications"
        ? new Promise<Response>(() => undefined)
        : new Response(
            JSON.stringify(
              String(input) === "/api/dashboard"
                ? { data: { schema_version: 1, role: "adviser", sections: [] } }
                : { unread_count: 0 },
            ),
          ),
    );
    const { unmount } = render(
      <Dashboard session={session} navigate={vi.fn()} />,
    );
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Open notifications" }));
    const listRequest = fetchMock.mock.calls.find(
      ([path]) => path === "/api/notifications",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Close notifications" }),
    );
    expect(listRequest?.[1]?.signal?.aborted).toBe(true);
    unmount();
  });
});
