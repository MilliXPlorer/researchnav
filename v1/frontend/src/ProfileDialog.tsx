import { useEffect, useId, useRef, useState } from "react";
import { Camera, LogOut, Minus, Move, Plus, UserRound } from "lucide-react";
import {
  ApiError,
  deleteOwnProfilePhoto,
  getOwnProfile,
  updateOwnProfile,
  uploadOwnProfilePhoto,
} from "./api";
import { Button } from "./components";
import { roleConfigs } from "./data";
import { Modal } from "./Modal";
import type { UserSession } from "./types";
import { useDialogFocus } from "./useDialogFocus";

const MAX_PROFILE_PHOTO_BYTES = 2 * 1024 * 1024;
const PROFILE_CROP_SIZE = 512;
const PROFILE_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type CropSource = { file: File; url: string };
type PhotoChange =
  { kind: "replace"; file: File; previewUrl: string } | { kind: "remove" };

export function ProfileAvatar({
  session,
  className = "",
}: {
  session: UserSession;
  className?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  const initials = [session.firstName, session.lastName]
    .filter(Boolean)
    .map((name) => name?.[0]?.toUpperCase())
    .join("")
    .slice(0, 2);

  return (
    <span className={`profile-avatar ${className}`.trim()} aria-hidden="true">
      {session.profilePhotoUrl && failedUrl !== session.profilePhotoUrl ? (
        <img
          src={session.profilePhotoUrl}
          alt=""
          onError={() => setFailedUrl(session.profilePhotoUrl)}
        />
      ) : initials ? (
        <strong>{initials}</strong>
      ) : (
        <UserRound />
      )}
    </span>
  );
}

export default function ProfileDialog({
  session,
  onSessionChange,
  onClose,
  onLogout,
}: {
  session: UserSession;
  onSessionChange: (session: UserSession) => void;
  onClose: () => void;
  onLogout?: () => Promise<void> | void;
}) {
  const [profile, setProfile] = useState(session);
  const [firstName, setFirstName] = useState(session.firstName ?? "");
  const [middleName, setMiddleName] = useState(session.middleName ?? "");
  const [lastName, setLastName] = useState(session.lastName ?? "");
  const [photoChange, setPhotoChange] = useState<PhotoChange | null>(null);
  const [cropSource, setCropSource] = useState<CropSource | null>(null);
  const [cropReady, setCropReady] = useState(false);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropX, setCropX] = useState(0);
  const [cropY, setCropY] = useState(0);
  const [cropping, setCropping] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const cropImageRef = useRef<HTMLImageElement>(null);
  const cropCanvasRef = useRef<HTMLCanvasElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const choosePhotoButtonRef = useRef<HTMLButtonElement>(null);
  const cropHeadingId = useId();
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(
    null,
  );
  const [cropDialogRef, handleCropKeyDown] =
    useDialogFocus<HTMLDivElement>(cancelCrop);

  useEffect(() => {
    let active = true;
    void getOwnProfile()
      .then((current) => {
        if (!active) return;
        setProfile(current);
        setFirstName(current.firstName ?? "");
        setMiddleName(current.middleName ?? "");
        setLastName(current.lastName ?? "");
        setPhotoChange(null);
        onSessionChange(current);
      })
      .catch((requestError: unknown) => {
        if (active)
          setError(
            profileError(requestError, "Profile details are unavailable"),
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [onSessionChange]);

  useEffect(() => {
    const image = cropImageRef.current;
    const canvas = cropCanvasRef.current;
    if (!cropSource || !cropReady || !image || !canvas) return;

    const context = canvas.getContext("2d");
    if (!context || image.naturalWidth < 1 || image.naturalHeight < 1) return;

    const baseScale = Math.max(
      PROFILE_CROP_SIZE / image.naturalWidth,
      PROFILE_CROP_SIZE / image.naturalHeight,
    );
    const scale = baseScale * cropZoom;
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    const overflowX = Math.max(0, (width - PROFILE_CROP_SIZE) / 2);
    const overflowY = Math.max(0, (height - PROFILE_CROP_SIZE) / 2);
    const left = (PROFILE_CROP_SIZE - width) / 2 - (cropX / 100) * overflowX;
    const top = (PROFILE_CROP_SIZE - height) / 2 - (cropY / 100) * overflowY;

    context.clearRect(0, 0, PROFILE_CROP_SIZE, PROFILE_CROP_SIZE);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, PROFILE_CROP_SIZE, PROFILE_CROP_SIZE);
    context.drawImage(image, left, top, width, height);
  }, [cropReady, cropSource, cropX, cropY, cropZoom]);

  useEffect(() => {
    if (!cropSource) return;
    const url = cropSource.url;
    const choosePhotoButton = choosePhotoButtonRef.current;
    return () => {
      URL.revokeObjectURL(url);
      requestAnimationFrame(() => choosePhotoButton?.focus());
    };
  }, [cropSource]);

  useEffect(() => {
    if (photoChange?.kind !== "replace") return;
    const url = photoChange.previewUrl;
    return () => URL.revokeObjectURL(url);
  }, [photoChange]);

  const normalized = {
    first_name: optional(firstName),
    middle_name: optional(middleName),
    last_name: optional(lastName),
  };
  const detailsDirty =
    normalized.first_name !== profile.firstName ||
    normalized.middle_name !== profile.middleName ||
    normalized.last_name !== profile.lastName;
  const dirty = detailsDirty || photoChange !== null || cropSource !== null;
  const profileIsValid = [firstName, middleName, lastName].every(
    isValidProfileName,
  );

  function applyProfile(next: UserSession) {
    setProfile(next);
    setFirstName(next.firstName ?? "");
    setMiddleName(next.middleName ?? "");
    setLastName(next.lastName ?? "");
    setPhotoChange(null);
    onSessionChange(next);
  }

  function choosePhoto(file: File | null) {
    setError("");
    if (file === null) {
      return;
    }
    if (!PROFILE_PHOTO_TYPES.has(file.type)) {
      setCropSource(null);
      setError("Choose a JPEG, PNG, or WebP profile photo.");
      return;
    }
    if (file.size > MAX_PROFILE_PHOTO_BYTES) {
      setCropSource(null);
      setError("The profile photo must not exceed 2 MB.");
      return;
    }
    setCropReady(false);
    setCropZoom(1);
    setCropX(0);
    setCropY(0);
    setCropSource({ file, url: URL.createObjectURL(file) });
  }

  function cancelCrop() {
    setCropSource(null);
    setCropReady(false);
    if (photoInputRef.current) photoInputRef.current.value = "";
  }

  function handleCropDialogKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    // Keep Escape scoped to this nested crop dialog instead of opening the
    // parent dialog's unsaved-changes confirmation.
    event.stopPropagation();
    handleCropKeyDown(event);
  }

  function openPhotoPicker() {
    photoInputRef.current?.click();
  }

  function moveCrop(deltaX: number, deltaY: number) {
    const image = cropImageRef.current;
    const workspace = cropCanvasRef.current;
    if (
      !image ||
      !workspace ||
      image.naturalWidth < 1 ||
      image.naturalHeight < 1
    )
      return;
    const baseScale = Math.max(
      PROFILE_CROP_SIZE / image.naturalWidth,
      PROFILE_CROP_SIZE / image.naturalHeight,
    );
    const width = image.naturalWidth * baseScale * cropZoom;
    const height = image.naturalHeight * baseScale * cropZoom;
    const overflowX = Math.max(0, (width - PROFILE_CROP_SIZE) / 2);
    const overflowY = Math.max(0, (height - PROFILE_CROP_SIZE) / 2);
    const displayScale =
      PROFILE_CROP_SIZE / workspace.getBoundingClientRect().width;
    setCropX((current) =>
      overflowX === 0
        ? 0
        : Math.max(
            -100,
            Math.min(100, current - (deltaX * displayScale * 100) / overflowX),
          ),
    );
    setCropY((current) =>
      overflowY === 0
        ? 0
        : Math.max(
            -100,
            Math.min(100, current - (deltaY * displayScale * 100) / overflowY),
          ),
    );
  }

  function applyCrop() {
    const canvas = cropCanvasRef.current;
    if (!canvas || !cropSource || !cropReady) return;
    setCropping(true);
    canvas.toBlob(
      (blob) => {
        if (blob === null) {
          setError("The cropped profile photo could not be prepared.");
        } else {
          const file = new File([blob], "profile-photo.jpg", {
            type: "image/jpeg",
            lastModified: Date.now(),
          });
          setPhotoChange({
            kind: "replace",
            file,
            previewUrl: URL.createObjectURL(file),
          });
          setCropSource(null);
          setNotice("Crop applied. Save your profile to upload it.");
        }
        setCropping(false);
      },
      "image/jpeg",
      0.9,
    );
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      let next = profile;
      if (detailsDirty) {
        next = await updateOwnProfile(normalized);
      }
      if (photoChange?.kind === "replace") {
        next = await uploadOwnProfilePhoto(photoChange.file);
      } else if (photoChange?.kind === "remove") {
        next = await deleteOwnProfilePhoto();
      }
      applyProfile(next);
      onClose();
    } catch (requestError) {
      setError(profileError(requestError, "Your profile could not be updated"));
    } finally {
      setSaving(false);
    }
  }

  function removePhoto() {
    setPhotoChange({ kind: "remove" });
    setConfirmRemove(false);
    setNotice("Photo marked for removal. Save your profile to apply it.");
  }

  const roleLabel = roleConfigs.find((item) => item.id === profile.role)?.label;

  return (
    <Modal
      label="Edit profile"
      onClose={onClose}
      busy={saving}
      dirty={dirty}
      size="large"
      className="profile-modal-panel"
    >
      <div className="profile-dialog">
        <header className="profile-dialog-header">
          <p className="eyebrow">Authenticated account</p>
          <h2>Edit your profile</h2>
          <p>Update your personal information and profile photo.</p>
        </header>

        {loading ? (
          <div>
            <p className="profile-loading" aria-busy="true">
              Loading profile details…
            </p>
            {onLogout && (
              <div className="profile-dialog-actions">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setConfirmSignOut(true)}
                >
                  <LogOut /> Sign out
                </Button>
              </div>
            )}
          </div>
        ) : (
          <form className="profile-form" onSubmit={save}>
            <div className="profile-form-main">
              <section
                className="profile-photo-card"
                aria-labelledby="profile-photo-title"
              >
                <h3 id="profile-photo-title">Profile photo</h3>
                <span
                  className="profile-avatar profile-avatar-preview"
                  aria-hidden="true"
                >
                  {photoChange?.kind === "replace" ? (
                    <img src={photoChange.previewUrl} alt="" />
                  ) : photoChange?.kind === "remove" ? (
                    <strong>
                      {[profile.firstName, profile.lastName]
                        .filter(Boolean)
                        .map((name) => name?.[0]?.toUpperCase())
                        .join("")
                        .slice(0, 2)}
                    </strong>
                  ) : profile.profilePhotoUrl ? (
                    <img src={profile.profilePhotoUrl} alt="" />
                  ) : (
                    <UserRound />
                  )}
                </span>
                <strong className="profile-display-name">
                  {[firstName, middleName, lastName]
                    .filter(Boolean)
                    .join(" ") || profile.displayName}
                </strong>
                <button
                  ref={choosePhotoButtonRef}
                  type="button"
                  className="profile-photo-picker"
                  onClick={openPhotoPicker}
                  disabled={saving}
                >
                  <Camera />
                  <span>Choose new photo</span>
                </button>
                <input
                  ref={photoInputRef}
                  className="profile-photo-input"
                  type="file"
                  aria-label="Profile photo file"
                  accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                  onChange={(event) =>
                    choosePhoto(event.target.files?.[0] ?? null)
                  }
                  disabled={saving}
                />
                {(profile.profilePhotoUrl || photoChange?.kind === "replace") &&
                  photoChange?.kind !== "remove" &&
                  !confirmRemove && (
                    <button
                      type="button"
                      className="profile-remove-action"
                      onClick={() => setConfirmRemove(true)}
                      disabled={saving}
                    >
                      Remove photo
                    </button>
                  )}
                <small>JPEG, PNG, or WebP · Maximum 2 MB.</small>
                {cropSource && (
                  <div className="profile-crop-backdrop">
                    <div
                      ref={cropDialogRef}
                      className="profile-crop-dialog"
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby={cropHeadingId}
                      onKeyDown={handleCropDialogKeyDown}
                    >
                      <header className="profile-crop-header">
                        <h2 id={cropHeadingId}>Adjust profile photo</h2>
                      </header>
                      <div
                        className="profile-crop-workspace"
                        onPointerDown={(event) => {
                          event.currentTarget.setPointerCapture(
                            event.pointerId,
                          );
                          dragRef.current = {
                            pointerId: event.pointerId,
                            x: event.clientX,
                            y: event.clientY,
                          };
                        }}
                        onPointerMove={(event) => {
                          const drag = dragRef.current;
                          if (!drag || drag.pointerId !== event.pointerId)
                            return;
                          moveCrop(
                            event.clientX - drag.x,
                            event.clientY - drag.y,
                          );
                          dragRef.current = {
                            pointerId: event.pointerId,
                            x: event.clientX,
                            y: event.clientY,
                          };
                        }}
                        onPointerUp={(event) => {
                          if (dragRef.current?.pointerId === event.pointerId)
                            dragRef.current = null;
                        }}
                        onPointerCancel={() => {
                          dragRef.current = null;
                        }}
                        tabIndex={0}
                        role="application"
                        aria-label="Profile photo crop area. Use arrow keys to reposition."
                        onKeyDown={(event) => {
                          const step = event.shiftKey ? 10 : 3;
                          if (event.key === "ArrowLeft") moveCrop(-step, 0);
                          else if (event.key === "ArrowRight")
                            moveCrop(step, 0);
                          else if (event.key === "ArrowUp") moveCrop(0, -step);
                          else if (event.key === "ArrowDown") moveCrop(0, step);
                          else return;
                          event.preventDefault();
                        }}
                      >
                        <img
                          ref={cropImageRef}
                          src={cropSource.url}
                          alt=""
                          aria-hidden="true"
                          data-testid="profile-crop-source"
                          onLoad={() => setCropReady(true)}
                        />
                        <canvas
                          ref={cropCanvasRef}
                          width={PROFILE_CROP_SIZE}
                          height={PROFILE_CROP_SIZE}
                          aria-label="Cropped profile photo preview"
                        />
                        <span
                          className="profile-crop-shade"
                          aria-hidden="true"
                        />
                      </div>
                      <p className="profile-crop-helper">
                        <Move aria-hidden="true" /> Drag to reposition
                      </p>
                      <div className="profile-crop-zoom">
                        <button
                          type="button"
                          aria-label="Zoom out"
                          onClick={() =>
                            setCropZoom((value) => Math.max(1, value - 0.1))
                          }
                        >
                          <Minus />
                        </button>
                        <label>
                          <span>Zoom</span>
                          <input
                            type="range"
                            min="1"
                            max="3"
                            step="0.05"
                            value={cropZoom}
                            onChange={(event) =>
                              setCropZoom(Number(event.target.value))
                            }
                          />
                        </label>
                        <button
                          type="button"
                          aria-label="Zoom in"
                          onClick={() =>
                            setCropZoom((value) => Math.min(3, value + 0.1))
                          }
                        >
                          <Plus />
                        </button>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        className="profile-crop-choose"
                        aria-label="Choose another photo"
                        onClick={openPhotoPicker}
                      >
                        <Camera /> Choose another photo
                      </Button>
                      <footer className="profile-crop-actions">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={cancelCrop}
                          disabled={cropping}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          onClick={applyCrop}
                          disabled={!cropReady || cropping}
                        >
                          {cropping ? "Applying…" : "Use photo"}
                        </Button>
                      </footer>
                    </div>
                  </div>
                )}
                {confirmRemove && (
                  <div className="profile-remove-confirm" role="alert">
                    <span>Remove your current profile photo?</span>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setConfirmRemove(false)}
                      disabled={saving}
                    >
                      Keep photo
                    </Button>
                    <Button type="button" variant="rust" onClick={removePhoto}>
                      Remove
                    </Button>
                  </div>
                )}
              </section>

              <div className="profile-information">
                <section aria-labelledby="personal-information-title">
                  <h3 id="personal-information-title">Personal information</h3>
                  <p>
                    Your name appears across your ResearchNAV account and
                    activity.
                  </p>
                  <div className="profile-name-grid">
                    <label>
                      First name
                      <input
                        value={firstName}
                        onChange={(event) => setFirstName(event.target.value)}
                        maxLength={100}
                        aria-invalid={!isValidProfileName(firstName)}
                      />
                    </label>
                    <label>
                      Middle name
                      <input
                        value={middleName}
                        onChange={(event) => setMiddleName(event.target.value)}
                        maxLength={100}
                        aria-invalid={!isValidProfileName(middleName)}
                      />
                    </label>
                    <label>
                      Last name
                      <input
                        value={lastName}
                        onChange={(event) => setLastName(event.target.value)}
                        maxLength={100}
                        aria-invalid={!isValidProfileName(lastName)}
                      />
                    </label>
                  </div>
                </section>
                <section aria-labelledby="account-information-title">
                  <h3 id="account-information-title">Account information</h3>
                  <dl className="profile-readonly">
                    <div>
                      <dt>Email</dt>
                      <dd>{profile.email}</dd>
                    </div>
                    <div>
                      <dt>Assigned role</dt>
                      <dd>{roleLabel ?? profile.role}</dd>
                    </div>
                    <div>
                      <dt>Access status</dt>
                      <dd>
                        <span className="profile-status-dot" />
                        {profile.accessStatus}
                      </dd>
                    </div>
                  </dl>
                  <p className="profile-account-note">
                    Account information is managed by the system administrator.
                  </p>
                </section>
              </div>
            </div>

            {notice && (
              <p className="admin-success" role="status">
                {notice}
              </p>
            )}
            {error && (
              <p className="admin-error" role="alert">
                {error}
              </p>
            )}

            <div className="profile-dialog-actions">
              {onLogout && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setConfirmSignOut(true)}
                >
                  <LogOut /> Sign out
                </Button>
              )}
              <Button
                type="submit"
                className="profile-save-button"
                disabled={
                  saving || !dirty || !profileIsValid || cropSource !== null
                }
              >
                {saving ? "Saving…" : "Save profile"}
              </Button>
            </div>
          </form>
        )}
        {confirmSignOut && onLogout && (
          <div
            className="profile-signout-confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="profile-signout-title"
            aria-describedby="profile-signout-description"
          >
            <div>
              <p className="eyebrow">Please confirm</p>
              <h3 id="profile-signout-title">Sign out of ResearchNAV?</h3>
              <p id="profile-signout-description">
                {dirty
                  ? "Your unsaved profile changes will be discarded."
                  : "You will need to sign in again to continue."}
              </p>
              <div className="modal-actions">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setConfirmSignOut(false)}
                >
                  Cancel
                </Button>
                <Button type="button" variant="rust" onClick={onLogout}>
                  <LogOut /> Sign out
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function optional(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function isValidProfileName(value: string): boolean {
  return (
    value.length <= 100 &&
    Array.from(value).every((character) => {
      const code = character.charCodeAt(0);
      return code > 31 && code !== 127;
    })
  );
}

function profileError(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  if (error.status === 401) return "Your session expired. Sign in again.";
  const validation = Object.values(error.fields ?? {}).flat()[0];
  return validation ?? `${fallback} (${error.code}).`;
}
