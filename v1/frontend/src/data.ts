import type { RoleConfig, UserSession } from "./types";

// New Google-authenticated accounts stay blocked until a coordinator activates an assignment.
export const defaultUserSession: UserSession = {
  email: "researcher@gmail.com",
  role: "researcher",
  accessStatus: "blocked",
  isAdmin: false,
};

export const roleConfigs: RoleConfig[] = [
  {
    id: "admin",
    label: "System Administrator",
    shortLabel: "Administrator",
    description: "Provision coordinators and manage system-wide access.",
    nav: [
      "System Overview",
      "Access Requests",
      "Coordinator Accounts",
      "All Users",
      "Audit Logs",
      "System Settings",
    ],
  },
  {
    id: "researcher",
    label: "Researcher",
    shortLabel: "Student researcher",
    description: "Track submissions, revisions, and related studies.",
    nav: [
      "My Dashboard",
      "My Submissions",
      "New Submission",
      "Similarity Check",
      "Related Studies",
    ],
  },
  {
    id: "adviser",
    label: "Research Adviser",
    shortLabel: "Adviser",
    description: "Review advisee drafts and similarity alerts.",
    nav: [
      "My Advisees",
      "Pending Reviews",
      "Similarity Alerts",
      "Feedback History",
    ],
  },
  {
    id: "instructor",
    label: "Research Instructor",
    shortLabel: "Instructor",
    description: "Oversee class proposals and similarity trends.",
    nav: [
      "My Sections",
      "Title Proposals",
      "Similarity Overview",
      "Class Reports",
    ],
  },
  {
    id: "panel",
    label: "Research Panel",
    shortLabel: "Panel member",
    description: "Read manuscripts and submit evaluations.",
    nav: [
      "Defense Schedule",
      "Assigned Manuscripts",
      "Evaluation Form",
      "Panel History",
    ],
  },
  {
    id: "statistician",
    label: "Statistician",
    shortLabel: "Statistician",
    description: "Review methodology and issue sign-offs.",
    nav: ["Review Queue", "Methodology Checklist", "Sign-offs Issued"],
  },
  {
    id: "coordinator",
    label: "Research Coordinator",
    shortLabel: "Coordinator",
    description: "Monitor the program, schedules, and duplicate flags.",
    nav: [
      "Program Overview",
      "Schedules",
      "Duplicate Flags",
      "Adviser Load",
      "Account Roles",
      "Reports",
    ],
  },
  {
    id: "librarian",
    label: "Librarian",
    shortLabel: "Librarian",
    description: "Catalog and validate repository metadata.",
    nav: [
      "Archiving Queue",
      "Repository Catalog",
      "Metadata Standards",
      "Retention & Compliance",
    ],
  },
  {
    id: "research-office",
    label: "Research Office",
    shortLabel: "Research Office personnel",
    description: "Manage compliance, reports, roles, and privacy.",
    nav: [
      "Institutional Overview",
      "Compliance Review",
      "User & Role Management",
      "Reports & Exports",
      "Data Privacy Log",
    ],
  },
  {
    id: "academics",
    label: "Academics",
    shortLabel: "Faculty member",
    description: "Search, save, and cross-reference studies.",
    nav: ["Search", "My Library", "Browse by Category"],
  },
];
