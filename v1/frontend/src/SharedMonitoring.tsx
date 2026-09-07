import { useEffect, useState } from "react";
import { Button } from "./components";
import {
  getSharedMonitoring,
  listSharedMonitoringResearch,
  saveSharedMonitoring,
  verifySharedMonitoring,
  type SharedMonitoringData,
  type SharedMonitoringResearch,
} from "./api";
import type { Role } from "./types";

export default function SharedMonitoring({
  role,
  researchDocumentId,
}: {
  role: Role;
  researchDocumentId?: string | number;
}) {
  const [research, setResearch] = useState<SharedMonitoringResearch[]>([]);
  const [selected, setSelected] = useState(String(researchDocumentId ?? ""));
  const [data, setData] = useState<SharedMonitoringData | null>(null);
  const [stage, setStage] = useState<
    "before_proposal_defense" | "after_proposal_defense"
  >("before_proposal_defense");
  const [editing, setEditing] = useState("");
  const [activity, setActivity] = useState("");
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState("");
  const reload = () => {
    if (selected)
      void getSharedMonitoring(selected)
        .then(setData)
        .catch(() => setError("Monitoring could not be loaded."));
  };
  useEffect(() => {
    void listSharedMonitoringResearch().then((items) => {
      setResearch(items);
      if (items[0]) setSelected((current) => current || String(items[0].id));
    });
  }, []);
  useEffect(reload, [selected]);
  const current = data?.stages[stage];
  const readOnly = role === "researcher";
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    await saveSharedMonitoring(selected, {
      monitoring_stage: stage,
      activity_date: new Date().toISOString().slice(0, 10),
      activity,
      remarks: remarks || null,
      status: "completed",
      signature_status: "signed",
    });
    setEditing("");
    setActivity("");
    setRemarks("");
    reload();
  }
  return (
    <div className="workspace-content admin-sidebar-page">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">Shared monitoring</p>
          <h1>Research monitoring form</h1>
          <p>One shared form per research study and defense stage.</p>
        </div>
      </header>
      <label>
        Research study
        <select
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
        >
          <option value="">Select research</option>
          {research.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
      </label>
      <div className="row-actions">
        <Button
          variant={
            stage === "before_proposal_defense" ? "primary" : "secondary"
          }
          onClick={() => setStage("before_proposal_defense")}
        >
          Before Proposal Defense
        </Button>
        <Button
          variant={stage === "after_proposal_defense" ? "primary" : "secondary"}
          onClick={() => setStage("after_proposal_defense")}
        >
          After Proposal Defense
        </Button>
      </div>
      {error && (
        <p role="alert" className="admin-error">
          {error}
        </p>
      )}
      {current && (
        <section className="panel-card admin-data-card">
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Role / Section</th>
                  <th>Date</th>
                  <th>Activity</th>
                  <th>Remarks</th>
                  <th>Signature</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {current.sections.map((section) => (
                  <tr key={section.designation}>
                    <td>{section.designation}</td>
                    <td>{section.entry?.activity_date ?? "—"}</td>
                    <td>{section.entry?.activity ?? "Pending"}</td>
                    <td>{section.entry?.remarks ?? "—"}</td>
                    <td>
                      {section.entry?.status === "not_applicable"
                        ? "Not Applicable"
                        : (section.entry?.signature_status ?? "Unsigned")}
                    </td>
                    <td>
                      {!readOnly && (
                        <Button
                          variant="secondary"
                          onClick={() => setEditing(section.designation)}
                        >
                          Edit my section
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Verified by Research Instructor:{" "}
            {current.verified_at
              ? `Verified ${current.verified_at}`
              : "Pending verification"}
          </p>
          {role === "instructor" && (
            <Button
              onClick={() =>
                void verifySharedMonitoring(selected, stage).then(reload)
              }
            >
              Verify completed form
            </Button>
          )}
        </section>
      )}
      {editing && (
        <section className="panel-card">
          <form className="admin-inline-form" onSubmit={save}>
            <h2>{editing}</h2>
            <label>
              Activity
              <textarea
                required
                value={activity}
                onChange={(event) => setActivity(event.target.value)}
              />
            </label>
            <label>
              Remarks
              <textarea
                value={remarks}
                onChange={(event) => setRemarks(event.target.value)}
              />
            </label>
            <Button>Save and sign my section</Button>
          </form>
        </section>
      )}
    </div>
  );
}
