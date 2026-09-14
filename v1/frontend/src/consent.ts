/**
 * Terms of use and Data Privacy consent that must be accepted before a user may
 * sign in. Interview requirements for this system asked specifically for a
 * scrollable clause that has to be read and agreed to before login proceeds.
 *
 * Bump `CONSENT_VERSION` whenever the wording below changes materially; a stored
 * acceptance of an older version stops counting and the notice is shown again.
 */
export const CONSENT_VERSION = "2026-05-01";

const CONSENT_STORAGE_KEY = "researchnav.consent";

export type ConsentRecord = {
  version: string;
  acceptedAt: string;
};

export const CONSENT_SECTIONS: Array<{ heading: string; body: string }> = [
  {
    heading: "1. Purpose of the system",
    body: "ResearchNAV is the institutional research repository of Tangub City Global College. It stores research titles, abstracts, keywords, author names, manuscripts, and review records so that research output can be preserved, retrieved, monitored, and checked for closely related titles.",
  },
  {
    heading: "2. Information that is collected",
    body: "When you sign in with Google, the system receives and stores your institutional email address and the account identifier Google uses to confirm it. If you submit research, the system also stores the metadata and files you upload, the review comments recorded about them, and a log of the actions taken on those records.",
  },
  {
    heading: "3. How your information is used",
    body: "Your account information is used only to identify you, to assign your role, and to control which records you may read or change. Research records and review activity are used for repository management, submission monitoring, revision tracking, and title similarity checking. Your information is not sold and is not released for advertising.",
  },
  {
    heading: "4. Who can see your records",
    body: "Guests may search titles, abstracts, and metadata of approved research without an account. Manuscript downloads and all submission, review, and management features require a signed-in account with an assigned role. Advisers, instructors, panels, the Research Office, and administrators can see the records assigned to them for review, together with the activity recorded against those records.",
  },
  {
    heading: "5. Similarity results are advisory",
    body: "Title similarity is computed with TF-IDF and cosine similarity. A score of 70% or higher is flagged for adviser review. A flag is a prompt for human checking; it is not a finding of plagiarism, and it does not by itself approve or reject a research title. Final academic judgement always rests with your adviser and the authorised personnel of the institution.",
  },
  {
    heading: "6. Your rights under the Data Privacy Act of 2012",
    body: "Republic Act No. 10173 gives you the right to be informed about the processing of your personal data, to access it, to correct inaccurate entries, to object to processing, and to request erasure or blocking where the law allows it. To exercise any of these rights, contact the Research Office of Tangub City Global College.",
  },
  {
    heading: "7. Retention and security",
    body: "Research records are retained as institutional academic records. Access is restricted by role, sessions expire after a period of inactivity, and manuscript files are held in private storage that is not served as public web content.",
  },
  {
    heading: "8. Your responsibilities",
    body: "Use the repository only for legitimate academic purposes. Do not share your account, do not attempt to reach records outside your assigned role, and do not redistribute manuscripts you obtain through the system without the permission of their authors and the institution.",
  },
];

function isConsentRecord(value: unknown): value is ConsentRecord {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.version === "string" &&
    typeof candidate.acceptedAt === "string"
  );
}

/** Reads a stored acceptance, ignoring anything that is absent or outdated. */
export function readStoredConsent(): ConsentRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isConsentRecord(parsed)) return null;
    return parsed.version === CONSENT_VERSION ? parsed : null;
  } catch {
    // Unreadable or disabled storage must never block sign-in permanently;
    // treat it as "not yet accepted" so the notice is simply shown again.
    return null;
  }
}

export function hasAcceptedCurrentConsent(): boolean {
  return readStoredConsent() !== null;
}

export function storeConsentAcceptance(
  acceptedAt: string = new Date().toISOString(),
): ConsentRecord {
  const record: ConsentRecord = { version: CONSENT_VERSION, acceptedAt };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(record));
    } catch {
      // Acceptance still applies to this session even if it cannot be persisted.
    }
  }
  return record;
}
