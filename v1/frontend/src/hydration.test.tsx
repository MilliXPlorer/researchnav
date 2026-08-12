import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import App from "./App";
import type { InitialState } from "./ssr";

describe("SSR hydration", () => {
  it("hydrates seeded public HTML without refetching initial data", async () => {
    const initialState: InitialState = {
      version: 1,
      url: { pathname: "/", search: "" },
      session: { status: "anonymous" },
      repository: {
        status: "ready",
        records: [
          {
            id: "1",
            title: "HYDRATED STUDY",
            authors: "Hydration Author",
            year: 2026,
            institutionName: "Example College",
            academicUnit: "Institute of Computing",
            degreeProgram: "Computer Science",
            institute: "Institute of Computing",
            program: "Computer Science",
            category: "Repositories",
            abstract: "Server-rendered and hydrated.",
            keywords: ["hydration"],
            researchStage: "Completed",
          },
        ],
      },
    };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const container = document.createElement("div");
    container.innerHTML = renderToString(<App initialState={initialState} />);
    document.body.appendChild(container);

    let root: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, <App initialState={initialState} />);
    });

    expect(container).toHaveTextContent("HYDRATED STUDY");
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });
});
