import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RepositoryManagementItem } from "./api";
import RepositoryManagementWorkspace from "./RepositoryManagementWorkspace";

const page = (data: unknown[]) => ({
  data,
  links: { first: null, last: null, prev: null, next: null },
  meta: {
    current_page: 1,
    from: data.length ? 1 : null,
    last_page: 1,
    links: [],
    path: "/api/office/repository-management/documents",
    per_page: 25,
    to: data.length || null,
    total: data.length,
  },
});

function item(
  overrides: Partial<RepositoryManagementItem> = {},
): RepositoryManagementItem {
  return {
    id: 42,
    submission_reference: "RN-42",
    permanent_delete_confirmation: "DELETE RN-42",
    title: "Managed study",
    degree_program: "BS Computer Science",
    publication_year: 2026,
    research_stage: "completed",
    submission_status: "approved",
    institute: "Institute of Computer Studies",
    publication: {
      submission_status: "approved",
      archive_status: "not_archived",
      visibility: "private",
    },
    management: {
      deleted_at: null,
      management_archived_at: null,
      deletion_state: "none",
    },
    import: { is_imported: false },
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-13T00:00:00Z",
    row_version: 1,
    etag: '"repository-document-42-v1"',
    capabilities: {
      view: true,
      update: true,
      management_archive: true,
      management_restore: false,
      permanent_delete: false,
    },
    authors: [],
    ...overrides,
  };
}

function stubRepository(rows: RepositoryManagementItem[]) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, _init?: RequestInit) => {
      void _init;
      const path = String(input);
      if (path.endsWith("/documents/capabilities"))
        return new Response(
          JSON.stringify({
            schema_version: 1,
            data: {
              enabled: true,
              filters: [],
              sorts: [],
              max_per_page: 100,
              editable_fields: [],
              management_archive: true,
              management_restore: true,
              permanent_delete: {
                reason_min: 1,
                reason_max: 5000,
                confirmation_template: "DELETE {submission_reference}",
                idempotency_header: "Idempotency-Key",
              },
              etag: {
                required_for: [],
                header: "If-Match",
                format: '"repository-document-{id}-v{row_version}"',
              },
            },
          }),
        );
      if (path.includes("/deletions"))
        return new Response(JSON.stringify(page([])));
      if (path.endsWith("/documents/42"))
        return new Response(JSON.stringify({ data: rows[0] }));
      if (path.endsWith("permanent-delete"))
        return new Response(
          JSON.stringify({
            ledger_id: 9,
            idempotent_replay: false,
            status: "queued",
          }),
        );
      return new Response(JSON.stringify(page(rows)));
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("RepositoryManagementWorkspace", () => {
  it.each([
    ["office", "Research Office"],
    ["admin", "System Administrator"],
  ] as const)(
    "uses the shared canonical workspace for %s",
    async (context, label) => {
      const fetchMock = stubRepository([]);
      render(<RepositoryManagementWorkspace context={context} />);
      expect(await screen.findByText(label)).toBeInTheDocument();
      expect(
        await screen.findByText("No repository records match these filters."),
      ).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/office/repository-management/documents?page=1&per_page=25",
        expect.anything(),
      );
    },
  );

  it("fails closed when the server disables repository management", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => {
      void _input;
      return new Response(
        JSON.stringify({ schema_version: 1, data: { enabled: false } }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<RepositoryManagementWorkspace context="office" />);

    expect(
      await screen.findByText(
        "Repository management is not enabled for this environment.",
      ),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "/api/office/repository-management/documents/capabilities",
    );
  });

  it("debounces live filters and only exposes state-supported actions", async () => {
    const managed = item({
      management: {
        deleted_at: "2026-09-13T00:00:00Z",
        management_archived_at: "2026-09-13T00:00:00Z",
        deletion_state: "none",
      },
      capabilities: {
        view: true,
        update: true,
        management_archive: false,
        management_restore: true,
        permanent_delete: true,
      },
    });
    const legacy = item({
      id: 43,
      title: "Legacy import",
      management: {
        deleted_at: "2026-09-12T00:00:00Z",
        management_archived_at: null,
        deletion_state: "none",
      },
      capabilities: {
        view: true,
        update: false,
        management_archive: false,
        management_restore: true,
        permanent_delete: true,
      },
    });
    const fetchMock = stubRepository([managed, legacy]);
    render(<RepositoryManagementWorkspace context="office" />);
    expect(
      await screen.findByRole("button", { name: "Restore Managed study" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Permanently delete Managed study" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Restore Legacy import" }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Live search"), {
      target: { value: "inventory" },
    });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/office/repository-management/documents?q=inventory&page=1&per_page=25",
        expect.anything(),
      ),
    );
  });

  it("uses an exact confirmation, ETag, and client idempotency key to queue deletion", async () => {
    const managed = item({
      management: {
        deleted_at: "2026-09-13T00:00:00Z",
        management_archived_at: "2026-09-13T00:00:00Z",
        deletion_state: "none",
      },
      capabilities: {
        view: true,
        update: true,
        management_archive: false,
        management_restore: true,
        permanent_delete: true,
      },
    });
    const fetchMock = stubRepository([managed]);
    render(<RepositoryManagementWorkspace context="admin" />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Permanently delete Managed study",
      }),
    );
    const submit = screen.getByRole("button", {
      name: "Queue permanent deletion",
    });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Duplicate import" },
    });
    fireEvent.change(screen.getByLabelText(/Type DELETE RN-42 to confirm/), {
      target: { value: "DELETE RN-42" },
    });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/office/repository-management/documents/42/permanent-delete",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            reason: "Duplicate import",
            confirmation: "DELETE RN-42",
          }),
          headers: expect.objectContaining({
            "If-Match": '"repository-document-42-v1"',
          }),
        }),
      ),
    );
    const request = fetchMock.mock.calls.find(([path]) =>
      String(path).endsWith("permanent-delete"),
    )?.[1] as RequestInit;
    expect(new Headers(request.headers).get("Idempotency-Key")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("does not offer a non-cryptographic idempotency fallback", async () => {
    vi.stubGlobal("crypto", undefined);
    const managed = item({
      management: {
        deleted_at: "2026-09-13T00:00:00Z",
        management_archived_at: "2026-09-13T00:00:00Z",
        deletion_state: "none",
      },
      capabilities: {
        view: true,
        update: true,
        management_archive: false,
        management_restore: true,
        permanent_delete: true,
      },
    });
    stubRepository([managed]);
    render(<RepositoryManagementWorkspace context="admin" />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Permanently delete Managed study",
      }),
    );
    expect(
      screen.getByText(/cannot create a secure request identifier/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Queue permanent deletion" }),
    ).toBeDisabled();
  });

  it("confirms archive and restore before sending their required empty bodies", async () => {
    const active = item();
    const archived = item({
      id: 43,
      title: "Archived study",
      management: {
        deleted_at: "2026-09-13T00:00:00Z",
        management_archived_at: "2026-09-13T00:00:00Z",
        deletion_state: "none",
      },
      capabilities: {
        view: true,
        update: true,
        management_archive: false,
        management_restore: true,
        permanent_delete: false,
      },
    });
    const fetchMock = stubRepository([active, archived]);
    render(<RepositoryManagementWorkspace context="office" />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Management archive Managed study",
      }),
    );
    expect(
      screen.getByText(/publication state is preserved/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Archive record" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/office/repository-management/documents/42/management-archive",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({}),
          headers: expect.objectContaining({
            "If-Match": '"repository-document-42-v1"',
          }),
        }),
      ),
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Restore Archived study" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Restore record" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/office/repository-management/documents/43/management-restore",
        expect.objectContaining({ method: "POST", body: JSON.stringify({}) }),
      ),
    );
  });
});
