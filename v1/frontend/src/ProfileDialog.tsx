import { useEffect, useRef, useState } from "react";
import { Camera, LogOut, UserRound } from "lucide-react";
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

const MAX_PROFILE_PHOTO_BYTES = 2 * 1024 * 1024;
const PROFILE_CROP_SIZE = 512;
const PROFILE_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type CropSource = { file: File; url: string };

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
  onOpenWorkspace,
  onLogout,
}: {
  session: UserSession;
  onSessionChange: (session: UserSession) => void;
  onClose: () => void;
  onOpenWorkspace?: () => void;
  onLogout?: () => Promise<void> | void;
}) {
  const [profile, setProfile] = useState(session);
  const [firstName, setFirstName] = useState(session.firstName ?? "");
  const [middleName, setMiddleName] = useState(session.middleName ?? "");
  const [lastName, setLastName] = useState(session.lastName ?? "");
  const [photo, setPhoto] = useState<File | null>(null);
  const [cropSource, setCropSource] = useState<CropSource | null>(null);
  const [cropReady, setCropReady] = useState(false);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropX, setCropX] = useState(0);
  const [cropY, setCropY] = useState(0);
  const [cropping, setCropping] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const cropImageRef = useRef<HTMLImageElement>(null);
  const cropCanvasRef = useRef<HTMLCanvasElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    void getOwnProfile()
      .then((current) => {
        if (!active) return;
        setProfile(current);
        setFirstName(current.firstName ?? "");
        setMiddleName(current.middleName ?? "");
        setLastName(current.lastName ?? "");
        setPhoto(null);
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
    return () => URL.revokeObjectURL(url);
  }, [cropSource]);

  const normalized = {
    first_name: optional(firstName),
    middle_name: optional(middleName),
    last_name: optional(lastName),
  };
  const detailsDirty =
    normalized.first_name !== profile.firstName ||
    normalized.middle_name !== profile.middleName ||
    normalized.last_name !== profile.lastName;
  const dirty = detailsDirty || photo !== null || cropSource !== null;

  function applyProfile(next: UserSession) {
    setProfile(next);
    setFirstName(next.firstName ?? "");
    setMiddleName(next.middleName ?? "");
    setLastName(next.lastName ?? "");
    setPhoto(null);
    onSessionChange(next);
  }

  function choosePhoto(file: File | null) {
    setError("");
    setPhoto(null);
    if (file === null) {
      setCropSource(null);
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

  function applyCrop() {
    const canvas = cropCanvasRef.current;
    if (!canvas || !cropSource || !cropReady) return;
    setCropping(true);
    canvas.toBlob(
      (blob) => {
        if (blob === null) {
          setError("The cropped profile photo could not be prepared.");
        } else {
          setPhoto(
            new File([blob], "profile-photo.jpg", {
              type: "image/jpeg",
              lastModified: Date.now(),
            }),
          );
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
        applyProfile(next);
      }
      if (photo) {
        next = await uploadOwnProfilePhoto(photo);
        applyProfile(next);
      }
      onClose();
    } catch (requestError) {
      setError(profileError(requestError, "Your profile could not be updated"));
    } finally {
      setSaving(false);
    }
  }

  async function removePhoto() {
    setSaving(true);
    setError("");
    try {
      applyProfile(await deleteOwnProfilePhoto());
      setConfirmRemove(false);
      setNotice("Your profile photo has been removed.");
    } catch (requestError) {
      setError(
        profileError(requestError, "Your profile photo could not be removed"),
      );
    } finally {
      setSaving(false);
    }
  }

  const roleLabel = roleConfigs.find((item) => item.id === profile.role)?.label;

  return (
    <Modal
      label="Edit profile"
      onClose={onClose}
      busy={saving}
      dirty={dirty}
      size="large"
    >
      <div className="profile-dialog">
        <header className="profile-dialog-header">
          <ProfileAvatar session={profile} className="profile-avatar-large" />
          <div>
            <p className="eyebrow">Authenticated account</p>
            <h2>Edit your profile</h2>
            <p>{profile.email}</p>
          </div>
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
                  onClick={() => void onLogout()}
                >
                  <LogOut /> Sign out
                </Button>
              </div>
            )}
          </div>
        ) : (
          <form className="profile-form" onSubmit={save}>
            <fieldset className="profile-photo-fieldset">
              <legend>Profile photo</legend>
              <div>
                <ProfileAvatar
                  session={profile}
                  className="profile-avatar-preview"
                />
                <label className="profile-photo-picker">
                  <Camera />
                  <span>{photo ? photo.name : "Choose photo"}</span>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                    onChange={(event) =>
                      choosePhoto(event.target.files?.[0] ?? null)
                    }
                    disabled={saving}
                  />
                </label>
                {profile.profilePhotoUrl && !confirmRemove && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setConfirmRemove(true)}
                    disabled={saving}
                  >
                    Remove photo
                  </Button>
                )}
              </div>
              <small>JPEG, PNG, or WebP. Maximum 2 MB.</small>
              {cropSource && (
                <section
                  className="profile-cropper"
                  aria-label="Crop profile photo"
                >
                  <div className="profile-crop-preview">
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
                  </div>
                  <div className="profile-crop-controls">
                    <label>
                      Zoom
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
                    <label>
                      Horizontal position
                      <input
                        type="range"
                        min="-100"
                        max="100"
                        value={cropX}
                        onChange={(event) =>
                          setCropX(Number(event.target.value))
                        }
                      />
                    </label>
                    <label>
                      Vertical position
                      <input
                        type="range"
                        min="-100"
                        max="100"
                        value={cropY}
                        onChange={(event) =>
                          setCropY(Number(event.target.value))
                        }
                      />
                    </label>
                  </div>
                  <div className="profile-crop-actions">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={cancelCrop}
                      disabled={cropping}
                    >
                      Cancel crop
                    </Button>
                    <Button
                      type="button"
                      onClick={applyCrop}
                      disabled={!cropReady || cropping}
                    >
                      {cropping ? "Applying…" : "Use cropped photo"}
                    </Button>
                  </div>
                </section>
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
                  <Button
                    type="button"
                    variant="rust"
                    onClick={() => void removePhoto()}
                    disabled={saving}
                  >
                    {saving ? "Removing…" : "Remove"}
                  </Button>
                </div>
              )}
            </fieldset>

            <div className="profile-name-grid">
              <label>
                First name
                <input
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  maxLength={100}
                />
              </label>
              <label>
                Middle name
                <input
                  value={middleName}
                  onChange={(event) => setMiddleName(event.target.value)}
                  maxLength={100}
                />
              </label>
              <label>
                Last name
                <input
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  maxLength={100}
                />
              </label>
            </div>

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
                <dt>Student or employee ID</dt>
                <dd>{profile.studentEmployeeId ?? "Not assigned"}</dd>
              </div>
              <div>
                <dt>Access status</dt>
                <dd>{profile.accessStatus}</dd>
              </div>
            </dl>

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
              {onOpenWorkspace && profile.accessStatus === "active" && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={onOpenWorkspace}
                >
                  Open workspace
                </Button>
              )}
              {onLogout && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void onLogout()}
                >
                  <LogOut /> Sign out
                </Button>
              )}
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                disabled={saving}
              >
                Close
              </Button>
              <Button
                type="submit"
                disabled={saving || !dirty || cropSource !== null}
              >
                {saving ? "Saving…" : "Save profile"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}

function optional(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function profileError(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  if (error.status === 401) return "Your session expired. Sign in again.";
  const validation = Object.values(error.fields ?? {}).flat()[0];
  return validation ?? `${fallback} (${error.code}).`;
}
