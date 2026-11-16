import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useState } from "react";
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
  function selectPhoto(
    type = "image/png",
    name = "avatar.png",
    contents = "image",
  ) {
    const photo = new File([contents], name, { type });
    fireEvent.change(screen.getByLabelText("Profile photo file"), {
      target: { files: [photo] },
    });
    return photo;
  }

  function readyCrop() {
    const cropSource = screen.getByTestId("profile-crop-source");
    Object.defineProperty(cropSource, "naturalWidth", { value: 800 });
    Object.defineProperty(cropSource, "naturalHeight", { value: 600 });
    fireEvent.load(cropSource);
  }

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
    expect(screen.getByRole("button", { name: "Save profile" })).toBeDisabled();
    expect(
      screen.getByRole("heading", { name: "Edit your profile" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Personal information")).toBeInTheDocument();
    expect(screen.getByText("Account information")).toBeInTheDocument();
    expect(screen.getByText("Assigned role")).toBeInTheDocument();
    expect(screen.getByText("Access status")).toBeInTheDocument();
    expect(
      screen.queryByText("Student or employee ID"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open workspace" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Close" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Close Edit profile" }),
    ).toBeInTheDocument();

    const profileCard = screen.getByRole("region", { name: "Profile photo" });
    const accountInformation = screen
      .getByRole("heading", { name: "Account information" })
      .closest("section");
    const profileMain = profileCard.parentElement;
    expect(profileMain).toHaveClass("profile-form-main");
    expect(Array.from(profileMain?.children ?? [])).toEqual([
      profileCard,
      expect.objectContaining({ className: "profile-information" }),
    ]);
    expect(
      profileCard.querySelector(".profile-avatar-preview"),
    ).toBeInTheDocument();
    expect(within(profileCard).getByText("Ada Lovelace")).toBeInTheDocument();
    expect(
      within(profileCard).getByRole("button", { name: "Choose new photo" }),
    ).toBeInTheDocument();
    expect(
      within(profileCard).getByText("JPEG, PNG, or WebP · Maximum 2 MB."),
    ).toBeInTheDocument();
    expect(
      within(profileCard).queryByText(session.email),
    ).not.toBeInTheDocument();
    expect(
      within(profileCard).queryByText(session.accessStatus),
    ).not.toBeInTheDocument();
    expect(accountInformation).toBeInTheDocument();
    expect(
      Array.from(accountInformation?.querySelectorAll("dt") ?? []).map(
        (label) => label.textContent,
      ),
    ).toEqual(["Email", "Assigned role", "Access status"]);
    expect(
      accountInformation?.querySelector(".profile-status-dot"),
    ).toBeInTheDocument();
    expect(
      within(accountInformation as HTMLElement).getByText(
        "Account information is managed by the system administrator.",
      ),
    ).toBeInTheDocument();
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

  it("disables Save profile for invalid editable names", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ user: session }))),
    );
    render(
      <ProfileDialog
        session={session}
        onSessionChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const firstName = await screen.findByLabelText("First name");
    fireEvent.change(firstName, { target: { value: "A".repeat(101) } });

    expect(firstName).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Save profile" })).toBeDisabled();
  });

  it("disables Save profile while a profile update is saving", async () => {
    let completeUpdate: ((response: Response) => void) | undefined;
    const update = new Promise<Response>((resolve) => {
      completeUpdate = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: session })))
      .mockReturnValueOnce(update);
    vi.stubGlobal("fetch", fetchMock);
    const onClose = vi.fn();
    render(
      <ProfileDialog
        session={session}
        onSessionChange={vi.fn()}
        onClose={onClose}
      />,
    );

    const firstName = await screen.findByLabelText("First name");
    fireEvent.change(firstName, { target: { value: "Augusta" } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    completeUpdate?.(new Response(JSON.stringify({ user: session })));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
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
    selectPhoto();
    const cropDialog = screen.getByRole("dialog", {
      name: "Adjust profile photo",
    });
    expect(
      within(cropDialog).queryByRole("button", { name: /close/i }),
    ).not.toBeInTheDocument();
    expect(within(cropDialog).getByRole("heading")).toHaveTextContent(
      "Adjust profile photo",
    );
    readyCrop();
    const useCrop = screen.getByRole("button", { name: "Use photo" });
    await waitFor(() => expect(useCrop).toBeEnabled());
    fireEvent.click(useCrop);
    await waitFor(() =>
      expect(
        screen
          .getByRole("region", { name: "Profile photo" })
          .querySelector("img"),
      ).toHaveAttribute("src", "blob:profile-photo"),
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

  it("cancels cropping without changing the preview and restores focus", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ user: session }))),
    );
    render(
      <ProfileDialog
        session={session}
        onSessionChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const choose = await screen.findByRole("button", {
      name: "Choose new photo",
    });
    selectPhoto();
    expect(
      screen.getByRole("dialog", { name: "Adjust profile photo" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.queryByRole("dialog", { name: "Adjust profile photo" }),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(choose).toHaveFocus());
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:profile-photo");
    expect(screen.queryByText("profile-photo.jpg")).not.toBeInTheDocument();
  });

  it("treats Escape as Cancel without closing its parent and ignores crop backdrop clicks", async () => {
    const onClose = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ user: session }))),
    );
    render(
      <ProfileDialog
        session={session}
        onSessionChange={vi.fn()}
        onClose={onClose}
      />,
    );
    await screen.findByRole("button", { name: "Choose new photo" });
    selectPhoto();
    const dialog = screen.getByRole("dialog", { name: "Adjust profile photo" });
    fireEvent.mouseDown(dialog.parentElement as HTMLElement);
    expect(dialog).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(
      screen.queryByRole("dialog", { name: "Adjust profile photo" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("traps crop focus, applies only a local preview, and omits the account ID", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ user: session })));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <ProfileDialog
        session={session}
        onSessionChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await screen.findByRole("button", { name: "Choose new photo" });
    expect(
      screen.queryByText("Student or employee ID"),
    ).not.toBeInTheDocument();
    selectPhoto();
    readyCrop();
    const dialog = screen.getByRole("dialog", { name: "Adjust profile photo" });
    const cropArea = within(dialog).getByRole("application");
    const usePhoto = within(dialog).getByRole("button", { name: "Use photo" });
    usePhoto.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(cropArea).toHaveFocus();
    fireEvent.click(usePhoto);
    await waitFor(() =>
      expect(
        screen
          .getByRole("region", { name: "Profile photo" })
          .querySelector("img"),
      ).toHaveAttribute("src", "blob:profile-photo"),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Save profile" })).toBeEnabled();
  });

  it.each([
    ["image/jpeg", "avatar.jpg"],
    ["image/png", "avatar.png"],
    ["image/webp", "avatar.webp"],
  ])("accepts %s files for cropping", async (type, name) => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ user: session }))),
    );
    render(
      <ProfileDialog
        session={session}
        onSessionChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await screen.findByRole("button", { name: "Choose new photo" });
    selectPhoto(type, name);
    expect(
      screen.getByRole("dialog", { name: "Adjust profile photo" }),
    ).toBeInTheDocument();
  });

  it("rejects invalid type and oversized photos without replacing the saved avatar", async () => {
    const saved = { ...session, profilePhotoUrl: "/api/profile/photo/saved" };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ user: saved }))),
    );
    render(
      <ProfileDialog
        session={saved}
        onSessionChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await screen.findByRole("button", { name: "Choose new photo" });
    selectPhoto("application/pdf", "avatar.pdf");
    expect(screen.getByRole("alert")).toHaveTextContent("JPEG, PNG, or WebP");
    expect(
      screen
        .getByRole("region", { name: "Profile photo" })
        .querySelector("img"),
    ).toHaveAttribute("src", "/api/profile/photo/saved");
    selectPhoto("image/png", "large.png", "x".repeat(2 * 1024 * 1024 + 1));
    expect(screen.getByRole("alert")).toHaveTextContent("must not exceed 2 MB");
    expect(
      screen.queryByRole("dialog", { name: "Adjust profile photo" }),
    ).not.toBeInTheDocument();
  });

  it("replaces a pending source and cleans up its object URL", async () => {
    vi.mocked(URL.createObjectURL)
      .mockReturnValueOnce("blob:first")
      .mockReturnValueOnce("blob:second");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ user: session }))),
    );
    render(
      <ProfileDialog
        session={session}
        onSessionChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await screen.findByRole("button", { name: "Choose new photo" });
    selectPhoto();
    selectPhoto("image/webp", "second.webp");
    await waitFor(() =>
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:first"),
    );
    expect(screen.getByTestId("profile-crop-source")).toHaveAttribute(
      "src",
      "blob:second",
    );
  });

  it("keeps removal local until Save profile", async () => {
    const saved = { ...session, profilePhotoUrl: "/api/profile/photo/saved" };
    const removed = { ...saved, profilePhotoUrl: null };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: saved })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: removed })));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <ProfileDialog
        session={saved}
        onSessionChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await screen.findByRole("button", { name: "Choose new photo" });
    fireEvent.click(screen.getByRole("button", { name: "Remove photo" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/profile/photo",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
  });

  it("restores the saved photo after discarding a pending removal", async () => {
    const saved = { ...session, profilePhotoUrl: "/api/profile/photo/saved" };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ user: saved })));
    vi.stubGlobal("fetch", fetchMock);

    function DialogHarness() {
      const [open, setOpen] = useState(true);
      return open ? (
        <ProfileDialog
          session={saved}
          onSessionChange={vi.fn()}
          onClose={() => setOpen(false)}
        />
      ) : (
        <button type="button" onClick={() => setOpen(true)}>
          Reopen profile
        </button>
      );
    }

    render(<DialogHarness />);
    await screen.findByRole("button", { name: "Choose new photo" });
    fireEvent.click(screen.getByRole("button", { name: "Remove photo" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Close Edit profile" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    fireEvent.click(screen.getByRole("button", { name: "Reopen profile" }));

    const photoCard = await screen.findByRole("region", {
      name: "Profile photo",
    });
    expect(photoCard.querySelector("img")).toHaveAttribute(
      "src",
      "/api/profile/photo/saved",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps Sign out at the start of the footer actions", async () => {
    const onLogout = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ user: session }))),
    );
    render(
      <ProfileDialog
        session={session}
        onSessionChange={vi.fn()}
        onClose={vi.fn()}
        onLogout={onLogout}
      />,
    );

    await screen.findByLabelText("First name");
    const signOut = screen.getByRole("button", { name: "Sign out" });
    const footerActions = signOut.closest(".profile-dialog-actions");
    expect(footerActions).toHaveClass("profile-dialog-actions");
    expect(footerActions?.firstElementChild).toBe(signOut);
    fireEvent.click(signOut);
    expect(onLogout).not.toHaveBeenCalled();
    expect(
      screen.getByRole("alertdialog", { name: "Sign out of ResearchNAV?" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onLogout).not.toHaveBeenCalled();

    fireEvent.click(signOut);
    fireEvent.click(
      within(
        screen.getByRole("alertdialog", {
          name: "Sign out of ResearchNAV?",
        }),
      ).getByRole("button", { name: "Sign out" }),
    );
    expect(onLogout).toHaveBeenCalledOnce();
  });

  it("prompts before discarding unsaved edits from the main X", async () => {
    const onClose = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ user: session }))),
    );
    render(
      <ProfileDialog
        session={session}
        onSessionChange={vi.fn()}
        onClose={onClose}
      />,
    );
    await screen.findByLabelText("First name");
    fireEvent.change(screen.getByLabelText("First name"), {
      target: { value: "Changed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Close Edit profile" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      "unsaved changes",
    );
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close Edit profile" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
