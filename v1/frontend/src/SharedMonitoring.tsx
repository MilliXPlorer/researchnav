import { Fragment, useEffect, useRef, useState } from "react";
import { Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { formatPhilippineDate } from "./dateTime";
import beforeProposalForm from "./form_templates/monitoring-before-proposal-1.png";
import afterProposalForm from "./form_templates/monitoring-after-proposal-1.png";
import beforeFinalForm from "./form_templates/monitoring-before-final-1.png";
import afterFinalForm from "./form_templates/monitoring-after-final-1.png";
import { Button } from "./components";
import { Modal } from "./Modal";
import {
  getSharedMonitoring,
  deleteSharedMonitoringEntry,
  listSharedMonitoringResearch,
  saveSharedMonitoring,
  uploadSharedMonitoringSignature,
  type SharedMonitoringData,
  type SharedMonitoringResearch,
} from "./api";

async function centeredSignature(signature: Blob): Promise<Blob> {
  try {
    const image = await createImageBitmap(signature);
    const source = document.createElement("canvas");
    source.width = image.width;
    source.height = image.height;
    const sourceContext = source.getContext("2d", { willReadFrequently: true });
    if (!sourceContext) return signature;
    sourceContext.drawImage(image, 0, 0);
    image.close();

    const pixels = sourceContext.getImageData(
      0,
      0,
      source.width,
      source.height,
    );
    let left = source.width;
    let right = -1;
    let top = source.height;
    let bottom = -1;
    for (let y = 0; y < source.height; y++) {
      for (let x = 0; x < source.width; x++) {
        const offset = (y * source.width + x) * 4;
        const visible = pixels.data[offset + 3] > 20;
        const dark =
          pixels.data[offset] < 245 ||
          pixels.data[offset + 1] < 245 ||
          pixels.data[offset + 2] < 245;
        if (!visible || !dark) continue;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
    if (right < left || bottom < top) return signature;

    const output = document.createElement("canvas");
    output.width = 600;
    output.height = 180;
    const outputContext = output.getContext("2d");
    if (!outputContext) return signature;
    const width = right - left + 1;
    const height = bottom - top + 1;
    const scale = Math.min(540 / width, 140 / height);
    const targetWidth = width * scale;
    const targetHeight = height * scale;
    outputContext.drawImage(
      source,
      left,
      top,
      width,
      height,
      (output.width - targetWidth) / 2,
      (output.height - targetHeight) / 2,
      targetWidth,
      targetHeight,
    );

    return (
      (await new Promise<Blob | null>((resolve) =>
        output.toBlob(resolve, "image/png"),
      )) ?? signature
    );
  } catch {
    return signature;
  }
}
import type { Role } from "./types";

export type DefenseType = "proposal" | "final";
type StageTiming = "before" | "after";
type MonitoringStage = `${StageTiming}_${DefenseType}_defense`;

/**
 * Compact sheet date ("2026-09-22 21:16") so overlay text fits the narrow
 * Date column identically on screen and in print (the full timestamp with
 * seconds overflows the printed cell and gets clipped).
 */
function sheetDate(entry: { saved_at?: string | null; activity_date?: string | null }) {
  const raw = (entry.saved_at ?? entry.activity_date ?? "").replace("T", " ");
  return raw.length > 16 ? raw.slice(0, 16) : raw;
}

export default function SharedMonitoring({
  role,
  researchDocumentId,
  embedded = false,
  readOnly: forceReadOnly = false,
  defenseType: controlledDefenseType,
}: {
  role: Role;
  researchDocumentId?: string | number;
  embedded?: boolean;
  readOnly?: boolean;
  defenseType?: DefenseType;
}) {
  const [research, setResearch] = useState<SharedMonitoringResearch[]>([]);
  const [selectedResearch, setSelectedResearch] = useState("");
  const selected =
    researchDocumentId !== undefined
      ? String(researchDocumentId)
      : selectedResearch;
  const [data, setData] = useState<SharedMonitoringData | null>(null);
  const [defenseType, setDefenseType] = useState<DefenseType>("proposal");
  const selectedDefenseType = controlledDefenseType ?? defenseType;
  const [stageTiming, setStageTiming] = useState<StageTiming>(
    role === "panel" ? "after" : "before",
  );
  const stage: MonitoringStage = `${stageTiming}_${selectedDefenseType}_defense`;
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<number | undefined>();
  const [savedSignatureEntryId, setSavedSignatureEntryId] = useState<
    number | undefined
  >();
  const [activity, setActivity] = useState("");
  const [remarks, setRemarks] = useState("");
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [hasDrawing, setHasDrawing] = useState(false);
  const signatureCanvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (embedded && researchDocumentId !== undefined) return;
    void listSharedMonitoringResearch()
      .then((items) => {
        setResearch(items);
        if (items[0])
          setSelectedResearch((current) => current || String(items[0].id));
      })
      .catch(() => setError("Research studies could not be loaded."));
  }, [embedded, researchDocumentId]);

  useEffect(() => {
    if (!selected) return;
    void getSharedMonitoring(selected)
      .then(setData)
      .catch(() => setError("Defense monitoring forms could not be loaded."));
  }, [selected]);

  const current = data?.stages[stage];
  const ownedEntries =
    current?.sections.flatMap(
      (section) => section.entries?.filter((entry) => entry.is_owned) ?? [],
    ) ?? [];
  const readOnly = forceReadOnly || role === "researcher";
  const canEditCurrent =
    !readOnly &&
    (data?.editable_stages?.includes(stage) ?? false) &&
    !(role === "panel" && stageTiming === "before") &&
    !(role === "statistician" && stageTiming === "after");
  function geometryFor(formStage: MonitoringStage) {
    // [block top %, block height %, header height % of block, data row
    // height % of block] measured pixel-perfect from each raster template so
    // overlay text lands mid-cell instead of drifting onto grid lines.
    if (formStage === "before_proposal_defense" || formStage === "before_final_defense") {
      return [
        [23.227, 16.273, 11.173, 11.103],
        [39.5, 14.409, 12.618, 12.483],
        [53.909, 14.455, 12.579, 12.489],
        [68.364, 12.682, 14.337, 14.277],
        [81.045, 8.955, 19.797, 20.051],
      ];
    }
    if (formStage === "after_proposal_defense") {
      return [
        [23.227, 10.864, 16.736, 16.653],
        [34.091, 7.227, 24.528, 25.157],
        [41.318, 7.227, 24.528, 25.157],
        [48.545, 7.182, 24.684, 25.105],
        [55.727, 7.227, 25.157, 24.948],
        [62.955, 7.227, 25.157, 24.948],
        [70.182, 7.227, 25.157, 24.948],
        [77.409, 7.227, 25.157, 24.948],
        [84.636, 7.182, 25.316, 24.895],
      ];
    }
    return [
      [23.227, 9.045, 20.101, 19.975],
      [32.273, 7.227, 25.157, 24.948],
      [39.5, 7.182, 25.316, 24.895],
      [46.682, 7.227, 25.786, 24.738],
      [53.909, 7.227, 25.157, 24.948],
      [61.136, 7.227, 25.157, 24.948],
      [68.364, 7.227, 25.157, 24.948],
      [75.591, 7.227, 25.157, 24.948],
      [82.818, 9.0, 20.202, 19.949],
    ];
  }

  function officialSheet(formStage: MonitoringStage, className = "") {
    const form = data?.stages[formStage];
    if (!form) return null;
    const geometry = geometryFor(formStage);

    return (
      <div className={`official-monitoring-sheet ${className}`}>
        <img
          className="official-monitoring-template"
          src={
            formStage === "before_proposal_defense"
              ? beforeProposalForm
              : formStage === "after_proposal_defense"
                ? afterProposalForm
                : formStage === "before_final_defense"
                  ? beforeFinalForm
                  : afterFinalForm
          }
          alt=""
        />
        <span className="official-monitoring-title">{data?.title}</span>
        <span className="official-monitoring-researchers">
          {data?.researchers.join(", ") || "Researchers pending"}
        </span>
        {form.sections.map((section, index) => {
          const placement = geometry[index];
          if (!placement) return null;
          const headerHeight = placement[2] ?? 0;
          const rowHeight = placement[3] ?? placement[2];
          const entries =
            section.entries ?? (section.entry ? [section.entry] : []);
          return (
            <div
              className="official-monitoring-entry"
              key={section.designation}
              style={{ top: `${placement[0]}%`, height: `${placement[1]}%` }}
            >
              <span
                className="official-monitoring-actor"
                style={{
                  top: `${headerHeight}%`,
                  height: `${100 - headerHeight}%`,
                }}
              >
                {section.assigned_actor_name ?? ""}
              </span>
              {entries.map((entry, rowIndex) => {
                const rowTop = headerHeight + rowIndex * rowHeight;
                const rowStyle = {
                  top: `${rowTop}%`,
                  height: `${rowHeight}%`,
                };
                return (
                  <Fragment key={entry.id}>
                    <span className="official-monitoring-date" style={rowStyle}>
                      {sheetDate(entry)}
                    </span>
                    <span
                      className="official-monitoring-activity"
                      style={rowStyle}
                    >
                      {entry.activity ?? ""}
                    </span>
                    <span
                      className="official-monitoring-remarks"
                      style={rowStyle}
                    >
                      {entry.remarks ?? ""}
                    </span>
                    {entry.signature_url && (
                      <img
                        className="official-monitoring-signature"
                        style={{
                          top: `${rowTop + 1}%`,
                          height: `${rowHeight - 2}%`,
                        }}
                        src={entry.signature_url}
                        alt={`${section.designation} signature`}
                      />
                    )}
                  </Fragment>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      let signature: File | Blob | null = signatureFile;
      if (!signature && hasDrawing && signatureCanvas.current) {
        signature = await new Promise<Blob | null>((resolve) =>
          signatureCanvas.current?.toBlob(resolve, "image/png"),
        );
      }
      if (!signature && !editingEntryId && !savedSignatureEntryId) {
        setError("Draw your signature or upload a PNG/JPG signature image.");
        return;
      }
      if (signature) {
        await uploadSharedMonitoringSignature(
          selected,
          stage,
          await centeredSignature(signature),
          editingEntryId,
        );
      }
      const next = await saveSharedMonitoring(selected, {
        entry_id: editingEntryId,
        signature_entry_id: signature ? undefined : savedSignatureEntryId,
        monitoring_stage: stage,
        activity,
        remarks: remarks || null,
        status: "completed",
        signature_status: "signed",
      });
      setData(next);
      setEditing(false);
      setEditingEntryId(undefined);
      setSavedSignatureEntryId(undefined);
      setActivity("");
      setRemarks("");
      setSignatureFile(null);
      clearSignature();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Your defense monitoring form entry could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  function openEntryEditor(createNew: boolean) {
    const latest = ownedEntries.at(-1);
    setEditingEntryId(createNew ? undefined : latest?.id);
    setSavedSignatureEntryId(
      createNew
        ? [...ownedEntries].reverse().find((entry) => entry.signature_url)?.id
        : undefined,
    );
    setActivity(createNew ? "" : (latest?.activity ?? ""));
    setRemarks(createNew ? "" : (latest?.remarks ?? ""));
    setSignatureFile(null);
    if (hasDrawing) clearSignature();
    setEditing(true);
    setDeleting(false);
  }

  function openDeleteEntry() {
    const latest = ownedEntries.at(-1);
    if (!latest) return;
    setEditingEntryId(latest.id);
    setEditing(false);
    setDeleting(true);
  }

  async function removeSelectedEntry() {
    if (!selected || !editingEntryId) return;
    const entry = ownedEntries.find((item) => item.id === editingEntryId);
    if (
      !entry ||
      !window.confirm(
        `Remove the entry saved ${entry.saved_at ?? entry.activity_date}?`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      setData(await deleteSharedMonitoringEntry(selected, entry.id));
      setDeleting(false);
      setEditingEntryId(undefined);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The defense monitoring form entry could not be removed.",
      );
    } finally {
      setBusy(false);
    }
  }

  function selectEntryToUpdate(entryId: number) {
    const entry = current?.sections
      .flatMap((section) => section.entries ?? [])
      .find((item) => item.id === entryId && item.is_owned);
    if (!entry) return;
    setEditingEntryId(entry.id);
    setActivity(entry.activity ?? "");
    setRemarks(entry.remarks ?? "");
    setSavedSignatureEntryId(undefined);
  }

  function signaturePoint(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * canvas.width,
      y: ((event.clientY - bounds.top) / bounds.height) * canvas.height,
    };
  }

  function startSignature(event: React.PointerEvent<HTMLCanvasElement>) {
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const point = signaturePoint(event);
    drawing.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    context.beginPath();
    context.moveTo(point.x, point.y);
  }

  function drawSignature(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const point = signaturePoint(event);
    context.strokeStyle = "#102019";
    context.lineWidth = 2.5;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineTo(point.x, point.y);
    context.stroke();
    setHasDrawing(true);
  }

  function clearSignature() {
    const canvas = signatureCanvas.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    drawing.current = false;
    setHasDrawing(false);
  }

  return (
    <div
      className={
        embedded
          ? "shared-monitoring-embedded"
          : "workspace-content admin-sidebar-page"
      }
    >
      {!embedded && (
        <header className="workspace-header">
          <div>
            <p className="eyebrow">Official defense records</p>
            <h1>Defense Monitoring Forms</h1>
            <p>
              One shared official form per research study and defense stage.
            </p>
          </div>
        </header>
      )}

      {!embedded && (
        <label>
          Research study
          <select
            value={selected}
            onChange={(event) => setSelectedResearch(event.target.value)}
          >
            <option value="">Select research</option>
            {research.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
      )}

      {embedded && data && (
        <div className="monitoring-study-heading monitoring-screen-heading">
          <div>
            <p className="eyebrow">Official defense monitoring form</p>
            <h3>{data.title}</h3>
          </div>
          <span>{data.researchers.join(", ") || "Researchers pending"}</span>
        </div>
      )}

      {controlledDefenseType === undefined && (
        <div className="monitoring-stage-tabs" aria-label="Defense type">
          <button
            type="button"
            aria-pressed={selectedDefenseType === "proposal"}
            className={selectedDefenseType === "proposal" ? "is-active" : ""}
            onClick={() => {
              setDefenseType("proposal");
              setStageTiming(role === "panel" ? "after" : "before");
              setEditing(false);
            }}
          >
            Proposal Defense
          </button>
          <button
            type="button"
            aria-pressed={selectedDefenseType === "final"}
            className={selectedDefenseType === "final" ? "is-active" : ""}
            onClick={() => {
              setDefenseType("final");
              setStageTiming(role === "panel" ? "after" : "before");
              setEditing(false);
            }}
          >
            Final Defense
          </button>
        </div>
      )}

      <div
        className="monitoring-stage-tabs"
        role="tablist"
        aria-label="Defense monitoring stage"
      >
        <button
          type="button"
          role="tab"
          aria-selected={stageTiming === "before"}
          className={stageTiming === "before" ? "is-active" : ""}
          onClick={() => {
            setStageTiming("before");
            setEditing(false);
          }}
        >
          Before {selectedDefenseType === "proposal" ? "Proposal" : "Final"}{" "}
          Defense
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={stageTiming === "after"}
          className={stageTiming === "after" ? "is-active" : ""}
          onClick={() => {
            setStageTiming("after");
            setEditing(false);
          }}
        >
          After {selectedDefenseType === "proposal" ? "Proposal" : "Final"}{" "}
          Defense
        </button>
      </div>

      {error && (
        <p role="alert" className="admin-error">
          {error}
        </p>
      )}

      {current && (
        <section className="monitoring-form-card monitoring-print-area">
          {officialSheet(stage, "monitoring-screen-sheet")}
          <div className="monitoring-print-pages" aria-hidden="true">
            {officialSheet(stage)}
          </div>
          <div className="monitoring-accessible-summary">
            <table className="monitoring-accessible-summary">
              <caption>Defense monitoring form entries</caption>
              <thead>
                <tr>
                  <th>Assigned role</th>
                  <th>Date</th>
                  <th>Activity</th>
                  <th>Remarks</th>
                  <th>Signature</th>
                </tr>
              </thead>
              <tbody>
                {current.sections.flatMap((section) => {
                  const entries =
                    section.entries ?? (section.entry ? [section.entry] : []);
                  if (entries.length === 0) {
                    return [
                      <tr key={section.designation}>
                        <td>{section.designation}</td>
                        <td>Not entered</td>
                        <td>Pending</td>
                        <td>Not entered</td>
                        <td>Unsigned</td>
                      </tr>,
                    ];
                  }
                  return entries.map((entry) => (
                    <tr key={entry.id}>
                      <td>{section.designation}</td>
                      <td>
                        {entry.saved_at ?? entry.activity_date ?? "Not entered"}
                      </td>
                      <td>{entry.activity ?? "Pending"}</td>
                      <td>{entry.remarks ?? "Not entered"}</td>
                      <td>{entry.signature_url ? "Signed" : "Unsigned"}</td>
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>

          <div className="monitoring-form-footer">
            <span>
              Verified by Research Instructor:{" "}
              {current.verified_at
                ? `Verified ${formatPhilippineDate(current.verified_at)}`
                : "Pending verification"}
            </span>
            <div className="row-actions">
              <Button
                type="button"
                variant="secondary"
                className="icon-button"
                aria-label="Print defense monitoring form"
                title="Print defense monitoring form"
                onClick={() => window.print()}
              >
                <Printer size={17} aria-hidden="true" />
              </Button>
              {canEditCurrent && (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    className="icon-button"
                    aria-label="Update my latest entry"
                    title="Update my latest entry"
                    disabled={busy}
                    onClick={() => openEntryEditor(false)}
                  >
                    <Pencil size={17} aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="icon-button"
                    aria-label="Add new defense monitoring entry"
                    title="Add new defense monitoring entry"
                    disabled={busy}
                    onClick={() => openEntryEditor(true)}
                  >
                    <Plus size={18} aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="icon-button"
                    aria-label="Remove defense monitoring entry"
                    title="Remove defense monitoring entry"
                    disabled={busy || ownedEntries.length === 0}
                    onClick={openDeleteEntry}
                  >
                    <Trash2 size={17} aria-hidden="true" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </section>
      )}

      {deleting && (
        <Modal
          label="Remove defense monitoring entry"
          onClose={() => setDeleting(false)}
          busy={busy}
        >
          <section className="monitoring-entry-editor monitoring-entry-modal">
            <div className="admin-inline-form">
              <div>
                <p className="eyebrow">Your assigned section</p>
                <h3>Remove defense monitoring entry</h3>
              </div>
              <label>
                Entry to remove
                <select
                  value={editingEntryId}
                  onChange={(event) =>
                    setEditingEntryId(Number(event.target.value))
                  }
                >
                  {ownedEntries.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.saved_at ?? entry.activity_date} -{" "}
                      {entry.activity || "Defense monitoring entry"}
                    </option>
                  ))}
                </select>
              </label>
              <div className="row-actions">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setDeleting(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="rust"
                  disabled={busy}
                  onClick={() => void removeSelectedEntry()}
                >
                  {busy ? "Removing..." : "Remove selected entry"}
                </Button>
              </div>
            </div>
          </section>
        </Modal>
      )}

      {editing && (
        <Modal
          label={
            editingEntryId
              ? "Update defense monitoring activity"
              : "Add defense monitoring activity"
          }
          onClose={() => setEditing(false)}
          busy={busy}
          size="large"
        >
          <section className="monitoring-entry-editor monitoring-entry-modal">
            <form
              className="admin-inline-form monitoring-entry-form"
              onSubmit={save}
            >
              <div>
                <p className="eyebrow">Your assigned section</p>
                <h3>
                  {editingEntryId
                    ? "Update defense monitoring activity"
                    : "Add defense monitoring activity"}
                </h3>
              </div>
              <p className="monitoring-save-time-note">
                Date and time are recorded automatically when you save and sign.
              </p>
              {editingEntryId && ownedEntries.length > 0 && (
                <label className="monitoring-entry-selector">
                  Entry to update
                  <select
                    value={editingEntryId}
                    onChange={(event) =>
                      selectEntryToUpdate(Number(event.target.value))
                    }
                  >
                    {ownedEntries.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.saved_at ?? entry.activity_date} -{" "}
                        {entry.activity || "Defense monitoring entry"}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Activity
                <textarea
                  required
                  value={activity}
                  onChange={(event) => setActivity(event.target.value)}
                  placeholder="Describe the review, consultation, or action completed."
                />
              </label>
              <label>
                Remarks
                <textarea
                  value={remarks}
                  onChange={(event) => setRemarks(event.target.value)}
                  placeholder="Optional notes or findings"
                />
              </label>
              <fieldset className="monitoring-signature-input">
                <legend>Your signature</legend>
                {!editingEntryId &&
                  ownedEntries.some((entry) => entry.signature_url) && (
                    <label>
                      Saved signature
                      <select
                        value={savedSignatureEntryId ?? ""}
                        onChange={(event) =>
                          setSavedSignatureEntryId(
                            event.target.value
                              ? Number(event.target.value)
                              : undefined,
                          )
                        }
                      >
                        <option value="">Draw or upload a new signature</option>
                        {ownedEntries
                          .filter((entry) => entry.signature_url)
                          .map((entry) => (
                            <option key={entry.id} value={entry.id}>
                              Use signature from{" "}
                              {entry.saved_at ?? entry.activity_date}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                {editingEntryId && !signatureFile && !hasDrawing && (
                  <p>
                    Your existing signature will be kept unless you provide a
                    new one.
                  </p>
                )}
                <p>
                  Sign in the box with a mouse or touch screen, or upload a
                  PNG/JPG signature image.
                </p>
                <canvas
                  ref={signatureCanvas}
                  width="480"
                  height="160"
                  aria-label="Draw your signature"
                  onPointerDown={startSignature}
                  onPointerMove={drawSignature}
                  onPointerUp={() => {
                    drawing.current = false;
                  }}
                  onPointerCancel={() => {
                    drawing.current = false;
                  }}
                />
                <div className="row-actions">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={clearSignature}
                  >
                    Clear drawing
                  </Button>
                  <label className="monitoring-signature-upload">
                    Upload signature image
                    <input
                      type="file"
                      accept="image/png,image/jpeg"
                      onChange={(event) =>
                        setSignatureFile(event.target.files?.[0] ?? null)
                      }
                    />
                  </label>
                </div>
                {signatureFile && <small>Selected: {signatureFile.name}</small>}
              </fieldset>
              <div className="row-actions monitoring-entry-actions">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </Button>
                <Button disabled={busy}>
                  {busy ? "Saving…" : "Save and sign"}
                </Button>
              </div>
            </form>
          </section>
        </Modal>
      )}
    </div>
  );
}
