import type {
  DocumentFileResource,
  FeedbackResource,
  LaravelPaginatedResponse,
  MonitoringLogResource,
  NotificationResource,
  ResearchDocumentSummaryResource,
  ResearchPeopleResource,
  ResearchRevisionResource,
  RoleDashboard,
  TitleValidationResource,
} from "./api";

const mockResearch: ResearchDocumentSummaryResource = {
  id: -1001,
  submission_reference: "DEMO-RN-2026-001",
  submitted_by: "demo.researcher@example.invalid",
  category_id: 1,
  title:
    "ResearchNAV: A Web-Based Research Repository System with Automated Title Similarity Detection Using TF-IDF and Cosine Similarity (Demo)",
  normalized_title: null,
  abstract:
    "A demonstration research record used only when the live Researcher data service is unavailable.",
  keywords: "research repository, title similarity, ResearchNAV",
  publication_year: 2026,
  institution_name: "Tangub City Global College",
  institution_location: "Tangub City",
  academic_unit: "College of Computer Studies",
  degree_program: "Bachelor of Science in Information Technology",
  manuscript_date_label: "September 2026",
  abstract_provenance: null,
  research_stage: "ongoing",
  submission_status: "revision_required",
  archive_status: "not_archived",
  visibility: "private",
  submitted_at: "2026-08-22T09:30:00.000Z",
  approved_at: null,
  archived_at: null,
  authors: [
    {
      id: -1101,
      user_id: null,
      author_name: "Sample Researcher",
      author_order: 1,
      is_corresponding_author: true,
    },
  ],
  category: {
    id: 1,
    name: "Information Technology",
    slug: "information-technology",
    description: null,
    is_active: true,
  },
};

const mockSecondResearch: ResearchDocumentSummaryResource = {
  ...mockResearch,
  id: -1002,
  submission_reference: "DEMO-RN-2026-002",
  title: "Campus Service Announcement and Deadline Management System (Sample)",
  abstract: "A sample draft for demonstrating the Researcher submissions list.",
  research_stage: "title_proposal",
  submission_status: "draft",
  submitted_at: null,
};

export const mockResearcherSubmissions: LaravelPaginatedResponse<ResearchDocumentSummaryResource> =
  {
    data: [mockResearch, mockSecondResearch],
    links: { first: null, last: null, prev: null, next: null },
    meta: {
      current_page: 1,
      from: 1,
      last_page: 1,
      links: [],
      path: "/api/research",
      per_page: 25,
      to: 2,
      total: 2,
    },
  };

export const mockResearcherDashboard: RoleDashboard = {
  schema_version: 1,
  role: "researcher",
  sections: [
    {
      key: "my_drafts",
      state: "ready",
      total: 1,
      reason: null,
      items: [toDashboardItem(mockSecondResearch)],
    },
    {
      key: "my_revision_required",
      state: "ready",
      total: 1,
      reason: null,
      items: [toDashboardItem(mockResearch)],
    },
    {
      key: "my_under_review",
      state: "ready",
      total: 0,
      reason: null,
      items: [],
    },
    {
      key: "my_approved",
      state: "ready",
      total: 0,
      reason: null,
      items: [],
    },
  ],
};

export const mockResearcherFiles: DocumentFileResource[] = [
  {
    id: -1201,
    research_document_id: -1001,
    document_type: "revised_manuscript",
    version_number: 2,
    original_filename: "researchnav-revision-demo.pdf",
    file_extension: "pdf",
    mime_type: "application/pdf",
    file_size: 1_842_176,
    is_current: true,
    uploaded_at: "2026-09-01T08:15:00.000Z",
  },
];

export const mockResearcherRevisions: ResearchRevisionResource[] = [
  {
    id: -1301,
    research_document_id: -1001,
    requested_by: null,
    requester_name: "Sample Research Adviser",
    document_file_id: -1201,
    revision_number: 2,
    revision_remarks:
      "Clarify the participant-selection method and align the objectives with the evaluation criteria.",
    revision_status: "requested",
    lifecycle_status: "researcher_action_required",
    requested_at: "2026-08-29T14:00:00.000Z",
    submitted_at: null,
    resolved_at: null,
  },
];

export const mockResearcherValidations: TitleValidationResource[] = [
  {
    id: -1401,
    research_document_id: -1001,
    similarity_result_id: null,
    validated_by: null,
    validator_name: "Sample Research Adviser",
    similarity_result: null,
    validation_status: "approved",
    adviser_remarks: "Title may proceed subject to the documented revisions.",
    validated_at: "2026-08-24T10:20:00.000Z",
    created_at: "2026-08-23T08:00:00.000Z",
    updated_at: "2026-08-24T10:20:00.000Z",
  },
];

export const mockResearcherPeople: ResearchPeopleResource = {
  section: {
    id: -1501,
    name: "BSIT 4A (Sample)",
    academic_year: "2026-2027",
    instructor_name: "Sample Research Instructor",
  },
  reviewers: [
    { review_role: "adviser", name: "Sample Research Adviser" },
    { review_role: "statistician", name: "Sample Statistician" },
  ],
};

export const mockResearcherFeedback: FeedbackResource[] = [
  {
    id: -1601,
    research_document_id: -1001,
    user_id: null,
    document_file_id: null,
    comment:
      "Please explain the sampling procedure and show how the instrument maps to each research objective.",
    feedback_type: "revision_request",
    feedback_status: "open",
    reviewer_name: "Sample Research Adviser",
    researcher_acknowledged_at: null,
    researcher_addressed_at: null,
    researcher_action_remarks: null,
    created_at: "2026-08-29T14:00:00.000Z",
  },
];

export const mockResearcherMonitoring: MonitoringLogResource[] = [
  {
    id: -1701,
    research_document_id: -1001,
    performed_by: null,
    performed_by_name: "Sample Research Adviser",
    activity_type: "revision_requested",
    remarks: "Methodology revision requested after adviser review.",
    previous_status: "under_review",
    new_status: "revision_required",
    monitoring_status: "open",
    activity_date: "2026-08-29T14:00:00.000Z",
  },
  {
    id: -1702,
    research_document_id: -1001,
    performed_by: null,
    performed_by_name: "Sample Researcher",
    activity_type: "submitted",
    remarks: "Title proposal submitted for review.",
    previous_status: "draft",
    new_status: "submitted",
    monitoring_status: "completed",
    activity_date: "2026-08-22T09:30:00.000Z",
  },
];

export const mockResearcherActivity = {
  feedback: mockResearcherFeedback,
  revisions: mockResearcherRevisions,
  monitoring: mockResearcherMonitoring,
};

export const mockResearcherNotifications: NotificationResource[] = [
  {
    id: "mock:researcher:notification:001",
    type: "demo",
    event: "revision_requested",
    title: "Demo revision requested",
    message: "Sample Research Adviser requested methodology revisions.",
    details: "Open the live research record when the service is restored.",
    research_title: mockResearch.title,
    submission_reference: mockResearch.submission_reference ?? null,
    action_url: null,
    research_document_id: null,
    read_at: null,
    created_at: "2026-08-29T14:00:00.000Z",
  },
];

export function mockResearcherRecord(): ResearchDocumentSummaryResource {
  return mockResearch;
}

export function isResearcherMockEligible(
  error: unknown,
  allowMissingEndpoint = false,
) {
  if (error instanceof TypeError) return true;
  if (typeof error !== "object" || error === null || !("status" in error))
    return false;
  const status = Number((error as { status?: unknown }).status);
  return (
    status === 0 || status >= 500 || (allowMissingEndpoint && status === 404)
  );
}

function toDashboardItem(research: ResearchDocumentSummaryResource) {
  return {
    research_document_id: research.id,
    title: research.title,
    research_stage: research.research_stage,
    submission_status: research.submission_status,
    archive_status: research.archive_status,
    visibility: research.visibility,
    publication_year: research.publication_year,
    updated_at: research.submitted_at,
  };
}
