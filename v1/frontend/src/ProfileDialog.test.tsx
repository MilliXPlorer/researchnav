import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProfileDialog from "./ProfileDialog";
import type { UserSession } from "./types";

const session: UserSession = {
  email: "ada@example.test",
  role: "researcher",
  accessStatus: "active",
  isAdmin: false,
  firstName: "Ada",
  middleName: null,
  lastName: "Lovelace",
  studentEmployeeId: "2026-001",
  displayName: "Ada Lovelace",
  profilePhotoUrl: null,
};

beforeEach(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:profile-photo"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () =>
      ({
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        drawImage: vi.fn(),
        fillStyle: "",
      }) as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
    (callback) => callback(new Blob(["cropped"], { type: "image/jpeg" })),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ProfileDialog", () => {
  it("loads and updates editable profile details", async () => {
    const updated = {
      ...session,
      firstName: "Augusta Ada",
      displayName: "Augusta Ada Lovelace",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: session })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: updated })));
    vi.stubGlobal("fetch", fetchMock);
    const onSessionChange = vi.fn();
    const onClose = vi.fn();

    render(
      <ProfileDialog
        session={session}
        onSessionChange={onSessionChange}
        onClose={onClose}
      />,
    );

    expect(await screen.findByLabelText("First name")).toHaveValue("Ada");
    fireEvent.change(screen.getByLabelText("First name"), {
      target: { value: "Augusta Ada" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/profile",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          first_name: "Augusta Ada",
          middle_name: null,
          last_name: "Lovelace",
        }),
      }),
    );
    expect(onSessionChange).toHaveBeenLastCalledWith(updated);
  });

  it("uploads a validated profile photo as multipart form data", async () => {
    const withPhoto = {
      ...session,
      profilePhotoUrl: "/api/profile/photo/new-version",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: session })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: withPhoto })));
    vi.stubGlobal("fetch", fetchMock);
    const onClose = vi.fn();

    render(
      <ProfileDialog
        session={session}
        onSessionChange={vi.fn()}
        onClose={onClose}
      />,
    );

    await screen.findByLabelText("First name");
    const photo = new File(["image"], "avatar.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText(/Choose photo/), {
      target: { files: [photo] },
    });
    expect(
      screen.getByRole("region", { name: "Crop profile photo" }),
    ).toBeInTheDocument();
    const cropSource = screen.getByTestId("profile-crop-source");
    Object.defineProperty(cropSource, "naturalWidth", { value: 800 });
    Object.defineProperty(cropSource, "naturalHeight", { value: 600 });
    fireEvent.load(cropSource);
    const useCrop = screen.getByRole("button", { name: "Use cropped photo" });
    await waitFor(() => expect(useCrop).toBeEnabled());
    fireEvent.click(useCrop);
    await waitFor(() =>
      expect(screen.getByText("profile-photo.jpg")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const uploadInit = fetchMock.mock.calls[1][1] as RequestInit;
    expect(fetchMock.mock.calls[1][0]).toBe("/api/profile/photo");
    expect(uploadInit.body).toBeInstanceOf(FormData);
    const uploaded = (uploadInit.body as FormData).get("photo") as File;
    expect(uploaded.name).toBe("profile-photo.jpg");
    expect(uploaded.type).toBe("image/jpeg");
    expect(onClose).toHaveBeenCalledOnce();
  });
});
