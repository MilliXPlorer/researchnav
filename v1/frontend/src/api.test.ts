import { afterEach, describe, expect, it, vi } from "vitest";
import {
  listNotifications,
  listPublicResearch,
  markNotificationRead,
  toResearchRecord,
} from "./api";

const resource = (id: number, authorName: string, authorOrder = 1) => ({
  id,
  title: `PUBLIC STUDY ${id}`,
  authors: [
    {
      author_name: "Second Author",
      author_order: 2,
      is_corresponding_author: false,
    },
    {
      author_name: authorName,
      author_order: authorOrder,
      is_corresponding_author: true,
    },
  ],
  publication_year: 2026,
  institution_name: "Example College",
  academic_unit: "Example Unit",
  degree_program: "Example Program",
  category: { name: "Example Category" },
  abstract: "Public abstract.",
  keywords: ["public"],
  research_stage: "completed",
});

afterEach(() => vi.unstubAllGlobals());

describe("public repository API", () => {
  it("uses exact Laravel author fields and sorts by author_order", () => {
    const record = toResearchRecord(resource(1, "First Author"));
    expect(record.authors).toBe("First Author, Second Author");
    expect(record).not.toHaveProperty("sourceFilename");
  });

  it("accumulates Laravel pages and normalizes an absolute next URL", async () => {
    const fetchMock = vi.fn(async (path: string) => {
      if (path === "/api/repository?per_page=50") {
        return new Response(
          JSON.stringify({
            data: [resource(1, "First Author")],
            links: { next: "https://api.example.test/api/repository?page=2" },
          }),
        );
      }
      return new Response(
        JSON.stringify({
          data: [resource(2, "Third Author")],
          links: { next: null },
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(listPublicResearch()).resolves.toMatchObject([
      { id: "1", authors: "First Author, Second Author" },
      { id: "2", authors: "Third Author, Second Author" },
    ]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/repository?page=2",
      expect.anything(),
    );
  });

  it("returns an empty repository response without manufacturing records", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ data: [], links: { next: null } })),
      ),
    );
    await expect(listPublicResearch()).resolves.toEqual([]);
  });
});

describe("notification API", () => {
  const notification = {
    id: "f2bc7d6b-28d5-4ebc-8ac3-6d5e7c0b2fc0",
    type: "App\\Notifications\\ResearchActivityNotification",
    event: "RESEARCH_SUBMITTED",
    title: "Research activity",
    message: "Research was submitted for review.",
    action_url: "/research/42",
    research_document_id: 42,
    read_at: null,
    created_at: "2026-08-10T12:00:00.000000Z",
  };

  it("lists Laravel NotificationResource records without manufacturing alerts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ data: [notification], links: { next: null } }),
          ),
      ),
    );

    await expect(listNotifications()).resolves.toEqual([notification]);
  });

  it("marks the UUID notification through its Laravel read endpoint", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ...notification,
            read_at: "2026-08-10T12:01:00.000000Z",
          }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(markNotificationRead(notification.id)).resolves.toMatchObject({
      id: notification.id,
      read_at: "2026-08-10T12:01:00.000000Z",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/notifications/${notification.id}/read`,
      expect.objectContaining({ method: "PATCH" }),
    );
  });
});
