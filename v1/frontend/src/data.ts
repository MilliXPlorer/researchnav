import type { RoleConfig, UserSession } from "./types";

export const instituteNames = [
  "Institute of Computer Studies",
  "Institute of Health Sciences",
  "Institute of Business and Financial Management",
  "Institute of Arts and Sciences",
  "Institute of Criminal Justice Education",
  "Institute of Teacher Education",
] as const;

// New Google-authenticated accounts stay blocked until a coordinator activates an assignment.
export const defaultUserSession: UserSession = {
  email: "researcher@gmail.com",
  role: "researcher",
  accessStatus: "blocked",
  isAdmin: false,
  firstName: null,
  middleName: null,
  lastName: null,
  studentEmployeeId: null,
  displayName: "researcher@gmail.com",
  profilePhotoUrl: null,
};

export const roleConfigs: RoleConfig[] = [
  {
    id: "admin",
    label: "System Administrator",
    shortLabel: "Administrator",
    description: "Provision accounts and manage system-wide access.",
    nav: [
      "Access Requests",
      "Account Provisioning",
      "All Users",
      "Audit Logs",
      "Import Manuscript",
      "System Settings",
    ],
  },
  {
    id: "researcher",
    label: "Researcher",
    shortLabel: "Student researcher",
    description: "Track submissions, revisions, and related studies.",
    nav: ["Dashboard", "My Research", "Similarity Check"],
  },
  {
    id: "adviser",
    label: "Research Adviser",
    shortLabel: "Adviser",
    description: "Review advisee drafts and similarity alerts.",
    nav: [
      "Dashboard",
      "Assigned Research",
      "Title Review",
      "Manuscript Review",
      "Monitoring",
      "Review History",
      "Panelist Availability",
    ],
  },
  {
    id: "instructor",
    label: "Research Instructor",
    shortLabel: "Instructor",
    description: "Oversee class proposals and similarity trends.",
    nav: [
      "Dashboard",
      "Assigned Research",
      "Review Submissions",
      "Monitoring",
      "Review History",
    ],
  },
  {
    id: "panel",
    label: "Research Panel",
    shortLabel: "Panel member",
    description: "Read manuscripts and submit evaluations.",
    nav: [
      "Dashboard",
      "Assigned Defenses",
      "Defense Evaluation",
      "Availability Calendar",
      "Monitoring",
      "Evaluation History",
    ],
  },
  {
    id: "statistician",
    label: "Statistician",
    shortLabel: "Statistician",
    description: "Review methodology and issue sign-offs.",
    nav: [
      "Dashboard",
      "Assigned Research",
      "Statistical Review",
      "Monitoring",
      "Review History",
    ],
  },
  {
    id: "research_editor",
    label: "Research Editor",
    shortLabel: "Editor",
    description:
      "Review manuscript language, clarity, organization, and formatting.",
    nav: [
      "Dashboard",
      "Assigned Research",
      "Editorial Review",
      "Monitoring",
      "Review History",
    ],
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
    description:
      "Review references, citations, links, and source documentation.",
    nav: [
      "Dashboard",
      "Assignment Requests",
      "Assigned Research",
      "Reference Review",
      "Monitoring",
      "Review History",
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
      "Import Manuscript",
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
